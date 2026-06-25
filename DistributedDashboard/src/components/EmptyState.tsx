// src/components/EmptyState.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from 'react-native-paper';

interface Props {
  title: string;
  subtitle?: string;
}

export default function EmptyState({ title, subtitle }: Props) {
  return (
    <View style={styles.container}>
      <Text variant="titleMedium" style={styles.title}>
        {title}
      </Text>
      {subtitle ? (
        <Text variant="bodyMedium" style={styles.subtitle}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  title: { textAlign: 'center', opacity: 0.8, marginBottom: 4 },
  subtitle: { textAlign: 'center', opacity: 0.5 },
});
