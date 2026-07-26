import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineQueue } from '../../lib/offlineQueue';

//  Props 

interface Props {
  /** Hides the banner when true; shows + polls when false */
  isOnline: boolean;
  /** Absolute `top` offset — caller computes this from safe-area + stats bar height */
  top: number;
}

// ─── Component 

export default function OfflineBanner({ isOnline, top }: Props) {
  const [count, setCount] = useState(0);

  // Poll pending count every 5 s while offline
  useEffect(() => {
    if (isOnline) {
      setCount(0);
      return;
    }

    let mounted = true;

    const refresh = async () => {
      try {
        const n = await offlineQueue.getPendingCount();
        if (mounted) setCount(n);
      } catch {
        // Non-critical — leave count unchanged
      }
    };

    void refresh();
    const id = setInterval(() => void refresh(), 5_000);

    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [isOnline]);

  if (isOnline) return null;

  const label =
    count > 0
      ? `Offline — scans are being queued (${count} pending)`
      : 'Offline — scans are being queued';

  return (
    <View style={[styles.banner, { top } as ViewStyle]}>
      <Ionicons name="cloud-offline-outline" size={13} color="white" />
      <Text style={styles.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ─── Styles 

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#f59e0b', // amber-500
    paddingVertical: 6,
  },
  text: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
});
