import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Toast from 'react-native-toast-message';
import { startNetworkListener, stopNetworkListener } from '@/src/lib/networkListener';
import { initQueue } from '@/src/lib/offlineQueue';

export default function RootLayout() {
  useEffect(() => {
    initQueue().catch((err) => console.error('[OfflineQueue] Init failed', err));
    startNetworkListener();
    return stopNetworkListener;
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
      <Toast />
    </GestureHandlerRootView>
  );
}
