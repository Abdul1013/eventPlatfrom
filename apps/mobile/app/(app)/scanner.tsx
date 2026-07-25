import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  DeviceEventEmitter,
  Dimensions,
  FlatList,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import * as Network from 'expo-network';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/src/lib/api';
import { useScannerStore } from '@/src/store/scannerStore';
import { OPEN_EVENT_SELECTOR, SCANNER_STATS_REFRESH } from '@/src/lib/networkListener';
import type { ScanResultCode, CheckInStats } from '@eventmerge/types';
import ScanResultOverlay, {
  type ScanResultData,
} from '@/src/components/scanner/ScanResultOverlay';
import OfflineBanner from '@/src/components/scanner/OfflineBanner';

// ─── Layout constants

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CUTOUT_SIZE = 260;
const CUTOUT_LEFT = (SCREEN_W - CUTOUT_SIZE) / 2;

// ─── Types

interface EventItem {
  id: string;
  title: string;
  status: string;
}

// ─── ScannerScreen
export default function ScannerScreen() {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();

  // ── Store
  const { activeEventId, activeEventTitle, setActiveEvent, enqueueScann } = useScannerStore();

  // ── Scan state
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResult, setScanResult] = useState<ScanResultCode | null>(null);
  const [scanData, setScanData] = useState<ScanResultData | undefined>(undefined);

  // ── Network state
  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    let mounted = true;
    const check = async () => {
      try {
        const state = await Network.getNetworkStateAsync();
        if (mounted) setIsOnline(!!state.isConnected && state.isInternetReachable !== false);
      } catch {
        if (mounted) setIsOnline(false);
      }
    };
    void check();
    const id = setInterval(() => void check(), 5_000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  // ── Stats bar
  const [stats, setStats] = useState<CheckInStats | null>(null);
  useEffect(() => {
    if (!activeEventId) { setStats(null); return; }
    let mounted = true;
    const fetchStats = async () => {
      try {
        const res = await api.get<{ data: CheckInStats }>(`/checkin/stats/${activeEventId}`);
        if (mounted) setStats(res.data.data);
      } catch { /* non-critical */ }
    };
    void fetchStats();
    const id = setInterval(() => void fetchStats(), 30_000);
    return () => { mounted = false; clearInterval(id); };
  }, [activeEventId]);

  // ── Scanning line animation
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(scanLineAnim, {
        toValue: CUTOUT_SIZE - 2,
        duration: 1500,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [scanLineAnim]);

  // ── Event selector modal (replaces @gorhom/bottom-sheet)
  const [modalVisible, setModalVisible] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [eventsLoading, setEventsLoading] = useState(false);

  const openEventSelector = useCallback(async () => {
    setEventsLoading(true);
    setModalVisible(true);
    try {
      // API returns a paginated envelope: { data: { events, total, page, limit } }
      const res = await api.get<{ data: { events: EventItem[] } }>(
        '/events?status=ONGOING&limit=50',
      );
      setEvents(res.data.data?.events ?? []);
    } catch {
      setEvents([]);
    } finally {
      setEventsLoading(false);
    }
  }, []);

  // ── Cross-tab event listeners
  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(OPEN_EVENT_SELECTOR, () =>
      void openEventSelector(),
    );
    return () => sub.remove();
  }, [openEventSelector]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(SCANNER_STATS_REFRESH, () => {
      if (!activeEventId) return;
      void api
        .get<{ data: CheckInStats }>(`/checkin/stats/${activeEventId}`)
        .then((res) => setStats(res.data.data))
        .catch(() => { /* non-critical */ });
    });
    return () => sub.remove();
  }, [activeEventId]);

  const handleSelectEvent = useCallback(
    (event: EventItem) => {
      setActiveEvent(event.id, event.title);
      setStats(null);
      setModalVisible(false);
    },
    [setActiveEvent],
  );

  // ── Scan handler
  const handleBarcodeScan = useCallback(
    async ({ data: token }: BarcodeScanningResult) => {
      if (isProcessing || !activeEventId) return;
      setIsProcessing(true);

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (!isOnline) {
        enqueueScann({ token, eventId: activeEventId, deviceInfo: 'EventMerge Staff App' });
        setScanResult('QUEUED');
        setScanData({ message: 'Will sync when connectivity returns' });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }

      try {
        const res = await api.post<{ data: { result: string } & ScanResultData }>(
          '/checkin/scan',
          { token, deviceInfo: 'EventMerge Staff App' },
        );
        const { result, ...rest } = res.data.data;
        const typedResult = result as ScanResultCode;
        setScanResult(typedResult);
        setScanData(rest);
        if (typedResult === 'VALID') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (typedResult === 'ALREADY_USED') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
      } catch {
        setScanResult('INVALID_TOKEN');
        setScanData({ message: 'Could not reach the server' });
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    },
    [isProcessing, isOnline, activeEventId, enqueueScann],
  );

  const handleOverlayDismiss = useCallback(() => {
    setScanResult(null);
    setScanData(undefined);
    setTimeout(() => setIsProcessing(false), 2_000);
  }, []);

  // ── Camera permission states
  if (!permission) {
    return (
      <View style={styles.centeredScreen}>
        <Text style={styles.permissionText}>Requesting camera access…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centeredScreen}>
        <Ionicons name="camera-outline" size={56} color="#6366f1" />
        <Text style={styles.permissionHeading}>Camera Access Required</Text>
        <Text style={styles.permissionSubtext}>
          The scanner needs camera permission to read QR codes.
        </Text>
        <TouchableOpacity style={styles.permissionBtn} onPress={() => void requestPermission()}>
          <Text style={styles.permissionBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.permissionBtn, styles.settingsBtn]}
          onPress={() => void Linking.openSettings()}
        >
          <Text style={[styles.permissionBtnText, { color: '#6366f1' }]}>Open Settings</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Layout values
  const statsBarH = insets.top + 36;
  const cutoutTop = statsBarH + (SCREEN_H - statsBarH - CUTOUT_SIZE) / 2 - 40;

  return (
    <View style={styles.root}>

      {/* ── Full-screen camera */}
      <CameraView
        style={StyleSheet.absoluteFillObject}
        onBarcodeScanned={isProcessing ? undefined : handleBarcodeScan}
        barCodeTypes={['qr']}
      />

      {/* ── Offline banner */}
      <OfflineBanner isOnline={isOnline} top={statsBarH} />

      {/* ── Four dark overlays */}
      <View style={[styles.overlay, { top: statsBarH, left: 0, right: 0, height: cutoutTop - statsBarH }]} />
      <View style={[styles.overlay, { top: cutoutTop + CUTOUT_SIZE, left: 0, right: 0, bottom: 0 }]} />
      <View style={[styles.overlay, { top: cutoutTop, left: 0, width: CUTOUT_LEFT, height: CUTOUT_SIZE }]} />
      <View style={[styles.overlay, { top: cutoutTop, left: CUTOUT_LEFT + CUTOUT_SIZE, right: 0, height: CUTOUT_SIZE }]} />

      {/* Cutout border */}
      <View style={[styles.cutoutBorder, { top: cutoutTop, left: CUTOUT_LEFT, width: CUTOUT_SIZE, height: CUTOUT_SIZE }]} />

      {/* ── Animated scan line */}
      <Animated.View
        style={[
          styles.scanLine,
          { top: cutoutTop, left: CUTOUT_LEFT, width: CUTOUT_SIZE, transform: [{ translateY: scanLineAnim }] },
        ]}
      />

      {/* ── Labels below cutout */}
      <View style={[styles.labelWrap, { top: cutoutTop + CUTOUT_SIZE + 20 }]}>
        <Text style={styles.label}>Point at QR code</Text>
        <TouchableOpacity
          onPress={() => void openEventSelector()}
          activeOpacity={0.75}
          style={{ marginTop: 8, paddingHorizontal: 20 }}
        >
          {activeEventTitle ? (
            <Text style={styles.eventNameLabel} numberOfLines={1}>
              Scanning for: {activeEventTitle}
            </Text>
          ) : (
            <Text style={styles.noEventLabel}>No event selected — tap to select</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Stats mini-bar */}
      <View style={[styles.statsBar, { paddingTop: insets.top, height: statsBarH }]}>
        {activeEventId ? (
          <TouchableOpacity style={styles.statsBarInner} onPress={() => void openEventSelector()} activeOpacity={0.75}>
            <Ionicons name="qr-code-outline" size={13} color="white" style={{ marginRight: 6 }} />
            {stats ? (
              <Text style={styles.statsText} numberOfLines={1}>
                <Text style={styles.statsCheckedIn}>{stats.checkedIn}</Text>
                {` / ${stats.totalTickets} checked in · `}
                <Text style={styles.statsRate}>{stats.checkInRate.toFixed(0)}%</Text>
              </Text>
            ) : (
              <Text style={styles.statsText} numberOfLines={1}>{activeEventTitle}</Text>
            )}
            <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.statsBarInner} onPress={() => void openEventSelector()} activeOpacity={0.75}>
            <Ionicons name="calendar-outline" size={13} color="rgba(255,255,255,0.65)" style={{ marginRight: 6 }} />
            <Text style={[styles.statsText, { color: 'rgba(255,255,255,0.65)' }]}>Tap to select an event</Text>
            <Ionicons name="chevron-down" size={13} color="rgba(255,255,255,0.4)" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Scan result overlay */}
      <ScanResultOverlay result={scanResult} data={scanData} onDismiss={handleOverlayDismiss} />

      {/* ── Event selector modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setModalVisible(false)} />
        <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 8 }]}>
          {/* Handle */}
          <View style={styles.sheetHandle} />

          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Select Event</Text>
            <Text style={styles.sheetSub}>Ongoing events available for check-in</Text>
          </View>

          {eventsLoading ? (
            <View style={styles.sheetEmpty}>
              <Text style={styles.sheetEmptyText}>Loading events…</Text>
            </View>
          ) : events.length === 0 ? (
            <View style={styles.sheetEmpty}>
              <Ionicons name="calendar-outline" size={40} color="#9ca3af" />
              <Text style={styles.sheetEmptyText}>No ongoing events found</Text>
            </View>
          ) : (
            <FlatList<EventItem>
              data={events}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.sheetList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.eventRow, item.id === activeEventId && styles.eventRowActive]}
                  onPress={() => handleSelectEvent(item)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventRowTitle} numberOfLines={1}>{item.title}</Text>
                    <Text style={styles.eventRowBadge}>ONGOING</Text>
                  </View>
                  {item.id === activeEventId && (
                    <Ionicons name="checkmark-circle" size={22} color="#4f46e5" />
                  )}
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// ─── Styles

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  // Permission denied
  centeredScreen: {
    flex: 1, backgroundColor: '#111827', alignItems: 'center',
    justifyContent: 'center', paddingHorizontal: 32, gap: 12,
  },
  permissionHeading:  { fontSize: 20, fontWeight: '700', color: 'white', textAlign: 'center', marginTop: 4 },
  permissionText:     { fontSize: 16, color: '#9ca3af' },
  permissionSubtext:  { fontSize: 14, color: '#6b7280', textAlign: 'center', lineHeight: 20 },
  permissionBtn: {
    paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12,
    backgroundColor: '#4f46e5', width: '100%', alignItems: 'center', marginTop: 4,
  },
  settingsBtn:        { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#4f46e5' },
  permissionBtnText:  { fontSize: 15, fontWeight: '600', color: 'white' },

  // Viewfinder
  overlay:      { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.65)' },
  cutoutBorder: { position: 'absolute', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)', borderRadius: 10 },
  scanLine: {
    position: 'absolute', height: 2, backgroundColor: '#6366f1', borderRadius: 1,
    shadowColor: '#6366f1', shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.9, shadowRadius: 5, elevation: 5,
  },
  labelWrap:      { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  label:          { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '500' },
  eventNameLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: '400', textAlign: 'center' },
  noEventLabel:   { color: '#fbbf24', fontSize: 14, fontWeight: '500', textAlign: 'center' },

  // Stats bar
  statsBar:       { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: '#1e1b4b', justifyContent: 'flex-end' },
  statsBarInner:  { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 8, gap: 4 },
  statsText:      { flex: 1, color: 'white', fontSize: 13, fontWeight: '500' },
  statsCheckedIn: { fontWeight: '700', color: '#a5f3fc' },
  statsRate:      { fontWeight: '600', color: '#c7d2fe' },

  // Modal sheet
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '55%',
  },
  sheetHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#d1d5db',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },
  sheetHeader: {
    paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e5e7eb',
  },
  sheetTitle:     { fontSize: 18, fontWeight: '700', color: '#111827' },
  sheetSub:       { fontSize: 13, color: '#6b7280', marginTop: 2 },
  sheetList:      { paddingHorizontal: 16, paddingVertical: 8 },
  sheetEmpty:     { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 10 },
  sheetEmptyText: { fontSize: 15, color: '#9ca3af' },
  eventRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 14,
    paddingHorizontal: 12, borderRadius: 10, marginVertical: 3, backgroundColor: '#f9fafb',
  },
  eventRowActive: { backgroundColor: '#eef2ff' },
  eventRowTitle:  { fontSize: 15, fontWeight: '600', color: '#111827', flex: 1 },
  eventRowBadge:  { fontSize: 11, fontWeight: '700', color: '#059669', marginTop: 2, letterSpacing: 0.5 },
});
