import React, { createContext, useContext } from 'react';

// Dark theme only — single curated palette
const darkColors = {
  background: '#0f0d23',
  surface: '#1a1735',
  surfaceLight: '#252147',
  card: '#1e1b3a',
  cardBorder: 'rgba(129, 140, 248, 0.12)',
  primary: '#818cf8',
  primaryDark: '#6366f1',
  accent: '#a78bfa',
  text: '#e2e8f0',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  success: '#34d399',
  warning: '#fbbf24',
  danger: '#f87171',
  dangerBg: '#3b1123',
  statusBar: 'light',
  inputBg: '#252147',
  inputBorder: 'rgba(129, 140, 248, 0.2)',
  headerBg: '#1a1735',
  tabBg: 'rgba(129, 140, 248, 0.08)',
  tabActive: '#818cf8',
  shadow: '#000',
  progressBg: 'rgba(129, 140, 248, 0.15)',
  progressFill: '#818cf8',
  overlay: 'rgba(15, 13, 35, 0.85)',
};

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  return (
    <ThemeContext.Provider value={{ colors: darkColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
