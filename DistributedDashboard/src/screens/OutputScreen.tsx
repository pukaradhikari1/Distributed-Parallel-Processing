// src/screens/OutputScreen.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Card,
  Chip,
  IconButton,
  Modal,
  Portal,
  Searchbar,
  Snackbar,
  Text,
} from 'react-native-paper';
import { useClusterStore } from '../store/useClusterStore';
import EmptyState from '../components/EmptyState';
import { WorkloadOutput } from '../types';
import {
  detectTaskType,
  exportAndShareZip,
  tryParseStructuredOutput,
} from '../utils/exportOutput';

const METRIC_LABELS: Record<string, string> = {
  loss: 'Loss',
  val_loss: 'Val Loss',
  accuracy: 'Accuracy',
  val_accuracy: 'Val Accuracy',
  acc: 'Accuracy',
  val_acc: 'Val Accuracy',
  precision: 'Precision',
  recall: 'Recall',
  f1: 'F1',
  f1_score: 'F1 Score',
  auc: 'AUC',
  mae: 'MAE',
  mse: 'MSE',
  rmse: 'RMSE',
  epoch: 'Epoch',
  epochs: 'Epochs',
  learning_rate: 'Learning Rate',
  lr: 'LR',
};

function formatMetricValue(v: any): string {
  if (typeof v === 'number') {
    return Number.isInteger(v) ? String(v) : v.toFixed(4);
  }
  return String(v);
}

function AnimatedCard({ children, index, style }: { children: React.ReactNode; index: number; style?: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(30)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 320, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);
  return <Animated.View style={[style, { opacity, transform: [{ translateX }] }]}>{children}</Animated.View>;
}

function MetricChips({ data, max }: { data: Record<string, any>; max?: number }) {
  if (!data) return null;
  const entries = Object.entries(data).slice(0, max);
  return (
    <View style={styles.chipRow}>
      {entries.map(([key, value]) => (
        <Chip key={key} compact style={styles.metricChip} textStyle={styles.metricChipText}>
          {`${METRIC_LABELS[key.toLowerCase()] ?? key}: ${formatMetricValue(value)}`}
        </Chip>
      ))}
    </View>
  );
}

function OutputCard({
  item,
  index,
  onOpen,
  onExported,
  onExportError,
}: {
  item: WorkloadOutput;
  index: number;
  onOpen: (o: WorkloadOutput) => void;
  onExported: () => void;
  onExportError: (msg: string) => void;
}) {
  const [exporting, setExporting] = useState(false);

  // FIX: Fallback to item.outputPreview to match API data mapping
  const logContent = item?.result || (item as any)?.outputPreview;
  const structured = useMemo(() => tryParseStructuredOutput?.(logContent), [logContent]);
  const taskType = useMemo(() => detectTaskType?.(item, structured), [item, structured]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAndShareZip(item, structured);
      onExported();
    } catch (err: any) {
      onExportError(err?.message || 'Failed to export output');
    } finally {
      setExporting(false);
    }
  };

  return (
    <AnimatedCard index={index} style={styles.cardWrapper}>
      <Card mode="contained" onPress={() => onOpen(item)}>
        <Card.Content>
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text variant="titleSmall">Workload {item?.workloadId?.slice(0, 8) ?? 'Unknown'}</Text>
              <Text variant="bodySmall" style={styles.subtle}>
                {/* FIX: Fallback to item.workerId if workerName is missing */}
                Processed by {item?.workerName || (item as any)?.workerId || 'Unknown'} in {item?.durationMs ?? 0}ms
              </Text>
            </View>
            <Chip compact style={taskType === 'ml' ? styles.mlBadge : styles.genericBadge}>
              {taskType === 'ml' ? 'ML' : 'Output'}
            </Chip>
          </View>

          {taskType === 'ml' && structured ? (
            <MetricChips data={structured} max={4} />
          ) : (
            <Text variant="bodyMedium" numberOfLines={2} style={styles.preview}>
              {/* FIX: Use fallback text content */}
              {logContent ?? ''}
            </Text>
          )}

          <View style={styles.footerRow}>
            <Text variant="labelSmall" style={styles.subtle}>
              {item?.completedAt ? new Date(item.completedAt).toLocaleString() : ''}
            </Text>
            {exporting ? (
              <ActivityIndicator size={18} style={{ marginRight: 8 }} />
            ) : (
              <IconButton
                icon="download"
                size={20}
                onPress={handleExport}
                accessibilityLabel="Download output as ZIP"
              />
            )}
          </View>
        </Card.Content>
      </Card>
    </AnimatedCard>
  );
}

