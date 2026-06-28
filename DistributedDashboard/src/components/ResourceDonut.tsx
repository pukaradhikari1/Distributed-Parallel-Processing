// src/components/ResourceDonut.tsx
import React from 'react';
import { View } from 'react-native';
import { VictoryPie } from 'victory-native';
import { Text } from 'react-native-paper';
import { resourceColor } from '../theme/theme';

interface Props {
  label: string;
  percent: number;
  size?: number;
}

export default function ResourceDonut({ label, percent, size = 110 }: Props) {
  const clamped = Math.max(0, Math.min(100, percent));
  const color = resourceColor(clamped);

  return (
    <View style={{ alignItems: 'center', width: size }}>
      <View style={{ width: size, height: size }}>
        <VictoryPie
          standalone
          width={size}
          height={size}
          innerRadius={size / 2 - 14}
          padding={0}
          data={[
            { x: 'used', y: clamped },
            { x: 'free', y: 100 - clamped },
          ]}
          colorScale={[color, '#2B3440']}
          labels={() => null}
        />
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text variant="titleMedium" style={{ color }}>
            {Math.round(clamped)}%
          </Text>
        </View>
      </View>
      <Text variant="labelLarge" style={{ marginTop: 6 }}>
        {label}
      </Text>
    </View>
  );
}
