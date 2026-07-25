import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { router } from 'expo-router';
import { loginSchema, type LoginInput } from '@eventmerge/validators';
import { api } from '@/src/lib/api';
import { useAuthStore } from '@/src/store/authStore';
import type { AuthUser } from '@eventmerge/types';

export default function LoginScreen() {
  const { setAuth } = useAuthStore();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginInput) => {
    setServerError(null);
    try {
      const res = await api.post<{
        data: { tokens: { accessToken: string; refreshToken: string }; user: AuthUser };
      }>('/auth/login', data);

      const { user, tokens } = res.data.data;

      // Staff scanner is gated to ADMIN/GATEKEEPER — attendees are rejected here,
      // not by the API, so we don't leak role info via differential errors.
      if (user.role !== 'ADMIN' && user.role !== 'GATEKEEPER') {
        setServerError('This app is for gate staff only. Please use the attendee app to manage your tickets.');
        return;
      }

      setAuth({ user, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      router.replace('/(app)/scanner');
    } catch (err) {
      // Distinguish network errors from auth failures so users know whether to
      // check their connection or their credentials.
      const axiosErr = err as { response?: { status?: number }; code?: string; message?: string };
      if (!axiosErr.response) {
        setServerError(
          "Can't reach the server. Check your internet connection and try again.",
        );
      } else if (axiosErr.response.status === 401) {
        setServerError('Invalid email or password. Please try again.');
      } else {
        setServerError('Sign in failed. Please try again in a moment.');
      }
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.inner}>

          {/* ── Top: logo + card */}
          <View>
            <View style={styles.logoWrap}>
              <Text style={styles.logoText}>EventMerge</Text>
              <Text style={styles.logoSub}>Gate Staff</Text>
              <Text style={styles.logoHint}>Sign in to manage check-ins</Text>
            </View>

            <View style={styles.card}>
              {serverError && (
                <View style={styles.errorBanner}>
                  <Text style={styles.errorText}>{serverError}</Text>
                </View>
              )}

              <View style={styles.fields}>

                {/* Email */}
                <View>
                  <Text style={styles.label}>Email address</Text>
                  <Controller
                    control={control}
                    name="email"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={[styles.input, errors.email && styles.inputError]}
                        placeholder="staff@example.com"
                        placeholderTextColor="#9CA3AF"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        autoComplete="email"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                  {errors.email && (
                    <Text style={styles.fieldError}>{errors.email.message}</Text>
                  )}
                </View>

                {/* Password */}
                <View>
                  <Text style={styles.label}>Password</Text>
                  <Controller
                    control={control}
                    name="password"
                    render={({ field: { onChange, onBlur, value } }) => (
                      <TextInput
                        style={[styles.input, errors.password && styles.inputError]}
                        placeholder="••••••••"
                        placeholderTextColor="#9CA3AF"
                        secureTextEntry
                        autoComplete="current-password"
                        onBlur={onBlur}
                        onChangeText={onChange}
                        value={value}
                      />
                    )}
                  />
                  {errors.password && (
                    <Text style={styles.fieldError}>{errors.password.message}</Text>
                  )}
                </View>

                {/* Submit */}
                <TouchableOpacity
                  style={[styles.submitBtn, isSubmitting && styles.submitBtnDisabled]}
                  onPress={handleSubmit(onSubmit)}
                  disabled={isSubmitting}
                  activeOpacity={0.8}
                >
                  {isSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.submitText}>Sign in</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>Powered by EventMerge</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: '#F9FAFB' },
  scroll: { flexGrow: 1 },
  inner:  { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },

  // Logo
  logoWrap: { alignItems: 'center', marginBottom: 32 },
  logoText: { fontSize: 32, fontWeight: '700', color: '#4F46E5' },
  logoSub:  { fontSize: 16, color: '#6B7280', marginTop: 4 },
  logoHint: { fontSize: 14, color: '#9CA3AF', marginTop: 4 },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    width: 350,
    maxWidth: 500,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },

  // Error
  errorBanner: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
  },
  errorText: { fontSize: 14, color: '#B91C1C' },

  // Fields
  fields:     { gap: 16 },
  label:      { fontSize: 14, fontWeight: '500', color: '#374151', marginBottom: 6 },
  input: {
    height: 52,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 16,
    color: '#111827',
    backgroundColor: '#fff',
  },
  inputError:  { borderColor: '#F87171', backgroundColor: '#FEF2F2' },
  fieldError:  { fontSize: 12, color: '#DC2626', marginTop: 4 },

  // Button
  submitBtn: {
    height: 52,
    borderRadius: 12,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitBtnDisabled: { backgroundColor: '#A5B4FC' },
  submitText: { fontSize: 16, fontWeight: '600', color: '#fff' },

  // Footer
  footer:     { alignItems: 'center', marginTop: 32 },
  footerText: { fontSize: 12, color: '#9CA3AF' },
});
