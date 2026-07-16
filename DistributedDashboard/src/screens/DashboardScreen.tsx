// src/screens/DashboardScreen.tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Card, FAB, Text } from 'react-native-paper';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useClusterStore } from '../store/useClusterStore';
import WorkerCard from '../components/WorkerCard';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';

// Combined navigation type — gives access to BOTH tab and stack screens
type DashboardNavProp = CompositeNavigationProp<
  BottomTabNavigationProp<MainTabParamList, 'Dashboard'>,
  NativeStackNavigationProp<RootStackParamList>
>;

export default function DashboardScreen() {
  // Use useNavigation hook instead of prop — avoids the undefined function crash
  const navigation = useNavigation<DashboardNavProp>();
  const isFocused = useIsFocused();

  const {
    workers,
    master,
    isLoading,
    fetchWorkers,
    fetchMasterStatus,
    startPolling,
    stopPolling,
  } = useClusterStore();

  // Header entrance animation
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-16)).current;

  useEffect(() => {
    fetchWorkers();
    fetchMasterStatus();
    startPolling(5000);

    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(headerTranslateY, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start();

    return () => stopPolling();
  }, []);

  const onRefresh = useCallback(() => {
    fetchWorkers();
    fetchMasterStatus();
  }, []);

  return (
    <View style={styles.flex}>
      <FlatList
        data={workers}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 96 }}

        ListHeaderComponent={
          <Animated.View style={{
            opacity: headerOpacity,
            transform: [{ translateY: headerTranslateY }],
          }}>
            <Card
              style={styles.masterCard}
              mode="contained"
              onPress={() => navigation.navigate('MasterNode')}  // stack screen ✓
            >
              <Card.Content>
                <View style={styles.masterHeader}>
                  <Text variant="titleLarge">Orchestrator</Text>
                  {master
                    ? <StatusChip status={master.status} />
                    : <StatusChip status="unknown" />
                  }
                </View>

                {master ? (
                  <View style={styles.statsRow}>
                    <Stat label="Workers" value={`${master.onlineWorkers}/${master.totalWorkers}`} />
                    <Stat label="Queued" value={`${master.queuedWorkloads}`} />
                    <Stat label="Processing" value={`${master.processingWorkloads}`} />
                    <Stat label="Throughput" value={`${master.throughputPerMin}/min`} />
                  </View>
                ) : (
                  <Text variant="bodyMedium" style={styles.subtle}>
                    {isLoading ? 'Connecting to orchestrator…' : 'Cannot reach backend — pull to retry'}
                  </Text>
                )}

                <Text variant="labelSmall" style={styles.tapHint}>
                  Tap for full orchestrator details →
                </Text>
              </Card.Content>
            </Card>
          </Animated.View>
        }

        renderItem={({ item }) => (
          <WorkerCard
            worker={item}
            onPress={() => navigation.navigate('WorkerDetail', { workerId: item.id })}
          />
        )}

        ListEmptyComponent={
          !isLoading ? (
            <EmptyState
              title="No workers found"
              subtitle="Start a worker and pull down to refresh"
            />
          ) : null
        }
      />

      <FAB
        icon="plus"
        label="Submit Workload"
        style={styles.fab}
        // Navigate to tab screen using jumpTo
        onPress={() => navigation.navigate('WorkloadInput')}
      />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text variant="titleMedium">{value}</Text>
      <Text variant="labelSmall" style={styles.subtle}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  masterCard: { margin: 16, marginBottom: 8 },
  masterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  tapHint: { marginTop: 10, opacity: 0.5 },
  fab: { position: 'absolute', right: 16, bottom: 16 },
  subtle: { opacity: 0.6 },
});