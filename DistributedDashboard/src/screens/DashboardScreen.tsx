// src/screens/DashboardScreen.tsx
import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Card, FAB, Text } from 'react-native-paper';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useClusterStore } from '../store/useClusterStore';
import WorkerCard from '../components/WorkerCard';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Dashboard'>,
  NativeStackScreenProps<RootStackParamList>
>;

// Pulsing status dot
function PulseDot({ color = '#00BFA6' }: { color?: string }) {
  const scale = useRef(new Animated.Value(1)).current;
  const opacity = useRef(new Animated.Value(0.85)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.parallel([
        Animated.timing(scale, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(scale, { toValue: 1, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.85, duration: 0, useNativeDriver: true }),
      ]),
    ])).start();
  }, []);
  return (
    <View style={styles.dotWrapper}>
      <Animated.View style={[styles.dotRing, { borderColor: color, transform: [{ scale }], opacity }]} />
      <View style={[styles.dotCore, { backgroundColor: color }]} />
    </View>
  );
}

// Stat with pop-in on value change
function AnimatedStat({ label, value }: { label: string; value: string }) {
  const scale = useRef(new Animated.Value(0.75)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [value]);
  return (
    <View style={styles.stat}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Text variant="titleMedium">{value}</Text>
      </Animated.View>
      <Text variant="labelSmall" style={{ opacity: 0.6 }}>{label}</Text>
    </View>
  );
}

// Staggered worker card
function AnimatedWorkerCard({ item, index, onPress }: { item: any; index: number; onPress: () => void }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(32)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay: index * 75, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay: index * 75, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      <WorkerCard worker={item} onPress={onPress} />
    </Animated.View>
  );
}

export default function DashboardScreen({ navigation }: Props) {
  const { workers, master, isLoading, fetchWorkers, fetchMasterStatus, startPolling, stopPolling } = useClusterStore();

  // Header slide-down
  const headerOpacity = useRef(new Animated.Value(0)).current;
  const headerTranslateY = useRef(new Animated.Value(-24)).current;
  // FAB spring-in
  const fabScale = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    fetchWorkers();
    fetchMasterStatus();
    startPolling(5000);
    Animated.parallel([
      Animated.timing(headerOpacity, { toValue: 1, duration: 450, useNativeDriver: true }),
      Animated.timing(headerTranslateY, { toValue: 0, duration: 450, useNativeDriver: true }),
      Animated.spring(fabScale, { toValue: 1, friction: 5, delay: 500, useNativeDriver: true }),
    ]).start();
    return () => stopPolling();
  }, []);

  const onRefresh = useCallback(() => { fetchWorkers(); fetchMasterStatus(); }, []);

  const dotColor = master?.status === 'healthy' ? '#00BFA6' : master?.status === 'degraded' ? '#FFA000' : '#EF5350';

  return (
    <View style={styles.flex}>
      <FlatList
        data={workers}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={onRefresh} />}
        ListHeaderComponent={
          <Animated.View style={{ opacity: headerOpacity, transform: [{ translateY: headerTranslateY }] }}>
            <Card style={styles.masterCard} mode="contained" onPress={() => navigation.navigate('MasterNode')}>
              <Card.Content>
                <View style={styles.masterHeader}>
                  <View style={styles.masterTitleRow}>
                    {master && <PulseDot color={dotColor} />}
                    <Text variant="titleLarge">Orchestrator</Text>
                  </View>
                  {master && <StatusChip status={master.status} />}
                </View>
                {master ? (
                  <View style={styles.statsRow}>
                    <AnimatedStat label="Workers" value={`${master.onlineWorkers}/${master.totalWorkers}`} />
                    <AnimatedStat label="Queued" value={`${master.queuedWorkloads}`} />
                    <AnimatedStat label="Processing" value={`${master.processingWorkloads}`} />
                    <AnimatedStat label="Throughput" value={`${master.throughputPerMin}/min`} />
                  </View>
                ) : (
                  <Text variant="bodyMedium" style={{ opacity: 0.6 }}>Loading master status…</Text>
                )}
                <Text variant="labelSmall" style={styles.tapHint}>Tap for full orchestrator details →</Text>
              </Card.Content>
            </Card>
          </Animated.View>
        }
        renderItem={({ item, index }) => (
          <AnimatedWorkerCard
            item={item}
            index={index}
            onPress={() => navigation.navigate('WorkerDetail', { workerId: item.id })}
          />
        )}
        ListEmptyComponent={!isLoading ? <EmptyState title="No workers found" subtitle="Pull down to refresh" /> : null}
        contentContainerStyle={{ paddingBottom: 96 }}
      />
      <Animated.View style={[styles.fabWrapper, { transform: [{ scale: fabScale }] }]}>
        <FAB icon="plus" label="Submit Workload" style={styles.fab} onPress={() => navigation.navigate('WorkloadInput')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  masterCard: { margin: 16, marginBottom: 8 },
  masterHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  masterTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { alignItems: 'center', flex: 1 },
  tapHint: { marginTop: 10, opacity: 0.5 },
  fabWrapper: { position: 'absolute', right: 16, bottom: 16 },
  fab: {},
  dotWrapper: { width: 18, height: 18, alignItems: 'center', justifyContent: 'center' },
  dotCore: { width: 8, height: 8, borderRadius: 4, position: 'absolute' },
  dotRing: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, position: 'absolute' },
});