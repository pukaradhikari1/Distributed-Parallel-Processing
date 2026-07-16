// src/screens/WorkerDetailScreen.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Divider, Text } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useClusterStore } from '../store/useClusterStore';
import StatusChip from '../components/StatusChip';
import ResourceDonut from '../components/ResourceDonut';
import EmptyState from '../components/EmptyState';

type Props = NativeStackScreenProps<RootStackParamList, 'WorkerDetail'>;

// How often to re-fetch while this screen is open, so CPU/RAM/GPU numbers
// update live instead of only on pull-to-refresh. Matches the worker
// script's own heartbeat interval (it posts vitals every 4s).
const LIVE_POLL_MS = 4000;

function AnimatedCard({ children, delay = 0, style }: { children: React.ReactNode; delay?: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

export default function WorkerDetailScreen({ route, navigation }: Props) {
  const { workerId } = route.params;
  const { workers, errors, isLoading, fetchWorkers, fetchErrors } = useClusterStore();
  const worker = workers.find(w => w.id === workerId);
  const workerErrors = errors.filter(e => e.workerId === workerId);

  useEffect(() => { fetchErrors(workerId); }, [workerId]);

  // Real-time updates: poll fetchWorkers() on an interval while this screen
  // is mounted, so CPU/RAM/GPU usage and last-heartbeat time stay live.
  useEffect(() => {
    const handle = setInterval(() => {
      fetchWorkers();
    }, LIVE_POLL_MS);
    return () => clearInterval(handle);
  }, []);

  const onRefresh = () => { fetchWorkers(); fetchErrors(workerId); };

  if (!worker) return <EmptyState title="Worker not found" subtitle="It may have been removed from the cluster" />;

  const ramPercent = (worker.ram.usedMB / worker.ram.totalMB) * 100;

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
      contentContainerStyle={styles.container}
    >
      <AnimatedCard delay={0}>
        <View style={styles.headerRow}>
          <View>
            <Text variant="headlineSmall">{worker.name}</Text>
            <Text variant="bodyMedium" style={styles.subtle}>
              {worker.ipAddress}{worker.region ? ` · ${worker.region}` : ''}
            </Text>
          </View>
          <StatusChip status={worker.status} />
        </View>
        <Text variant="bodySmall" style={styles.subtle}>
          Last heartbeat: {new Date(worker.lastHeartbeat).toLocaleString()}
        </Text>
      </AnimatedCard>

      <AnimatedCard delay={80} style={styles.card}>
        <Card mode="contained">
          <Card.Content style={styles.donutRow}>
            <ResourceDonut label="CPU" percent={worker.cpu.usagePercent} />
            <ResourceDonut label="RAM" percent={ramPercent} />
            {worker.gpu && <ResourceDonut label="GPU" percent={worker.gpu.usagePercent} />}
          </Card.Content>
        </Card>
      </AnimatedCard>

      <AnimatedCard delay={160} style={styles.card}>
        <Card mode="contained">
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Hardware</Text>
            <DetailRow label="Display name" value={worker.name} />
            <DetailRow label="OS" value={worker.os ?? 'Unknown'} />
            <DetailRow label="CPU cores" value={`${worker.cpu.cores}`} />
            <DetailRow label="RAM" value={`${(worker.ram.usedMB / 1024).toFixed(1)} / ${(worker.ram.totalMB / 1024).toFixed(1)} GB`} />
            {worker.gpu ? (
              <>
                <DetailRow label="GPU model" value={worker.gpu.model ?? 'Unknown'} />
                {worker.gpu.vramUsedMB != null && worker.gpu.vramTotalMB != null && (
                  <DetailRow label="VRAM" value={`${(worker.gpu.vramUsedMB / 1024).toFixed(1)} / ${(worker.gpu.vramTotalMB / 1024).toFixed(1)} GB`} />
                )}
              </>
            ) : <DetailRow label="GPU" value="None detected" />}
          </Card.Content>
        </Card>
      </AnimatedCard>

      <AnimatedCard delay={240} style={styles.card}>
        <Card mode="contained">
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Active Tasks ({worker.activeTaskIds.length})
            </Text>
            {worker.activeTaskIds.length === 0
              ? <Text style={styles.subtle}>No active tasks on this worker</Text>
              : worker.activeTaskIds.map(taskId => (
                <Text key={taskId} variant="bodyMedium" style={styles.taskId}>• {taskId}</Text>
              ))
            }
          </Card.Content>
        </Card>
      </AnimatedCard>

      <AnimatedCard delay={320} style={styles.card}>
        <Card mode="contained">
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Recent Errors ({workerErrors.length})
            </Text>
            {workerErrors.length === 0
              ? <Text style={styles.subtle}>No recent errors</Text>
              : workerErrors.slice(0, 3).map((err, i) => (
                <View key={err.id}>
                  {i > 0 && <Divider style={styles.divider} />}
                  <Text variant="bodySmall" style={styles.subtle}>
                    {new Date(err.timestamp).toLocaleTimeString()} · {err.severity}
                  </Text>
                  <Text variant="bodyMedium">{err.message}</Text>
                </View>
              ))
            }
          </Card.Content>
        </Card>
      </AnimatedCard>

      <AnimatedCard delay={400} style={styles.card}>
        <Button
          mode="contained-tonal"
          icon="swap-horizontal"
          onPress={() => navigation.navigate('Reassignment', { sourceWorkerId: worker.id })}
        >
          Reassign Workloads from this Worker
        </Button>
      </AnimatedCard>
    </ScrollView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text variant="bodyMedium" style={styles.subtle}>{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  subtle: { opacity: 0.6 },
  card: { marginTop: 16 },
  donutRow: { flexDirection: 'row', justifyContent: 'space-around', flexWrap: 'wrap' },
  sectionTitle: { marginBottom: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  taskId: { paddingVertical: 2 },
  divider: { marginVertical: 8 },
});