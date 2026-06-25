// src/screens/ErrorLogScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, View } from 'react-native';
import { Button, Card, Chip, Text } from 'react-native-paper';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainTabParamList, RootStackParamList } from '../navigation/types';
import { useClusterStore } from '../store/useClusterStore';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';
import { ErrorSeverity } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Errors'>,
  NativeStackScreenProps<RootStackParamList>
>;

const SEVERITIES: ErrorSeverity[] = ['low', 'medium', 'high', 'critical'];

function AnimatedErrorCard({ item, index, navigation }: { item: any; index: number; navigation: any }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(-30)).current; // slide from left for errors = feels urgent
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 320, delay: index * 60, useNativeDriver: true }),
      Animated.timing(translateX, { toValue: 0, duration: 320, delay: index * 60, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateX }] }}>
      <Card style={styles.card} mode="contained">
        <Card.Content>
          <View style={styles.headerRow}>
            <Text variant="titleSmall">{item.workerName}</Text>
            <StatusChip status={item.severity} compact />
          </View>
          <Text variant="bodyMedium" style={styles.message}>{item.message}</Text>
          <Text variant="labelSmall" style={styles.subtle}>
            {new Date(item.timestamp).toLocaleString()}
            {item.taskId ? ` · task ${item.taskId.slice(0, 8)}` : ''}
          </Text>
          <Button
            compact mode="text" style={styles.reassignLink}
            onPress={() => navigation.navigate('Reassignment', { sourceWorkerId: item.workerId, workloadId: item.taskId })}
          >
            Reassign affected task →
          </Button>
        </Card.Content>
      </Card>
    </Animated.View>
  );
}

export default function ErrorLogScreen({ navigation }: Props) {
  const { errors, fetchErrors, isLoading } = useClusterStore();
  const [severityFilter, setSeverityFilter] = useState<ErrorSeverity | null>(null);

  const filterOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fetchErrors();
    const interval = setInterval(() => fetchErrors(), 6000);
    Animated.timing(filterOpacity, { toValue: 1, duration: 400, useNativeDriver: true }).start();
    return () => clearInterval(interval);
  }, []);

  const filtered = severityFilter ? errors.filter(e => e.severity === severityFilter) : errors;
  const sorted = [...filtered].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));

  return (
    <View style={styles.flex}>
      <Animated.View style={[styles.filterRow, { opacity: filterOpacity }]}>
        {SEVERITIES.map(sev => (
          <Chip
            key={sev}
            selected={severityFilter === sev}
            onPress={() => setSeverityFilter(severityFilter === sev ? null : sev)}
            style={styles.filterChip}
            compact
          >
            {sev}
          </Chip>
        ))}
      </Animated.View>

      <FlatList
        data={sorted}
        keyExtractor={item => item.id}
        refreshing={isLoading}
        onRefresh={() => fetchErrors()}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={<EmptyState title="No errors" subtitle="Worker errors will show up here in real time" />}
        renderItem={({ item, index }) => (
          <AnimatedErrorCard item={item} index={index} navigation={navigation} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 16, paddingTop: 12, gap: 8 },
  filterChip: { marginRight: 8, marginBottom: 8 },
  card: { marginHorizontal: 16, marginVertical: 6 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  message: { marginTop: 8 },
  subtle: { opacity: 0.6, marginTop: 6 },
  reassignLink: { alignSelf: 'flex-start', marginTop: 4, marginLeft: -8 },
});