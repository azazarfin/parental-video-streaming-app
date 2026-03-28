import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://192.168.10.100:5000/api';
const USERNAME_KEY = '@last_username';

export default function LoginScreen() {
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login } = useAuth();
  const { colors, isDark } = useTheme();

  // Pre-fill last used username
  useEffect(() => {
    AsyncStorage.getItem(USERNAME_KEY).then((val) => {
      if (val) setUsername(val);
    });
  }, []);

  const handleLogin = async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) {
      setError('Please enter a username');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const res = await axios.post(`${API_URL}/auth/login`, { username: trimmed });
      await AsyncStorage.setItem(USERNAME_KEY, trimmed);
      await login(res.data.user, res.data.sessionToken);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('User not found. Contact admin.');
      } else if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError('Network error. Check your connection.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.primaryDark }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Decorative circles */}
      <View style={[styles.circle, styles.circle1, { backgroundColor: colors.primary, opacity: 0.15 }]} />
      <View style={[styles.circle, styles.circle2, { backgroundColor: colors.accent, opacity: 0.1 }]} />

      <View style={[styles.card, { backgroundColor: colors.surface, shadowColor: colors.shadow }]}>
        <View style={[styles.logoContainer, { backgroundColor: colors.tabBg }]}>
          <Text style={styles.emoji}>🎬</Text>
        </View>
        <Text style={[styles.title, { color: colors.text }]}>Watch Naruto</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Enter your username to start watching
        </Text>

        <View style={[styles.inputContainer, { backgroundColor: colors.inputBg, borderColor: colors.inputBorder }]}>
          <Text style={styles.inputIcon}>👤</Text>
          <TextInput
            style={[styles.input, { color: colors.text }]}
            placeholder="Username"
            placeholderTextColor={colors.textMuted}
            value={username}
            onChangeText={(t) => { setUsername(t); setError(''); }}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />
        </View>

        {error ? (
          <View style={[styles.errorBox, { backgroundColor: colors.dangerBg }]}>
            <Text style={[styles.error, { color: colors.danger }]}>⚠ {error}</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }, loading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text style={styles.buttonText}>Log In</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  circle: {
    position: 'absolute',
    borderRadius: 999,
  },
  circle1: {
    width: 300,
    height: 300,
    top: -80,
    right: -80,
  },
  circle2: {
    width: 200,
    height: 200,
    bottom: -40,
    left: -60,
  },
  card: {
    borderRadius: 24,
    padding: 32,
    width: '100%',
    maxWidth: 400,
    alignItems: 'center',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 12,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emoji: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 28,
    textAlign: 'center',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1.5,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  inputIcon: {
    fontSize: 18,
    marginRight: 10,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
  },
  errorBox: {
    width: '100%',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
  },
  error: {
    fontSize: 13,
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
