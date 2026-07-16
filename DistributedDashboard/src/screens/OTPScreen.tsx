// src/screens/OTPScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    TextInput as RNTextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Button, Text } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useAuthStore } from '../store/useAuthStore';

type Props = NativeStackScreenProps<RootStackParamList, 'OTP'>;

const OTP_LENGTH = 6;
const RESEND_COUNTDOWN = 60;

export default function OTPScreen({ navigation, route }: Props) {
    const { email, username, password } = route.params;
    const { verifyOtp, resendOtp, isLoading, error, clearError } = useAuthStore();

    // OTP digits — one state per box
    const [digits, setDigits] = useState<string[]>(Array(OTP_LENGTH).fill(''));
    const [localError, setLocalError] = useState<string | null>(null);
    const [countdown, setCountdown] = useState(RESEND_COUNTDOWN);
    const [resending, setResending] = useState(false);

    // One ref per input box
    const inputRefs = useRef<(RNTextInput | null)[]>(Array(OTP_LENGTH).fill(null));

    // Animations
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const cardTranslateY = useRef(new Animated.Value(32)).current;
    const shakeX = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(cardTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]).start();

        // Focus first box
        setTimeout(() => inputRefs.current[0]?.focus(), 450);
    }, []);

    // Countdown timer for resend
    useEffect(() => {
        if (countdown <= 0) return;
        const t = setInterval(() => setCountdown(c => c - 1), 1000);
        return () => clearInterval(t);
    }, [countdown]);

    // Shake animation on error
    const shakeCard = () => {
        Animated.sequence([
            Animated.timing(shakeX, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeX, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    // Handle digit input
    const handleChange = (text: string, index: number) => {
        clearError();
        setLocalError(null);

        // Handle paste — if user pastes all 6 digits at once
        if (text.length > 1) {
            const pasted = text.replace(/\D/g, '').slice(0, OTP_LENGTH).split('');
            const newDigits = [...digits];
            pasted.forEach((d, i) => { if (index + i < OTP_LENGTH) newDigits[index + i] = d; });
            setDigits(newDigits);
            const nextIndex = Math.min(index + pasted.length, OTP_LENGTH - 1);
            inputRefs.current[nextIndex]?.focus();
            return;
        }

        const digit = text.replace(/\D/g, '').slice(-1);
        const newDigits = [...digits];
        newDigits[index] = digit;
        setDigits(newDigits);

        // Auto-advance to next box
        if (digit && index < OTP_LENGTH - 1) {
            inputRefs.current[index + 1]?.focus();
        }
    };

    // Handle backspace
    const handleKeyPress = (e: any, index: number) => {
        if (e.nativeEvent.key === 'Backspace') {
            if (!digits[index] && index > 0) {
                const newDigits = [...digits];
                newDigits[index - 1] = '';
                setDigits(newDigits);
                inputRefs.current[index - 1]?.focus();
            }
        }
    };

    const otpCode = digits.join('');
    const isFilled = otpCode.length === OTP_LENGTH;

    // Submit OTP
    const handleVerify = async () => {
        if (!isFilled) {
            setLocalError('Please enter all 6 digits');
            shakeCard();
            return;
        }
        clearError();
        setLocalError(null);

        const success = await verifyOtp(email, otpCode, username, password);
        if (!success) {
            setLocalError('Incorrect code. Please try again.');
            shakeCard();
            // Clear digits on failure
            setDigits(Array(OTP_LENGTH).fill(''));
            inputRefs.current[0]?.focus();
        }
        // On success, useAuthStore sets isAuthenticated = true → RootNavigator
        // auto-navigates to MainTabs
    };

    // Resend OTP
    const handleResend = async () => {
        if (countdown > 0) return;
        setResending(true);
        setLocalError(null);
        setDigits(Array(OTP_LENGTH).fill(''));
        inputRefs.current[0]?.focus();
        await resendOtp(email);
        setResending(false);
        setCountdown(RESEND_COUNTDOWN);
    };

    const maskedEmail = email.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) =>
        a + '*'.repeat(Math.max(b.length, 3)) + c
    );

    return (
        <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Animated.View
                style={[
                    styles.container,
                    {
                        opacity: cardOpacity,
                        transform: [{ translateY: cardTranslateY }, { translateX: shakeX }],
                    },
                ]}
            >
                {/* Icon */}
                <View style={styles.iconCircle}>
                    <Text style={styles.iconText}>✉</Text>
                </View>

                {/* Title */}
                <Text variant="headlineMedium" style={styles.title}>
                    Verify Your Email
                </Text>
                <Text variant="bodyMedium" style={styles.subtitle}>
                    We sent a 6-digit code to
                </Text>
                <Text variant="labelLarge" style={styles.email}>
                    {maskedEmail}
                </Text>

                {/* OTP Boxes */}
                <View style={styles.boxesRow}>
                    {digits.map((digit, index) => (
                        <RNTextInput
                            key={index}
                            ref={ref => { inputRefs.current[index] = ref; }}
                            style={[
                                styles.box,
                                digit ? styles.boxFilled : styles.boxEmpty,
                                localError || error ? styles.boxError : null,
                            ]}
                            value={digit}
                            onChangeText={text => handleChange(text, index)}
                            onKeyPress={e => handleKeyPress(e, index)}
                            keyboardType="number-pad"
                            maxLength={6}      // allow paste of 6 chars
                            selectTextOnFocus
                            textAlign="center"
                            returnKeyType="done"
                            caretHidden
                        />
                    ))}
                </View>

                {/* Error message */}
                {(localError || error) && (
                    <Text variant="bodySmall" style={styles.error}>
                        {localError ?? error}
                    </Text>
                )}

                {/* Verify button */}
                <Button
                    mode="contained"
                    onPress={handleVerify}
                    loading={isLoading}
                    disabled={isLoading || !isFilled}
                    style={styles.verifyBtn}
                    contentStyle={styles.verifyContent}
                >
                    Verify & Continue
                </Button>

                {/* Resend */}
                <View style={styles.resendRow}>
                    <Text variant="bodySmall" style={styles.subtle}>
                        Didn't receive the code?{' '}
                    </Text>
                    <TouchableOpacity onPress={handleResend} disabled={countdown > 0 || resending}>
                        <Text
                            variant="bodySmall"
                            style={[styles.resendText, (countdown > 0 || resending) && styles.resendDisabled]}
                        >
                            {resending
                                ? 'Sending…'
                                : countdown > 0
                                    ? `Resend in ${countdown}s`
                                    : 'Resend code'}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Back link */}
                <Button
                    mode="text"
                    onPress={() => navigation.goBack()}
                    style={{ marginTop: 4 }}
                >
                    ← Back to Register
                </Button>

            </Animated.View>
        </KeyboardAvoidingView>
    );
}

