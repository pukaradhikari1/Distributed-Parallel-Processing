// src/screens/RegisterScreen.tsx
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, HelperText, Text, TextInput } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/useAuthStore';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

// Password strength helper
function passwordStrength(pw: string): { label: string; color: string } {
  if (pw.length === 0) return { label: '', color: 'transparent' };
  if (pw.length < 6) return { label: 'Too short', color: '#EF4444' };
  if (pw.length < 8) return { label: 'Weak — consider longer', color: '#F59E0B' };
  if (!/[A-Z]/.test(pw) || !/[0-9]/.test(pw))
    return { label: 'Fair — consider a longer password', color: '#F59E0B' };
  return { label: 'Strong password ✓', color: '#34D399' };
}

export default function RegisterScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // NOTE (backend change): this backend creates the account at /signup and
  // /send-otp requires the account to already exist (it 404s "User not
  // found" otherwise) — so register() must run BEFORE sendOtp() now. It
  // previously called sendOtp() first, which is what caused the
  // "User not found" error, since no account existed yet at that point.
  const { register, sendOtp, isLoading, error, clearError } = useAuthStore();

  const pwStrength = passwordStrength(password);

  const handleNext = async () => {
    clearError();
    setLocalError(null);

    // Validation
    if (!username.trim()) { setLocalError('Username is required'); return; }
    if (username.trim().length < 3) { setLocalError('Username must be at least 3 characters'); return; }
    if (!email.trim()) { setLocalError('Email is required'); return; }
    if (!/\S+@\S+\.\S+/.test(email)) { setLocalError('Please enter a valid email'); return; }
    if (password.length < 6) { setLocalError('Password must be at least 6 characters'); return; }
    if (password !== confirmPassword) { setLocalError('Passwords do not match'); return; }

    setSending(true);

    // 1. Create the account first (this backend's /signup creates it
    //    immediately; verification/login happens later via OTP).
    const registered = await register(username.trim(), email.trim(), password);

    if (!registered) {
      // Read the actual backend error to decide whether this is truly
      // fatal, or just means the account already exists.
      //
      // WHY THIS MATTERS: if /signup succeeds server-side but the response
      // never makes it back cleanly (e.g. a brief emulator/network blip),
      // the app sees a failure even though the account was really created.
      // Retrying then correctly gets "already registered" — but treating
      // that as a hard stop leaves the user stuck, unable to ever reach
      // the OTP screen for an account that genuinely exists and needs
      // verifying. So: if the failure reason is specifically "already
      // registered" (username or email), proceed to sendOtp() anyway
      // instead of stopping — any other error (network down, server
      // error, etc.) still stops here as before.
      const currentError = useAuthStore.getState().error ?? '';
      const alreadyExists = /already registered/i.test(currentError);

      if (!alreadyExists) {
        setSending(false);
        return;
      }
      // else: fall through to sendOtp() below
    }

    // 2. Now that the account exists (freshly created, or already existed
    //    from a prior attempt), send the OTP.
    const otpSent = await sendOtp(email.trim());
    setSending(false);

    if (otpSent) {
      // Navigate to OTP screen, passing credentials
      navigation.navigate('OTP', {
        email: email.trim(),
        username: username.trim(),
        password,
      });
    }
  };

  const loading = isLoading || sending;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="headlineMedium" style={styles.title}>
          Create Account
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Register to access the distributed processing dashboard
        </Text>

        {/* Username */}
        <TextInput
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          mode="outlined"
          style={styles.input}
          left={<TextInput.Icon icon="account-outline" />}
        />

        {/* Email */}
        <TextInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          mode="outlined"
          style={styles.input}
          left={<TextInput.Icon icon="email-outline" />}
        />

        {/* Password */}
        <TextInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPw}
          mode="outlined"
          style={styles.input}
          left={<TextInput.Icon icon="lock-outline" />}
          right={
            <TextInput.Icon
              icon={showPw ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => setShowPw(v => !v)}
            />
          }
        />
        {password.length > 0 && (
          <HelperText type="info" style={{ color: pwStrength.color, marginTop: -10, marginBottom: 4 }}>
            {pwStrength.label}
          </HelperText>
        )}

        {/* Confirm Password */}
        <TextInput
          label="Confirm Password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry={!showConfirm}
          mode="outlined"
          style={styles.input}
          left={<TextInput.Icon icon="lock-check-outline" />}
          right={
            <TextInput.Icon
              icon={showConfirm ? 'eye-off-outline' : 'eye-outline'}
              onPress={() => setShowConfirm(v => !v)}
            />
          }
        />

        {/* Errors */}
        {(localError || error) && (
          <Text variant="bodySmall" style={styles.error}>
            {localError ?? error}
          </Text>
        )}

        {/* CTA — creates the account, sends OTP, then goes to OTP screen */}
        <Button
          mode="contained"
          onPress={handleNext}
          loading={loading}
          disabled={loading || !username || !email || !password || !confirmPassword}
          style={styles.button}
          contentStyle={styles.buttonContent}
          icon="email-send-outline"
        >
          Send Verification Code
        </Button>

        <Text variant="bodySmall" style={styles.hint}>
          We'll send a 6-digit code to your email to verify your account.
        </Text>

        <Button mode="text" onPress={() => navigation.navigate('Login')}>
          Already have an account? Log In
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  title: { textAlign: 'center', marginBottom: 4, fontWeight: '700' },
  subtitle: { textAlign: 'center', opacity: 0.6, marginBottom: 32 },
  input: { marginBottom: 14 },
  button: { marginTop: 8, marginBottom: 8, borderRadius: 10 },
  buttonContent: { paddingVertical: 6 },
  error: { color: '#EF4444', marginBottom: 12, textAlign: 'center' },
  hint: { opacity: 0.5, textAlign: 'center', marginBottom: 16, lineHeight: 18 },
});