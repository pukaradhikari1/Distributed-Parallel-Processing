// src/screens/OutputScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, View } from 'react-native';
import { Card, Modal, Portal, Searchbar, Text } from 'react-native-paper';
import { useClusterStore } from '../store/useClusterStore';
import EmptyState from '../components/EmptyState';
import { WorkloadOutput } from '../types';

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

export default function OutputScreen() {
  const { outputs, fetchOutputs, isLoading } = useClusterStore();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<WorkloadOutput | null>(null);

  // search bar fade-in
  const searchOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fetchOutputs();
    const interval = setInterval(fetchOutputs, 6000);
    Animated.timing(searchOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => clearInterval(interval);
  }, []);

  const filtered = outputs.filter(
    o => o.workloadId.toLowerCase().includes(query.toLowerCase()) ||
      o.workerName.toLowerCase().includes(query.toLowerCase())
  );

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
        keyExtractor={item => item.id}
        refreshing={isLoading}
        onRefresh={fetchOutputs}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={<EmptyState title="No processed output yet" subtitle="Completed workloads will appear here" />}
        renderItem={({ item, index }) => (
          <AnimatedCard index={index} style={styles.cardWrapper}>
            <Card mode="contained" onPress={() => setSelected(item)}>
              <Card.Content>
                <Text variant="titleSmall">Workload {item.workloadId.slice(0, 8)}</Text>
                <Text variant="bodySmall" style={styles.subtle}>
                  Processed by {item.workerName} in {item.durationMs}ms
                </Text>
                <Text variant="bodyMedium" numberOfLines={2} style={styles.preview}>{item.result}</Text>
                <Text variant="labelSmall" style={styles.subtle}>
                  {new Date(item.completedAt).toLocaleString()}
                </Text>
              </Card.Content>
            </Card>
          </AnimatedCard>
        )}
      />

      <Portal>
        <Modal visible={!!selected} onDismiss={() => setSelected(null)} contentContainerStyle={styles.modal}>
          {selected && (
            <>
              <Text variant="titleMedium" style={styles.sectionTitle}>
                Workload {selected.workloadId.slice(0, 8)} Result
              </Text>
              <Text variant="bodySmall" style={styles.subtle}>
                Worker: {selected.workerName} · Duration: {selected.durationMs}ms
              </Text>
              <Text variant="bodyMedium" style={styles.modalResult}>{selected.result}</Text>
            </>
          )}
        </Modal>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  search: { marginHorizontal: 16, marginTop: 12, marginBottom: 4 },
  cardWrapper: { marginHorizontal: 16, marginVertical: 6 },
  subtle: { opacity: 0.6, marginTop: 2 },
  preview: { marginTop: 8 },
  modal: { backgroundColor: '#161B22', margin: 24, padding: 20, borderRadius: 12 },
  sectionTitle: { marginBottom: 6 },
  modalResult: { marginTop: 14, lineHeight: 20 },
});