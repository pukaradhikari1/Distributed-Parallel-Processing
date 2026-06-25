// src/screens/ReassignmentScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Card, Divider, RadioButton, SegmentedButtons, Snackbar, Text } from 'react-native-paper';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useClusterStore } from '../store/useClusterStore';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';

type Props = NativeStackScreenProps<RootStackParamList, 'Reassignment'>;

function AnimatedSection({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 380, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 380, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={{ opacity, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export default function ReassignmentScreen({ route, navigation }: Props) {
  const { workloadId: initialWorkloadId, sourceWorkerId } = route.params ?? {};
  const { workloads, workers, fetchWorkloads, fetchWorkers, reassignWorkload } = useClusterStore();
  const [selectedWorkloadId, setSelectedWorkloadId] = useState<string | undefined>(initialWorkloadId);
  const [mode, setMode] = useState<'same' | 'different'>('different');
  const [targetWorkerId, setTargetWorkerId] = useState<string | undefined>();
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  useEffect(() => { fetchWorkloads(); fetchWorkers(); }, []);

  const reassignable = useMemo(
    () => workloads.filter(w =>
      w.status === 'failed' || w.status === 'queued' ||
      (sourceWorkerId ? w.assignedWorkerId === sourceWorkerId && w.status === 'processing' : false)
    ),
    [workloads, sourceWorkerId]
  );

  const selectedWorkload = workloads.find(w => w.id === selectedWorkloadId);
  const currentWorker = workers.find(w => w.id === (selectedWorkload?.assignedWorkerId ?? sourceWorkerId));
  const candidateWorkers = workers.filter(w => w.status !== 'offline' && w.status !== 'error' && w.id !== currentWorker?.id);

  const handleConfirm = async () => {
    if (!selectedWorkloadId) return;
    const finalTarget = mode === 'same' ? currentWorker?.id : targetWorkerId;
    if (!finalTarget) return;
    setSubmitting(true);
    const ok = await reassignWorkload(selectedWorkloadId, finalTarget);
    setSubmitting(false);
    setSnackbar(ok ? 'Workload reassigned' : 'Reassignment failed');
    if (ok) setTimeout(() => navigation.goBack(), 800);
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>

        <AnimatedSection delay={0}>
          <Text variant="titleMedium" style={styles.sectionTitle}>1. Select a workload to reassign</Text>
          {reassignable.length === 0 ? (
            <EmptyState title="Nothing to reassign" subtitle="No failed, queued, or stuck workloads found" />
          ) : (
            <Card style={styles.card} mode="contained">
              <Card.Content>
                <RadioButton.Group onValueChange={v => setSelectedWorkloadId(v)} value={selectedWorkloadId ?? ''}>
                  {reassignable.map((w, i) => (
                    <View key={w.id}>
                      {i > 0 && <Divider style={styles.divider} />}
                      <RadioButton.Item label={`${w.name} (${w.type})`} value={w.id} labelStyle={styles.radioLabel} />
                      <View style={styles.workloadMeta}>
                        <StatusChip status={w.status} compact />
                        <Text variant="bodySmall" style={styles.subtle}>
                          attempt {w.attempt} · worker {w.assignedWorkerId ?? '—'}
                        </Text>
                      </View>
                    </View>
                  ))}
                </RadioButton.Group>
              </Card.Content>
            </Card>
          )}
        </AnimatedSection>

        {selectedWorkload && (
          <AnimatedSection delay={150}>
            <Text variant="titleMedium" style={styles.sectionTitle}>2. Choose target</Text>
            <SegmentedButtons
              value={mode}
              onValueChange={v => setMode(v as 'same' | 'different')}
              buttons={[
                { value: 'same', label: 'Retry same worker' },
                { value: 'different', label: 'Different worker' },
              ]}
              style={styles.input}
            />
            {mode === 'same' ? (
              <Card style={styles.card} mode="contained">
                <Card.Content>
                  {currentWorker ? (
                    <View style={styles.workerOption}>
                      <View>
                        <Text variant="titleSmall">{currentWorker.name}</Text>
                        <Text variant="bodySmall" style={styles.subtle}>
                          CPU {Math.round(currentWorker.cpu.usagePercent)}% · {currentWorker.activeTaskIds.length} active tasks
                        </Text>
                      </View>
                      <StatusChip status={currentWorker.status} compact />
                    </View>
                  ) : <Text style={styles.subtle}>Original worker unavailable</Text>}
                </Card.Content>
              </Card>
            ) : (
              <Card style={styles.card} mode="contained">
                <Card.Content>
                  {candidateWorkers.length === 0
                    ? <Text style={styles.subtle}>No other healthy workers available</Text>
                    : (
                      <RadioButton.Group onValueChange={setTargetWorkerId} value={targetWorkerId ?? ''}>
                        {candidateWorkers.map((w, i) => (
                          <View key={w.id}>
                            {i > 0 && <Divider style={styles.divider} />}
                            <RadioButton.Item label={w.name} value={w.id} labelStyle={styles.radioLabel} />
                            <View style={styles.workloadMeta}>
                              <StatusChip status={w.status} compact />
                              <Text variant="bodySmall" style={styles.subtle}>
                                CPU {Math.round(w.cpu.usagePercent)}% · RAM {Math.round((w.ram.usedMB / w.ram.totalMB) * 100)}% · {w.activeTaskIds.length} tasks
                              </Text>
                            </View>
                          </View>
                        ))}
                      </RadioButton.Group>
                    )
                  }
                </Card.Content>
              </Card>
            )}
          </AnimatedSection>
        )}
      </ScrollView>

      <AnimatedSection delay={300}>
        <View style={styles.footer}>
          <Button
            mode="contained"
            onPress={handleConfirm}
            loading={submitting}
            disabled={submitting || !selectedWorkloadId || (mode === 'same' ? !currentWorker : !targetWorkerId)}
          >
            Confirm Reassignment
          </Button>
        </View>
      </AnimatedSection>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={2000}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, paddingBottom: 16 },
  sectionTitle: { marginTop: 8, marginBottom: 10 },
  card: { marginBottom: 16 },
  input: { marginBottom: 4 },
  divider: { marginVertical: 4 },
  radioLabel: { textAlign: 'left' },
  workloadMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 56, marginTop: -8, marginBottom: 8 },
  workerOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  subtle: { opacity: 0.6 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#2B3440' },
});