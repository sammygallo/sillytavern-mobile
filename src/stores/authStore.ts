import { create } from 'zustand';
import { api, type UserInfo } from '../api/client';
import { useCharacterStore } from './characterStore';
import { useChatStore } from './chatStore';
import { useSettingsStore } from './settingsStore';
import type { UserRole } from '../types';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  currentUser: { handle: string; name: string; role: UserRole } | null;
  availableUsers: UserInfo[];
  error: string | null;
  canSelfRegister: boolean;

  // Actions
  checkAuth: () => Promise<void>;
  fetchUsers: () => Promise<void>;
  checkRegistration: () => Promise<void>;
  register: (handle: string, name: string, password?: string) => Promise<boolean>;
  login: (handle: string, password?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  isLoading: true,
  currentUser: null,
  availableUsers: [],
  error: null,
  canSelfRegister: false,

  checkAuth: async () => {
    set({ isLoading: true });
    try {
      const user = await api.getCurrentUser();
      if (user) {
        set({
          isAuthenticated: true,
          currentUser: { handle: user.handle, name: user.name, role: user.role },
          isLoading: false,
        });
      } else {
        set({ isAuthenticated: false, currentUser: null, isLoading: false });
      }
    } catch {
      set({ isAuthenticated: false, currentUser: null, isLoading: false });
    }
  },

  fetchUsers: async () => {
    try {
      const users = await api.getUsers();
      set({ availableUsers: users });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Failed to fetch users' });
    }
  },

  checkRegistration: async () => {
    try {
      const result = await api.checkCanRegister();
      set({ canSelfRegister: result.canRegister });
    } catch {
      set({ canSelfRegister: false });
    }
  },

  register: async (handle: string, name: string, password?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.register(handle, name, password);
      // After successful registration, log the user in
      const loginResult = await api.login(result.handle, password);
      set({
        isAuthenticated: true,
        currentUser: { handle: loginResult.handle, name, role: 'end_user' },
        isLoading: false,
      });
      return true;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Registration failed',
      });
      return false;
    }
  },

  login: async (handle: string, password?: string) => {
    set({ isLoading: true, error: null });
    try {
      const result = await api.login(handle, password);
      set({
        isAuthenticated: true,
        currentUser: { handle: result.handle, name: result.handle, role: 'end_user' },
        isLoading: false,
      });
      return true;
    } catch (error) {
      set({
        isLoading: false,
        error: error instanceof Error ? error.message : 'Login failed',
      });
      return false;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ isAuthenticated: false, currentUser: null });

      // Clear all stores to prevent data leakage between users
      useCharacterStore.setState({
        characters: [],
        selectedCharacter: null,
        isGroupChatMode: false,
        groupChatCharacters: [],
      });
      useChatStore.setState({
        messages: [],
        chatFiles: [],
        groupChats: [],
        currentChatFile: null,
        isStreaming: false,
        isSending: false,
        error: null,
        abortController: null,
        currentSpeakerName: null,
      });
      useSettingsStore.setState({
        secrets: {},
        activeProvider: 'openai',
        activeModel: 'gpt-4o',
        error: null,
        successMessage: null,
      });

      // Clear persisted localStorage data
      localStorage.removeItem('sillytavern_group_chats');
      localStorage.removeItem('sillytavern_author_notes');
    }
  },

  clearError: () => set({ error: null }),
}));