const BOX_SIZE = 48;

const styles = StyleSheet.create({
    flex: { flex: 1 },
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 28,
        paddingVertical: 32,
    },

    // Icon
    iconCircle: {
        width: 72, height: 72, borderRadius: 36,
        backgroundColor: '#1E3A5F',
        justifyContent: 'center', alignItems: 'center',
        marginBottom: 24,
    },
    iconText: { fontSize: 30 },

    // Title
    title: { fontWeight: '700', marginBottom: 8, textAlign: 'center' },
    subtitle: { opacity: 0.6, textAlign: 'center' },
    email: { color: '#2A7FC1', marginTop: 4, marginBottom: 32, textAlign: 'center' },

    // OTP boxes
    boxesRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 20,
    },
    box: {
        width: BOX_SIZE, height: BOX_SIZE + 8,
        borderRadius: 10,
        fontSize: 22,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    boxEmpty: { borderWidth: 1.5, borderColor: '#2A3A4A', backgroundColor: '#0D1117' },
    boxFilled: { borderWidth: 2, borderColor: '#2A7FC1', backgroundColor: '#0A1A2A' },
    boxError: { borderColor: '#EF4444' },

    // Error
    error: { color: '#EF4444', marginBottom: 12, textAlign: 'center' },

    // Verify button
    verifyBtn: { width: '100%', borderRadius: 10, marginBottom: 20 },
    verifyContent: { paddingVertical: 6 },

    // Resend
    resendRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    subtle: { opacity: 0.6 },
    resendText: { color: '#2A7FC1', fontWeight: '600' },
    resendDisabled: { opacity: 0.4 },
});