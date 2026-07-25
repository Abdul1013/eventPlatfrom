import { useEffect } from "react";
import { Tabs } from "expo-router";
import { Redirect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuthStore } from "@/src/store/authStore";
import { api } from "@/src/lib/api";
import type { AuthUser } from "@eventmerge/types";

export default function AppLayout() {
  const { accessToken, setAuth, clearAuth } = useAuthStore();

  // Silently refresh the access token on mount to extend the session
  useEffect(() => {
    if (!accessToken) return;
    api
      .post<{ data: { accessToken: string; user: AuthUser } }>("/auth/refresh")
      .then((res) => {
        setAuth({
          accessToken: res.data.data.accessToken,
          user: res.data.data.user,
        });
      })
      .catch(() => clearAuth());
    // Run once on mount — intentionally omitting deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guard: kick unauthenticated users to login
  if (!accessToken) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#4F46E5",
        tabBarInactiveTintColor: "#9CA3AF",
        tabBarStyle: {
          backgroundColor: "white",
          borderTopColor: "#E5E7EB",
          elevation: 0,
          shadowOpacity: 0,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="scanner"
        options={{
          title: "Scan",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="scan-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Stats",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
