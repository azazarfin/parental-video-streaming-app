import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.10.100:5000/api';
const AUTH_KEY = '@auth_session';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const appState = useRef(AppState.currentState);

  /**
   * Refresh the session token with the backend.
   * This generates a brand-new token for this device, making it the
   * active device. Any other device with the old token gets kicked.
   */
  const refreshSession = async (savedUser, savedToken) => {
    try {
      const res = await axios.post(`${API_URL}/auth/refresh`, {
        userId: savedUser._id,
      });

      const newToken = res.data.sessionToken;
      const updatedUser = res.data.user || savedUser;

      setUser(updatedUser);
      setSessionToken(newToken);
      await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ user: updatedUser, sessionToken: newToken }));

      return true;
    } catch (err) {
      // If refresh fails (user deleted, server down), fall back to existing stored session
      // so the app doesn't crash — errors will surface when they try to stream
      console.warn('Session refresh failed:', err.message);
      setUser(savedUser);
      setSessionToken(savedToken);
      return false;
    }
  };

  // On app launch, restore saved session and immediately refresh the token
  useEffect(() => {
    const bootstrap = async () => {
      try {
        const stored = await AsyncStorage.getItem(AUTH_KEY);
        if (stored) {
          const { user: savedUser, sessionToken: savedToken } = JSON.parse(stored);
          if (savedUser && savedToken) {
            // Immediately refresh to claim this device as the active one
            await refreshSession(savedUser, savedToken);
          }
        }
      } catch (e) {
        // ignore corrupt data
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap();
  }, []);

  // When the app comes back to the foreground, refresh the token again
  useEffect(() => {
    const subscription = AppState.addEventListener('change', async (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App has come to the foreground — refresh token to reclaim this device
        try {
          const stored = await AsyncStorage.getItem(AUTH_KEY);
          if (stored) {
            const { user: savedUser, sessionToken: savedToken } = JSON.parse(stored);
            if (savedUser) {
              await refreshSession(savedUser, savedToken);
            }
          }
        } catch (e) {}
      }
      appState.current = nextAppState;
    });

    return () => subscription.remove();
  }, []);

  const login = async (userData, token) => {
    setUser(userData);
    setSessionToken(token);
    await AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ user: userData, sessionToken: token }));
  };

  const logout = async () => {
    setUser(null);
    setSessionToken(null);
    await AsyncStorage.removeItem(AUTH_KEY);
  };

  // Update the stored user data (e.g. when watch time refreshes)
  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    if (sessionToken) {
      AsyncStorage.setItem(AUTH_KEY, JSON.stringify({ user: updatedUser, sessionToken }));
    }
  };

  return (
    <AuthContext.Provider value={{ user, sessionToken, isLoading, login, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
