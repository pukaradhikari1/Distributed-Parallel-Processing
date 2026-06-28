// src/components/StatusChip.tsx
import React from 'react';
import { Chip } from 'react-native-paper';
import { statusColors } from '../theme/theme';

interface Props {
  status: string;
  compact?: boolean;
}

export default function StatusChip({ status, compact }: Props) {
  const color = (statusColors as Record<string, string>)[status] ?? '#7F8C8D';
  return (
    <Chip
      compact={compact}
      style={{ backgroundColor: color + '26', borderColor: color, borderWidth: 1 }}
      textStyle={{ color, fontWeight: '600', textTransform: 'capitalize' }}
    >
      {status}
    </Chip>
  );
}
