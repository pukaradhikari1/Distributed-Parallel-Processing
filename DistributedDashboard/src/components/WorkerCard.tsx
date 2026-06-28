// src/components/WorkerCard.tsx
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Card, Text } from 'react-native-paper';
import StatusChip from './StatusChip';
import ResourceBar from './ResourceBar';
import { WorkerNode } from '../types';

interface Props {
  worker: WorkerNode;
  onPress: () => void;
}

export default function WorkerCard({ worker, onPress }: Props) {
  return (
    <Card style={styles.card} onPress={onPress} mode="contained">
      <Card.Content>
        <View style={styles.header}>
          <View>
            <Text variant="titleMedium">{worker.name}</Text>
            <Text variant="bodySmall" style={styles.ip}>
              {worker.ipAddress}
            </Text>
          </View>
          <StatusChip status={worker.status} compact />
        </View>

        <ResourceBar label="CPU" percent={worker.cpu.usagePercent} />
        <ResourceBar label="RAM" percent={(worker.ram.usedMB / worker.ram.totalMB) * 100} />
        {worker.gpu && <ResourceBar label="GPU" percent={worker.gpu.usagePercent} />}

        <Text variant="bodySmall" style={styles.tasks}>
          {worker.activeTaskIds.length} active task{worker.activeTaskIds.length === 1 ? '' : 's'}
        </Text>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 16, marginVertical: 6 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  ip: { opacity: 0.6 },
  tasks: { marginTop: 4, opacity: 0.7 },
});
