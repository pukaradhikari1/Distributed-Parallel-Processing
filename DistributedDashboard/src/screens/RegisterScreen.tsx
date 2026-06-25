// src/screens/RegisterScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Text, TextInput } from 'react-native-paper';
import { useAuthStore } from '../store/useAuthStore';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Register'>;

export default function RegisterScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { register, isLoading, error, clearError } = useAuthStore();

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleRegister = async () => {
    clearError();
    setLocalError(null);
    if (password !== confirmPassword) { setLocalError('Passwords do not match'); return; }
    if (password.length < 6) { setLocalError('Password must be at least 6 characters'); return; }
    await register(username.trim(), email.trim(), password);
  };


  const strengthColor =
    password.length === 0 ? 'transparent' :
      password.length < 6 ? '#FF5470' :
        password.length < 10 ? '#FFA000' : '#00BFA6';

  const strengthLabel =
    password.length === 0 ? '' :
      password.length < 6 ? 'Too short — min 6 characters' :
        password.length < 10 ? 'Fair — consider a longer password' : 'Strong ✓';

  const displayError = localError ?? error;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>

          <Text variant="headlineMedium" style={styles.title}>Create Account</Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Register to access the distributed processing dashboard
          </Text>


          <TextInput label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" mode="outlined" style={styles.input} left={<TextInput.Icon icon="account-outline" />} />
          <TextInput label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" mode="outlined" style={styles.input} left={<TextInput.Icon icon="email-outline" />} />

          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="lock-outline" />}
            right={<TextInput.Icon icon={showPassword ? 'eye-off' : 'eye'} onPress={() => setShowPassword(v => !v)} />}
          />
          {password.length > 0 && (
            <Text variant="labelSmall" style={[styles.strengthHint, { color: strengthColor }]}>
              {strengthLabel}
            </Text>
          )}

          <TextInput
            label="Confirm Password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirm}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="lock-check-outline" />}
            right={<TextInput.Icon icon={showConfirm ? 'eye-off' : 'eye'} onPress={() => setShowConfirm(v => !v)} />}
          />

          {displayError ? (
            <Text variant="bodySmall" style={styles.error}>{displayError}</Text>
          ) : null}

          <Button
            mode="contained"
            onPress={handleRegister}

            loading={isLoading}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Create Account
          </Button>

          <Button mode="text" onPress={() => navigation.navigate('Login')}>
            Already have an account? Log In
          </Button>

        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 },
  title: { textAlign: 'center', marginBottom: 4, fontWeight: '700' },
  subtitle: { textAlign: 'center', opacity: 0.6, marginBottom: 24 },
  googleBtn: { marginBottom: 20, borderRadius: 8 },
  googleContent: { paddingVertical: 4 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 },
  dividerLine: { flex: 1 },
  dividerLabel: { opacity: 0.5 },
  input: { marginBottom: 14 },
  strengthHint: { marginTop: -8, marginBottom: 10, marginLeft: 4 },
  button: { marginTop: 8, marginBottom: 8, borderRadius: 8 },
  buttonContent: { paddingVertical: 4 },
  error: { color: '#FF5470', marginBottom: 8, textAlign: 'center' },
});