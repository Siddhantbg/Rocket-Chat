import { create } from 'zustand';
import api from '../lib/axios';

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  code: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  initialize: () => Promise<void>;
  updateUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: localStorage.getItem('accessToken'),
  refreshToken: localStorage.getItem('refreshToken'),
  isLoading: true,
  error: null,

  initialize: async () => {
    try {
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');

      if (!accessToken || !refreshToken) {
        set({ isLoading: false });
        return;
      }

      // Fetch current user data
      const response = await api.get('/auth/me');
      
      set({ 
        user: response.data,
        accessToken,
        refreshToken,
        isLoading: false
      });
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      // If verification fails, clear everything
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      set({ 
        user: null,
        accessToken: null,
        refreshToken: null,
        isLoading: false
      });
    }
  },

  login: async (email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      const response = await api.post('/auth/login', {
        email,
        password,
      });
      
      const { user, accessToken, refreshToken } = response.data;
      
      // Store tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      
      set({ user, accessToken, refreshToken, isLoading: false });
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'An error occurred';
      set({
        error: errorMessage,
        isLoading: false,
      });
      throw new Error(errorMessage);
    }
  },

  register: async (name: string, email: string, password: string) => {
    try {
      set({ isLoading: true, error: null });
      
      if (!name || !email || !password) {
        throw new Error('All fields are required');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      const response = await api.post('/auth/register', {
        name,
        email,
        password,
      });
      
      const { user, accessToken, refreshToken } = response.data;
      
      // Store tokens
      localStorage.setItem('accessToken', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      
      set({ user, accessToken, refreshToken, isLoading: false });
    } catch (error: any) {
      const errorMessage = error.response?.data?.error || error.message || 'An error occurred';
      set({
        error: errorMessage,
        isLoading: false,
      });
      throw new Error(errorMessage);
    }
  },

  logout: () => {
    // Clear tokens
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    
    set({ user: null, accessToken: null, refreshToken: null });
  },

  updateUser: (user: User) => {
    set({ user });
  }
})); 