import React, { createContext, useState, useEffect, useContext } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_KEY = '@auth_session';
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // On app launch, try to restore saved session
  useEffect(() => {
    AsyncStorage.getItem(AUTH_KEY).then((stored) => {
      if (stored) {
        try {
          const { user: savedUser, sessionToken: savedToken } = JSON.parse(stored);
          if (savedUser && savedToken) {
            setUser(savedUser);
            setSessionToken(savedToken);
          }
        } catch (e) {
          // ignore corrupt data
        }
      }
    }).finally(() => setIsLoading(false));
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
