// src/screens/WorkloadInputScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, View } from 'react-native';
import { Button, Card, SegmentedButtons, Snackbar, Text, TextInput } from 'react-native-paper';
import { useClusterStore } from '../store/useClusterStore';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';

const WORKLOAD_TYPES = [
  { value: 'matrix-multiply', label: 'Matrix' },
  { value: 'image-processing', label: 'Image' },
  { value: 'data-aggregation', label: 'Data Agg' },
];

function AnimatedWorkloadCard({ item, index }: { item: any; index: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 300, delay: index * 55, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 300, delay: index * 55, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={[styles.itemCard, { opacity, transform: [{ translateY }] }]}>
      <Card mode="contained">
        <Card.Content style={styles.itemRow}>
          <View style={{ flex: 1 }}>
            <Text variant="titleSmall">{item.name}</Text>
            <Text variant="bodySmall" style={styles.subtle}>
              {item.type} · {item.priority} priority · attempt {item.attempt}
            </Text>
          </View>
          <StatusChip status={item.status} compact />
        </Card.Content>
      </Card>
    </Animated.View>
  );
}

export default function WorkloadInputScreen() {
  const { workloads, fetchWorkloads, submitWorkload } = useClusterStore();
  const [name, setName] = useState('');
  const [type, setType] = useState(WORKLOAD_TYPES[0].value);
  const [payload, setPayload] = useState('');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high'>('normal');
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    fetchWorkloads();
    Animated.parallel([
      Animated.timing(formOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(formTranslateY, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }, []);

  const handleSubmit = async () => {
    if (!name.trim() || !payload.trim()) return;
    setSubmitting(true);
    const result = await submitWorkload({ name: name.trim(), type, payload: payload.trim(), priority });
    setSubmitting(false);
    if (result) {
      setSnackbar(`Workload "${result.name}" submitted`);
      setName('');
      setPayload('');
    } else {
      setSnackbar('Failed to submit workload');
    }
  };

  return (
    <View style={styles.flex}>
      <FlatList
        data={workloads}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 32 }}
        ListHeaderComponent={
          <Animated.View style={{ opacity: formOpacity, transform: [{ translateY: formTranslateY }] }}>
            <Card style={styles.formCard} mode="contained">
              <Card.Content>
                <Text variant="titleMedium" style={styles.sectionTitle}>New Workload</Text>
                <TextInput label="Name" value={name} onChangeText={setName} mode="outlined" style={styles.input} left={<TextInput.Icon icon="tag-outline" />} />
                <Text variant="labelLarge" style={styles.label}>Type</Text>
                <SegmentedButtons value={type} onValueChange={setType} buttons={WORKLOAD_TYPES} style={styles.input} />
                <TextInput
                  label="Payload (JSON or text)"
                  value={payload}
                  onChangeText={setPayload}
                  mode="outlined"
                  multiline
                  numberOfLines={4}
                  style={styles.input}
                  left={<TextInput.Icon icon="code-braces" />}
                />
                <Text variant="labelLarge" style={styles.label}>Priority</Text>
                <SegmentedButtons
                  value={priority}
                  onValueChange={v => setPriority(v as typeof priority)}
                  buttons={[
                    { value: 'low', label: 'Low' },
                    { value: 'normal', label: 'Normal' },
                    { value: 'high', label: 'High' },
                  ]}
                  style={styles.input}
                />
                <Button
                  mode="contained"
                  onPress={handleSubmit}
                  loading={submitting}
                  disabled={submitting || !name.trim() || !payload.trim()}
                  icon="send"
                >
                  Submit Workload
                </Button>
              </Card.Content>
            </Card>
          </Animated.View>
        }
        ListEmptyComponent={<EmptyState title="No workloads yet" subtitle="Submit one above to get started" />}
        renderItem={({ item, index }) => <AnimatedWorkloadCard item={item} index={index} />}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={2500}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  formCard: { margin: 16, marginBottom: 8 },
  sectionTitle: { marginBottom: 12 },
  label: { marginBottom: 6, marginTop: 4 },
  input: { marginBottom: 14 },
  itemCard: { marginHorizontal: 16, marginVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  subtle: { opacity: 0.6, marginTop: 2 },
});