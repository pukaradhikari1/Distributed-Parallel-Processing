// src/screens/LoginScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { Button, Divider, Text, TextInput } from 'react-native-paper';
import { useAuthStore } from '../store/useAuthStore';
import { googleSignIn } from '../services/googleAuth';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [secure, setSecure] = useState(true);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const { login, isLoading, error, clearError } = useAuthStore();

  // entrance animation
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(32)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 450, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleLogin = async () => {
    clearError();
    setLocalError(null);
    await login(username.trim(), password);
  };

  const handleGoogle = async () => {
    clearError();
    setLocalError(null);
    setGoogleLoading(true);
    try {
      await googleSignIn();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Google sign-in failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const displayError = localError ?? error;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
        <Animated.View style={{ opacity, transform: [{ translateY }] }}>

          <Text variant="headlineMedium" style={styles.title}>
            Distributed Parallel Processing
          </Text>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Sign in to monitor your cluster
          </Text>

          {/* Google */}
          <Button
            mode="outlined"
            icon="google"
            onPress={handleGoogle}
            loading={googleLoading}
            disabled={googleLoading || isLoading}
            style={styles.googleBtn}
            contentStyle={styles.googleContent}
          >
            Continue with Google
          </Button>

          <View style={styles.dividerRow}>
            <Divider style={styles.dividerLine} />
            <Text variant="bodySmall" style={styles.dividerLabel}>or sign in with email</Text>
            <Divider style={styles.dividerLine} />
          </View>

          <TextInput
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="account-outline" />}
          />
          <TextInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={secure}
            mode="outlined"
            style={styles.input}
            left={<TextInput.Icon icon="lock-outline" />}
            right={<TextInput.Icon icon={secure ? 'eye' : 'eye-off'} onPress={() => setSecure(v => !v)} />}
          />

          {displayError ? (
            <Text variant="bodySmall" style={styles.error}>{displayError}</Text>
          ) : null}

          <Button
            mode="contained"
            onPress={handleLogin}
            loading={isLoading}
            disabled={isLoading || googleLoading || !username || !password}
            style={styles.button}
            contentStyle={styles.buttonContent}
          >
            Log In
          </Button>

          <Button mode="text" onPress={() => navigation.navigate('Register')}>
            Don't have an account? Register
          </Button>

        </Animated.View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  title: { textAlign: 'center', marginBottom: 4, fontWeight: '700' },
  subtitle: { textAlign: 'center', opacity: 0.6, marginBottom: 24 },
  googleBtn: { marginBottom: 20, borderRadius: 8 },
  googleContent: { paddingVertical: 4 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, gap: 8 },
  dividerLine: { flex: 1 },
  dividerLabel: { opacity: 0.5 },
  input: { marginBottom: 14 },
  button: { marginTop: 8, marginBottom: 8, borderRadius: 8 },
  buttonContent: { paddingVertical: 4 },
  error: { color: '#FF5470', marginBottom: 8, textAlign: 'center' },
});