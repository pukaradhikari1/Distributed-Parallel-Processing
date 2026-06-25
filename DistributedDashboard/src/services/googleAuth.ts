// src/services/googleAuth.ts

import {
    GoogleSignin,
    statusCodes,
} from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/useAuthStore';

const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID.apps.googleusercontent.com'; // iOS only
const BACKEND_URL = 'https://YOUR_BACKEND_URL'; // e.g. https://api.yourdomain.com
const STORAGE_KEY = 'dpdash.auth';

export function configureGoogleSignIn() {
    GoogleSignin.configure({
        webClientId: GOOGLE_WEB_CLIENT_ID,
        iosClientId: GOOGLE_IOS_CLIENT_ID,
        offlineAccess: true,
    });
}

export async function googleSignIn(): Promise<void> {
    // 1. Make sure Google Play Services are available (Android)
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // 2. Trigger the Google sign-in UI
    const userInfo = await GoogleSignin.signIn();

    // 3. Get the ID token to send to your backend
    const { idToken } = await GoogleSignin.getTokens();
    if (!idToken) throw new Error('Google sign-in returned no ID token');

    // 4. Send the ID token to your backend for verification
    //    Your backend should verify it with Google, create/find the user,
    //    and return your own access token.
    const response = await fetch(`${BACKEND_URL}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail ?? err.message ?? 'Google sign-in failed');
    }

    // 5. Expected response shape from your backend:
    //    { user: { id, username, email }, tokens: { accessToken } }
    const { user, tokens } = await response.json();

    // 6. Build a basic profile from the Google user info
    const profile = {
        displayName: (userInfo as any)?.user?.name ?? user.username,
        avatarUrl: (userInfo as any)?.user?.photo ?? undefined,
        isPremium: false,
        createdAt: new Date().toISOString(),
    };

    // 7. Persist to AsyncStorage (same key used by useAuthStore)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user, tokens, profile }));

    // 8. Hydrate the auth store so the app reacts immediately
    useAuthStore.setState({ user, tokens, profile });
}

export async function googleSignOut(): Promise<void> {
    try {
        await GoogleSignin.revokeAccess();
        await GoogleSignin.signOut();
    } catch {
    }
}

export async function isGoogleSignedIn(): Promise<boolean> {
    try {
        await GoogleSignin.signInSilently();
        return true;
    } catch {
        return false;
    }
}