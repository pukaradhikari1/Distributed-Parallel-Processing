// src/theme/theme.ts
import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';

// Dark, technical "ops dashboard" palette — distinct from default Paper purple.
export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#00BFA6', // teal accent
    secondary: '#3D8BFF', // status-blue
    background: '#0E1116',
    surface: '#161B22',
    surfaceVariant: '#1F2630',
    error: '#FF5470',
    onSurface: '#E6EDF3',
    outline: '#2B3440',
  },
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#00897B',
    secondary: '#2962FF',
    background: '#F5F7FA',
    surface: '#FFFFFF',
  },
};

export const statusColors = {
  online: '#2ECC71',
  idle: '#5DADE2',
  busy: '#F4B400',
  offline: '#7F8C8D',
  error: '#FF5470',
  healthy: '#2ECC71',
  degraded: '#F4B400',
  down: '#FF5470',
  queued: '#7F8C8D',
  processing: '#3D8BFF',
  completed: '#2ECC71',
  failed: '#FF5470',
  reassigned: '#F4B400',
  low: '#5DADE2',
  medium: '#F4B400',
  high: '#FF8A3D',
  critical: '#FF5470',
};

export function resourceColor(percent: number): string {
  if (percent >= 90) return statusColors.critical;
  if (percent >= 70) return statusColors.busy;
  return statusColors.online;
}