export default function OutputScreen() {
  const { outputs = [], fetchOutputs, isLoading } = useClusterStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WorkloadOutput | null>(null);
  const [modalExporting, setModalExporting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const searchOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchOutputs();
    const interval = setInterval(fetchOutputs, 6000);
    Animated.timing(searchOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => clearInterval(interval);
  }, []);

  const filtered = useMemo(() => {
    const safeOutputs = Array.isArray(outputs) ? outputs : [];
    const normalizedQuery = (query || '').toLowerCase();

    return safeOutputs.filter(o => {
      const wId = (o?.workloadId || '').toString().toLowerCase();
      // FIX: Add workerId evaluation alongside workerName to support search correctly
      const wName = (o?.workerName || (o as any).workerId || '').toString().toLowerCase();
      return wId.includes(normalizedQuery) || wName.includes(normalizedQuery);
    });
  }, [outputs, query]);

  // FIX: Access log content via structural fallback
  const selectedLogContent = selected?.result || (selected as any)?.outputPreview;

  const selectedStructured = useMemo(
    () => (selectedLogContent && typeof tryParseStructuredOutput === 'function'
      ? tryParseStructuredOutput(selectedLogContent)
      : null),
    [selectedLogContent]
  );

  const selectedTaskType = useMemo(
    () => (selected && typeof detectTaskType === 'function'
      ? detectTaskType(selected, selectedStructured)
      : 'generic'),
    [selected, selectedStructured]
  );

  const handleModalExport = async () => {
    if (!selected) return;
    setModalExporting(true);
    try {
      await exportAndShareZip(selected, selectedStructured);
      setSnackbar('Output exported as ZIP');
    } catch (err: any) {
      setSnackbar(err?.message || 'Failed to export output');
    } finally {
      setModalExporting(false);
    }
  };

  return (
    <View style={styles.flex}>
      <Animated.View style={{ opacity: searchOpacity }}>
        <Searchbar
          placeholder="Search by workload or worker"
          value={query}
          onChangeText={setQuery}
          style={styles.search}
        />
      </Animated.View>

      <FlatList
        data={filtered}
        keyExtractor={item => item?.id ?? Math.random().toString()}
        refreshing={isLoading}
        onRefresh={fetchOutputs}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={<EmptyState title="No processed output yet" subtitle="Completed workloads will appear here" />}
        renderItem={({ item, index }) => (
          <OutputCard
            item={item}
            index={index}
            onOpen={setSelected}
            onExported={() => setSnackbar('Output exported as ZIP')}
            onExportError={msg => setSnackbar(msg)}
          />
        )}
      />

      <Portal>
        <Modal visible={!!selected} onDismiss={() => setSelected(null)} contentContainerStyle={styles.modal}>
          {selected && (
            <>
              <View style={styles.headerRow}>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Workload {selected?.workloadId?.slice(0, 8) ?? 'Unknown'} Result
                </Text>
                <Chip compact style={selectedTaskType === 'ml' ? styles.mlBadge : styles.genericBadge}>
                  {selectedTaskType === 'ml' ? 'ML' : 'Output'}
                </Chip>
              </View>

              <Text variant="bodySmall" style={styles.subtle}>
                {/* FIX: Fallback to workerId here as well */}
                Worker: {selected?.workerName || (selected as any)?.workerId || 'Unknown'} · Duration: {selected?.durationMs ?? 0}ms
              </Text>

              {selectedTaskType === 'ml' && selectedStructured && (
                <>
                  <Text variant="labelLarge" style={styles.metricsHeader}>Metrics</Text>
                  <MetricChips data={selectedStructured} />
                </>
              )}

              <Text variant="labelLarge" style={styles.metricsHeader}>
                {selectedTaskType === 'ml' ? 'Raw Log' : 'Result'}
              </Text>
              {/* FIX: Bind to standardized string value extraction */}
              <Text variant="bodyMedium" style={styles.modalResult}>{selectedLogContent ?? ''}</Text>

              <View style={styles.modalActions}>
                {modalExporting ? (
                  <ActivityIndicator size={20} />
                ) : (
                  <IconButton
                    icon="download"
                    mode="contained"
                    size={22}
                    onPress={handleModalExport}
                    accessibilityLabel="Download output as ZIP"
                  />
                )}
                <Text variant="bodySmall" style={styles.subtle}>Download full output as .zip</Text>
              </View>
            </>
          )}
        </Modal>
      </Portal>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={2500}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  cardWrapper: { marginHorizontal: 16, marginVertical: 6 },
  subtle: { opacity: 0.6, marginTop: 2 },
  preview: { marginTop: 8 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  mlBadge: { backgroundColor: '#0D9488' },
  genericBadge: { backgroundColor: '#1E6FA8' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  metricChip: { backgroundColor: '#0A1A2A' },
  metricChipText: { fontSize: 12 },
  metricsHeader: { marginTop: 14, marginBottom: 4, opacity: 0.7 },
  modal: { backgroundColor: '#161B22', margin: 24, padding: 20, borderRadius: 12, maxHeight: '80%' },
  sectionTitle: { marginBottom: 6, flex: 1 },
  modalResult: { marginTop: 8, lineHeight: 20 },
  modalActions: { flexDirection: 'row', alignItems: 'center', marginTop: 18, gap: 8 },
});