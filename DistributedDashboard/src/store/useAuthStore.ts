// src/store/useAuthStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clusterApi } from '../services/apiClient';
import { AuthTokens, User } from '../types';

export interface UserProfileData {
  displayName: string;
  bio: string;
  isPremium: boolean;
  createdAt: string;
  role: string;
  apiAccess: string;
  maxWorkers: number;
  isVerified: boolean;
  plan: string;
}

export interface AuthState {
  user: User | null;
  tokens: AuthTokens | null;
  profile: UserProfileData | null;
  isLoading: boolean;
  isProfileLoading: boolean;
  error: string | null;
  isHydrated: boolean;
  hydrate: () => Promise<void>;
  login: (username: string, password: string) => Promise<boolean>;
  register: (username: string, email: string, password: string) => Promise<boolean>;
  sendOtp: (email: string) => Promise<boolean>;
  verifyOtp: (email: string, otpCode: string, username: string, password: string) => Promise<boolean>;
  resendOtp: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<boolean>;
  updateProfile: (updates: Partial<Omit<UserProfileData, 'createdAt' | 'isPremium'>>) => Promise<boolean>;
  clearError: () => void;
}

const STORAGE_KEY = 'dpdash.auth';

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  tokens: null,
  profile: null,
  isLoading: false,
  isProfileLoading: false,
  error: null,
  isHydrated: false,

  hydrate: async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        const { user, tokens, profile } = JSON.parse(data);
        set({ user, tokens, profile, isHydrated: true });
        if (tokens?.accessToken) {
          const { setAccessToken } = require('../services/apiClient');
          setAccessToken(tokens.accessToken);
        }
      } else {
        set({ isHydrated: true });
      }
    } catch {
      set({ isHydrated: true });
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, tokens } = await clusterApi.login(username, password);
      const { setAccessToken } = require('../services/apiClient');
      setAccessToken(tokens.accessToken);

      const profile = await clusterApi.getProfile(tokens.accessToken);
      const mappedProfile: UserProfileData = {
        displayName: profile.displayName || user.username,
        bio: profile.bio || '',
        isPremium: profile.isPremium,
        createdAt: profile.createdAt,
        role: profile.role || 'Viewer',
        apiAccess: profile.apiAccess || 'Read-only',
        maxWorkers: profile.maxWorkers ?? 5,
        isVerified: profile.isVerified ?? false,
        plan: profile.plan || 'Free',
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user, tokens, profile: mappedProfile }));
      set({ user, tokens, profile: mappedProfile, isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err instanceof Error ? err.message : 'Login failed', isLoading: false });
      return false;
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await clusterApi.register(username, email, password);
      set({ user: res.user, isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err instanceof Error ? err.message : 'Registration failed', isLoading: false });
      return false;
    }
  },

  sendOtp: async email => {
    set({ isLoading: true, error: null });
    try {
      await clusterApi.sendOtp(email);
      set({ isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err instanceof Error ? err.message : 'Failed to send OTP', isLoading: false });
      return false;
    }
  },

  verifyOtp: async (email, otpCode, username, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await clusterApi.verifyOtp(email, otpCode, username, password);
      const { setAccessToken } = require('../services/apiClient');
      setAccessToken(res.tokens.accessToken);

      const profile = await clusterApi.getProfile(res.tokens.accessToken);
      const mappedProfile: UserProfileData = {
        displayName: profile.displayName || res.user.username,
        bio: profile.bio || '',
        isPremium: profile.isPremium,
        createdAt: profile.createdAt,
        role: profile.role || 'Viewer',
        apiAccess: profile.apiAccess || 'Read-only',
        maxWorkers: profile.maxWorkers ?? 5,
        isVerified: profile.isVerified ?? false,
        plan: profile.plan || 'Free',
      };

      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user: res.user, tokens: res.tokens, profile: mappedProfile }));
      set({ user: res.user, tokens: res.tokens, profile: mappedProfile, isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err instanceof Error ? err.message : 'Verification failed', isLoading: false });
      return false;
    }
  },

  resendOtp: async email => {
    try {
      await clusterApi.resendOtp(email);
    } catch (err: any) {
      set({ error: err instanceof Error ? err.message : 'Failed to resend OTP' });
    }
  },

  logout: async () => {
    try {
      await clusterApi.logout();
      const { setAccessToken } = require('../services/apiClient');
      setAccessToken(null);
      await AsyncStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore cleanup error
    }
    set({ user: null, tokens: null, profile: null });
  },

  deleteAccount: async () => {
    set({ isLoading: true, error: null });
    try {
      const { tokens } = get();
      if (!tokens) {
        set({ isLoading: false, error: 'Not authenticated' });
        return false;
      }
      await clusterApi.deleteAccount(tokens.accessToken);
      await AsyncStorage.removeItem(STORAGE_KEY);
      set({ user: null, tokens: null, profile: null, isLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete account', isLoading: false });
      return false;
    }
  },

  updateProfile: async payload => {
    set({ isProfileLoading: true, error: null });
    try {
      const { tokens, profile, user } = get();
      if (!tokens) {
        set({ isProfileLoading: false, error: 'Not authenticated' });
        return false;
      }

      await clusterApi.updateProfile(tokens.accessToken, {
        displayName: payload.displayName ?? profile?.displayName ?? '',
        bio: payload.bio ?? profile?.bio ?? '',
      });

      const updatedProfile = { ...profile, ...payload } as UserProfileData;

      try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user, tokens, profile: updatedProfile }));
      } catch {
        // Ignore local persistent warnings
      }

      set({ profile: updatedProfile, isProfileLoading: false });
      return true;
    } catch (err: any) {
      set({ error: err instanceof Error ? err.message : 'Failed to update profile', isProfileLoading: false });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));

// Selectors
export const selectIsAuthenticated = (s: AuthState) => !!s.tokens;
export const selectUser = (s: AuthState) => s.user;
export const selectProfile = (s: AuthState) => s.profile;
export const selectIsPremium = (s: AuthState) => s.profile?.isPremium ?? false;
export const selectMemberSince = (s: AuthState) => s.profile?.createdAt ?? null;
export const selectDisplayName = (s: AuthState) => s.profile?.displayName ?? s.user?.username ?? '';