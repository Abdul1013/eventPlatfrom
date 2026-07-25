import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Constants from 'expo-constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import { useScannerStore } from '@/src/store/scannerStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const ROLE_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ADMIN:    { bg: '#fef2f2', text: '#dc2626', label: 'Administrator' },
  STAFF:    { bg: '#eef2ff', text: '#4f46e5', label: 'Staff' },
  ATTENDEE: { bg: '#f3f4f6', text: '#6b7280', label: 'Attendee' },
};

// ─── ProfileScreen ────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { user, clearAuth } = useAuthStore();
  const { activeEventTitle, checkedInCount, totalCount, queuedScans, clearActiveEvent } =
    useScannerStore();

  const initials = getInitials(user?.name);
  const role = user?.role ?? '';
  const roleStyle = ROLE_STYLE[role] ?? { bg: '#f3f4f6', text: '#6b7280', label: '—' };
  const appVersion = Constants.expoConfig?.version ?? '—';
  const queuedCount = queuedScans.length;

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            try {
              await api.post('/auth/logout');
            } catch {
              // Clear local state regardless of server response
            }
            clearAuth();
            clearActiveEvent();
            router.replace('/(auth)/login');
          })();
        },
      },
    ]);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* ── Hero ── */}
        <View style={styles.hero}>
          <View style={styles.avatarRing}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
          </View>
          <Text style={styles.name}>{user?.name ?? '—'}</Text>
          <Text style={styles.email}>{user?.email ?? '—'}</Text>
          <View style={[styles.roleBadge, { backgroundColor: roleStyle.bg }]}>
            <View style={[styles.roleDot, { backgroundColor: roleStyle.text }]} />
            <Text style={[styles.roleText, { color: roleStyle.text }]}>{roleStyle.label}</Text>
          </View>
        </View>

        {/* ── Stats ── */}
        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIcon, { backgroundColor: '#eef2ff' }]}>
              <Ionicons name="qr-code-outline" size={18} color="#4f46e5" />
            </View>
            <Text style={styles.statValue}>
              {checkedInCount}
              {totalCount > 0 && <Text style={styles.statValueDim}> / {totalCount}</Text>}
            </Text>
            <Text style={styles.statLabel}>Today's check-ins</Text>
          </View>
          <View style={styles.statCard}>
            <View
              style={[
                styles.statIcon,
                { backgroundColor: queuedCount > 0 ? '#fef3c7' : '#f3f4f6' },
              ]}
            >
              <Ionicons
                name="cloud-offline-outline"
                size={18}
                color={queuedCount > 0 ? '#b45309' : '#9ca3af'}
              />
            </View>
            <Text style={styles.statValue}>{queuedCount}</Text>
            <Text style={styles.statLabel}>Pending sync</Text>
          </View>
        </View>

        {/* ── Active event card ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Active Event</Text>
          <View style={styles.activeEventCard}>
            <View style={[styles.statIcon, { backgroundColor: '#ecfdf5' }]}>
              <Ionicons name="calendar-outline" size={18} color="#059669" />
            </View>
            <View style={styles.activeEventBody}>
              {activeEventTitle ? (
                <>
                  <Text style={styles.activeEventTitle} numberOfLines={1}>
                    {activeEventTitle}
                  </Text>
                  <Text style={styles.activeEventSub}>Tap the scanner tab to check in attendees</Text>
                </>
              ) : (
                <>
                  <Text style={styles.activeEventTitleMuted}>No event selected</Text>
                  <Text style={styles.activeEventSub}>Pick an event from the scanner tab to start</Text>
                </>
              )}
            </View>
          </View>
        </View>

        {/* ── Sign out ── */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#dc2626" />
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── App version (very bottom) ── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.version}>EventMerge v{appVersion}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#f9fafb' },
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },

  // Hero
  hero: {
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 20,
    paddingVertical: 28,
    paddingHorizontal: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2ff',
    marginBottom: 14,
  },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#4f46e5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 30, fontWeight: '700', color: '#fff', letterSpacing: 0.5 },
  name:      { fontSize: 22, fontWeight: '700', color: '#111827' },
  email:     { fontSize: 14, color: '#6b7280', marginTop: 2 },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  roleDot:  { width: 6, height: 6, borderRadius: 3 },
  roleText: { fontSize: 12, fontWeight: '600' },

  // Stats grid
  statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  statCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue:    { fontSize: 22, fontWeight: '700', color: '#111827' },
  statValueDim: { fontSize: 16, fontWeight: '500', color: '#9ca3af' },
  statLabel:    { fontSize: 12, color: '#6b7280', marginTop: 2 },

  // Section
  section:      { marginBottom: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9ca3af',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 8,
    marginLeft: 4,
  },

  // Active event
  activeEventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 14,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e5e7eb',
  },
  activeEventBody:        { flex: 1 },
  activeEventTitle:       { fontSize: 15, fontWeight: '600', color: '#111827' },
  activeEventTitleMuted:  { fontSize: 15, fontWeight: '500', color: '#9ca3af' },
  activeEventSub:         { fontSize: 12, color: '#9ca3af', marginTop: 2 },

  // Sign out
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 14,
    paddingVertical: 15,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: '#dc2626' },

  // App version footer
  footer:  { alignItems: 'center', paddingTop: 8 },
  version: { fontSize: 12, color: '#d1d5db' },
});
