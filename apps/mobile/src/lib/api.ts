import axios from 'axios';
import { router } from 'expo-router';
import { useAuthStore } from '../store/authStore';

//  Types 

interface QueuedRequest {
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}

//  Refresh state 

let isRefreshing = false;
let waitQueue: QueuedRequest[] = [];

const drainQueue = (token: string | null, err?: unknown): void => {
  waitQueue.forEach((req) => (token ? req.resolve(token) : req.reject(err)));
  waitQueue = [];
};

//  Axios instance

export const api = axios.create({
  // EventMerge Next.js backend (token-authed /api/v1 surface for the scanner).
  // Set EXPO_PUBLIC_API_BASE_URL to your deployed host; on a device use your
  // machine's LAN IP (e.g. http://192.168.x.x:3000/api/v1), not localhost.
  baseURL: process.env['EXPO_PUBLIC_API_BASE_URL'] ?? 'http://localhost:3000/api/v1',
  // Serverless/Neon cold starts can take ~30 s; cap requests so the UI surfaces
  // a real error instead of spinning forever when the socket stalls.
  timeout: 30_000,
});

//  Request interceptor — inject Bearer token

api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

//  Response interceptor — refresh on 401, retry once 

type AxiosConfigWithRetry = (typeof api.defaults) & { _retry?: boolean };

api.interceptors.response.use(
  (res) => res,
  async (err: unknown) => {
    const axiosErr = err as {
      response?: { status: number };
      config: AxiosConfigWithRetry;
    };
    const original = axiosErr.config;

    if (axiosErr.response?.status !== 401 || original._retry) {
      return Promise.reject(err);
    }

    original._retry = true;

    // If a refresh is already in-flight, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        waitQueue.push({
          resolve: (token) => {
            original.headers = original.headers ?? {};
            (original.headers as Record<string, string>).Authorization = `Bearer ${token}`;
            resolve(api(original));
          },
          reject,
        });
      });
    }

    isRefreshing = true;
    try {
      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) throw new Error('No refresh token');

      const res = await api.post<{
        data: { accessToken: string; refreshToken?: string };
      }>('/auth/refresh', { refreshToken });
      const newToken = res.data.data.accessToken;
      useAuthStore.getState().setTokens({
        accessToken: newToken,
        refreshToken: res.data.data.refreshToken,
      });

      drainQueue(newToken);
      original.headers = original.headers ?? {};
      (original.headers as Record<string, string>).Authorization = `Bearer ${newToken}`;
      return api(original);
    } catch (refreshErr) {
      drainQueue(null, refreshErr);
      useAuthStore.getState().clearAuth();
      router.replace('/(auth)/login');
      return Promise.reject(refreshErr);
    } finally {
      isRefreshing = false;
    }
  },
);
