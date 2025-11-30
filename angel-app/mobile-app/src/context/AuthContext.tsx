import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI, userAPI } from '../services/api';
import { User, AuthResponse } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  signUp: (email: string) => Promise<void>;
  verifyOTP: (email: string, otp: string) => Promise<void>;
  login: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      if (storedToken) {
        setToken(storedToken);
        await refreshProfile();
      }
    } catch (error) {
      console.error('Failed to load auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const signUp = async (email: string) => {
    await authAPI.register(email);
  };

  const verifyOTP = async (email: string, otp: string) => {
    const response = await authAPI.verify(email, otp);
    const { access_token } = response.data;
    await AsyncStorage.setItem('auth_token', access_token);
    setToken(access_token);
    await refreshProfile();
  };

  const login = async (email: string) => {
    await authAPI.login(email);
  };

  const refreshProfile = async () => {
    try {
      const response = await userAPI.getProfile();
      setUser(response.data);
    } catch (error: any) {
      if (error.code === 'ECONNABORTED') {
        console.error('Failed to fetch profile: Request timeout');
      } else if (error.message === 'Network Error') {
        console.error('Failed to fetch profile: Network error - cannot reach server');
      } else {
        console.error('Failed to fetch profile:', error);
      }
      throw error;
    }
  };

  const logout = async () => {
    await AsyncStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        signUp,
        verifyOTP,
        login,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
