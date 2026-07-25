import { Redirect } from 'expo-router';
import { useAuthStore } from '@/src/store/authStore';

export default function Index() {
  const { accessToken } = useAuthStore();
  return <Redirect href={accessToken ? '/(app)/scanner' : '/(auth)/login'} />;
}
