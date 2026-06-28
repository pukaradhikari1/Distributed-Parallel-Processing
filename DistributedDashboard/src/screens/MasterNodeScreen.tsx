// src/screens/MasterNodeScreen.tsx
import React, { useEffect, useRef } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Card, Text } from 'react-native-paper';
import { VictoryAxis, VictoryChart, VictoryLine, VictoryTheme } from 'victory-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/types';
import { useClusterStore } from '../store/useClusterStore';
import StatusChip from '../components/StatusChip';

type Props = NativeStackScreenProps<RootStackParamList, 'MasterNode'>;

function formatUptime(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

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

export default function MasterNodeScreen({ }: Props) {
  const { master, throughputHistory, isLoading, fetchMasterStatus } = useClusterStore();
  const { width } = useWindowDimensions();

  useEffect(() => { fetchMasterStatus(); }, []);

  const chartData = throughputHistory.map((s, i) => ({ x: i, y: s.value }));

  return (
    <ScrollView
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={fetchMasterStatus} />}
      contentContainerStyle={styles.container}
    >
      <AnimatedCard delay={0}>
        <View style={styles.headerRow}>
          <Text variant="headlineSmall">Orchestrator</Text>
          {master && <StatusChip status={master.status} />}
        </View>
      </AnimatedCard>

      {master ? (
        <>
          <AnimatedCard delay={100} style={styles.card}>
            <Card mode="contained">
              <Card.Content>
                <Row label="Master ID" value={master.id} />
                <Row label="Uptime" value={formatUptime(master.uptimeSeconds)} />
                <Row label="Workers online" value={`${master.onlineWorkers} / ${master.totalWorkers}`} />
                <Row label="Queued workloads" value={`${master.queuedWorkloads}`} />
                <Row label="Processing workloads" value={`${master.processingWorkloads}`} />
                <Row label="Throughput" value={`${master.throughputPerMin} tasks/min`} />
                {master.lastElectionAt && (
                  <Row label="Last leader election" value={new Date(master.lastElectionAt).toLocaleString()} />
                )}
              </Card.Content>
            </Card>
          </AnimatedCard>

          <AnimatedCard delay={200} style={styles.card}>
            <Card mode="contained">
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                  Throughput (last {chartData.length} min)
                </Text>
                {chartData.length > 1 ? (
                  <VictoryChart
                    theme={VictoryTheme.material}
                    width={width - 64}
                    height={200}
                    padding={{ top: 10, bottom: 30, left: 40, right: 20 }}
                  >
                    <VictoryAxis dependentAxis style={{ tickLabels: { fill: '#8B96A5', fontSize: 10 } }} />
                    <VictoryAxis style={{ tickLabels: { fill: 'transparent' } }} />
                    <VictoryLine
                      data={chartData}
                      style={{ data: { stroke: '#00BFA6', strokeWidth: 2 } }}
                      interpolation="monotoneX"
                    />
                  </VictoryChart>
                ) : (
                  <Text style={styles.subtle}>Not enough data yet</Text>
                )}
              </Card.Content>
            </Card>
          </AnimatedCard>
        </>
      ) : (
        <Text style={styles.subtle}>Loading orchestrator status…</Text>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text variant="bodyMedium" style={styles.subtle}>{label}</Text>
      <Text variant="bodyMedium">{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  card: { marginBottom: 16 },
  sectionTitle: { marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  subtle: { opacity: 0.6 },
});