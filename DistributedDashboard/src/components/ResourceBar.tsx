// src/components/ResourceBar.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';
import { resourceColor } from '../theme/theme';

interface Props {
  label: string;
  percent: number; // 0-100
  subtitle?: string; // e.g. "12.1 / 16 GB"
}

export default function ResourceBar({ label, percent, subtitle }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = resourceColor(clamped);

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text variant="labelLarge">{label}</Text>
        <Text variant="labelLarge" style={{ color }}>
          {Math.round(clamped)}%
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${clamped}%`, backgroundColor: color }]} />
      </View>
      {subtitle ? (
        <Text variant="bodySmall" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginVertical: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#2B3440',
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 4 },
  subtitle: { marginTop: 2, opacity: 0.7 },
});
