// src/store/useAuthStore.ts
import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clusterApi, UserProfileData } from '../services/apiClient';
import { AuthTokens, User } from '../types';

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
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { user: User; tokens: AuthTokens; profile?: UserProfileData };
        set({ user: parsed.user, tokens: parsed.tokens, profile: parsed.profile ?? null });
      }
    } finally {
      set({ isHydrated: true });
    }
  },

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, tokens } = await clusterApi.login(username, password);
      let profile: UserProfileData | null = null;
      try {
        profile = await clusterApi.getProfile(tokens.accessToken);
      } catch {
        profile = { displayName: username, isPremium: false, createdAt: new Date().toISOString() };
      }
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user, tokens, profile }));
      set({ user, tokens, profile, isLoading: false });
      return true;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Login failed' });
      return false;
    }
  },

  register: async (username, email, password) => {
    set({ isLoading: true, error: null });
    try {
      const { user, tokens } = await clusterApi.register(username, email, password);
      const profile: UserProfileData = {
        displayName: username,
        isPremium: false,
        createdAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ user, tokens, profile }));
      set({ user, tokens, profile, isLoading: false });
      return true;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Registration failed' });
      return false;
    }
  },

  logout: async () => {
    await clusterApi.logout();
    await AsyncStorage.removeItem(STORAGE_KEY);
    set({ user: null, tokens: null, profile: null });
  },

  deleteAccount: async () => {
    set({ isLoading: true, error: null });
    try {
      await clusterApi.deleteAccount();
      await AsyncStorage.removeItem(STORAGE_KEY);
      set({ user: null, tokens: null, profile: null, isLoading: false });
      return true;
    } catch (e) {
      set({ isLoading: false, error: e instanceof Error ? e.message : 'Failed to delete account' });
      return false;
    }
  },

  updateProfile: async (updates) => {
    set({ isProfileLoading: true, error: null });
    try {
      await clusterApi.updateProfile(updates);
      const current = get();
      const updatedProfile: UserProfileData = { ...(current.profile as UserProfileData), ...updates };
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, profile: updatedProfile }));
      }
      set({ profile: updatedProfile, isProfileLoading: false });
      return true;
    } catch (e) {
      set({ isProfileLoading: false, error: e instanceof Error ? e.message : 'Update failed' });
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
export const selectDisplayName = (s: AuthState) =>
  s.profile?.displayName ?? s.user?.username ?? 'User';