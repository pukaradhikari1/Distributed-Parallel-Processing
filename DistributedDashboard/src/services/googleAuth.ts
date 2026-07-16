// src/services/googleAuth.ts

import {
    GoogleSignin,
    statusCodes,
} from '@react-native-google-signin/google-signin';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/useAuthStore';

const GOOGLE_WEB_CLIENT_ID = '1090983687872-rqdjbd73qv803art7j4p4l4l15a95smv.apps.googleusercontent.com';
const GOOGLE_IOS_CLIENT_ID = '1090983687872-rqdjbd73qv803art7j4p4l4l15a95smv.apps.googleusercontent.com'; // iOS only
const BACKEND_URL = 'http://10.0.2.2:8000'; // Android emulator → host machine. Use your real IP or domain for a physical device.
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

    // 2. Trigger the Google sign-in UI.
    //    NOTE: newer versions of @react-native-google-signin/google-signin
    //    (v13+) return the idToken directly inside this response, under
    //    `response.data.idToken`. Older versions returned the user info
    //    directly with `idToken` at the top level. We read the idToken
    //    straight from this result instead of calling GoogleSignin.getTokens()
    //    afterward — that separate call was throwing
    //    "getTokens requires a user to be signed in" because it checks a
    //    signed-in state that doesn't reliably sync immediately after signIn()
    //    resolves.
    const signInResult: any = await GoogleSignin.signIn();

    const idToken: string | null =
        signInResult?.data?.idToken ?? // v13+ shape
        signInResult?.idToken ??       // older shape
        null;

    if (!idToken) throw new Error('Google sign-in returned no ID token');

    // Pull display name/photo from whichever shape this version returned
    const googleUser = signInResult?.data?.user ?? signInResult?.user ?? null;

    // 3. Send the ID token to your backend for verification
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

    // 4. Expected response shape from your backend:
    //    { user: { id, username, email }, tokens: { accessToken } }
    const { user, tokens } = await response.json();

    // 5. Build a basic profile from the Google user info
    const profile = {
        displayName: googleUser?.name ?? user.username,
        avatarUrl: googleUser?.photo ?? undefined,
        isPremium: false,
        createdAt: new Date().toISOString(),
    };

    // 6. Persist to AsyncStorage (same key used by useAuthStore)
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user, tokens, profile }));

    // 7. Hydrate the auth store so the app reacts immediately
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