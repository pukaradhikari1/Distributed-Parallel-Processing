// src/screens/WorkloadInputScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import { Animated, FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Card,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { useClusterStore } from '../store/useClusterStore';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';

// ── Animated workload list card ───────────────────────────────────────────────
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

// ── Main screen ───────────────────────────────────────────────────────────────
export default function WorkloadInputScreen() {
  const { workloads, fetchWorkloads, submitWorkload } = useClusterStore();

  const [jobName, setJobName] = useState('');
  const [pyFilePath, setPyFilePath] = useState('');
  const [zipFilePath, setZipFilePath] = useState('');
  const [zipNotes, setZipNotes] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Slide-in animation
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    fetchWorkloads();
    Animated.parallel([
      Animated.timing(formOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(formTranslateY, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }, []);

  const canSubmit = !submitting && jobName.trim() && pyFilePath.trim();

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const payload = JSON.stringify({
      py_file: pyFilePath.trim(),
      zip_file: zipFilePath.trim(),
      zip_notes: zipNotes.trim(),
      notes: notes.trim(),
    });

    const result = await submitWorkload({
      name: jobName.trim(),
      type: 'python-script',
      payload,
      priority: 'normal',
    });

    setSubmitting(false);
    if (result) {
      setSnackbar(`Job "${result.name}" submitted`);
      setJobName('');
      setPyFilePath('');
      setZipFilePath('');
      setZipNotes('');
      setNotes('');
    } else {
      setSnackbar('Failed to submit job');
    }
  };

  return (
    <View style={styles.flex}>
      <FlatList
        data={workloads}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <Animated.View style={{ opacity: formOpacity, transform: [{ translateY: formTranslateY }] }}>

            {/* ── Job name ── */}
            <Card style={styles.card} mode="contained">
              <Card.Title title="Job Details" titleVariant="titleMedium" />
              <Card.Content>
                <TextInput
                  label="Job name"
                  value={jobName}
                  onChangeText={setJobName}
                  mode="outlined"
                  style={styles.input}
                  left={<TextInput.Icon icon="tag-outline" />}
                  placeholder="e.g. Training run batch 12"
                />
              </Card.Content>
            </Card>

            {/* ── Python file ── */}
            <Card style={styles.card} mode="contained">
              <Card.Title title="Python Script" titleVariant="titleMedium" />
              <Card.Content>
                <TextInput
                  label=".py file path"
                  value={pyFilePath}
                  onChangeText={setPyFilePath}
                  mode="outlined"
                  style={styles.input}
                  left={<TextInput.Icon icon="language-python" />}
                  placeholder="e.g. /scripts/train.py or s3://bucket/job.py"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </Card.Content>
            </Card>

            {/* ── ZIP images (optional) ── */}
            <Card style={styles.card} mode="contained">
              <Card.Title title="Image Dataset (optional)" titleVariant="titleMedium" />
              <Card.Content>
                <TextInput
                  label=".zip file path"
                  value={zipFilePath}
                  onChangeText={setZipFilePath}
                  mode="outlined"
                  style={styles.input}
                  left={<TextInput.Icon icon="folder-zip-outline" />}
                  placeholder="e.g. /data/images.zip or s3://bucket/batch.zip"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <TextInput
                  label="Image dataset notes (optional)"
                  value={zipNotes}
                  onChangeText={setZipNotes}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  style={styles.input}
                  left={<TextInput.Icon icon="image-multiple-outline" />}
                  placeholder="e.g. Contains 1 200 satellite crops, RGB, 256×256 px…"
                />
              </Card.Content>
            </Card>

            {/* ── Notes (optional) ── */}
            <Card style={styles.card} mode="contained">
              <Card.Title title="Notes (optional)" titleVariant="titleMedium" />
              <Card.Content>
                <TextInput
                  label="Additional context or instructions"
                  value={notes}
                  onChangeText={setNotes}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  style={styles.input}
                  left={<TextInput.Icon icon="note-text-outline" />}
                  placeholder="e.g. Run with GPU node, skip validation step…"
                />
              </Card.Content>
            </Card>

            {/* ── Submit ── */}
            <View style={styles.submitRow}>
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={submitting}
                disabled={!canSubmit}
                icon="send"
                style={styles.submitBtn}
                contentStyle={styles.submitContent}
              >
                Submit Job
              </Button>
            </View>

          </Animated.View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No jobs yet"
            subtitle="Submit a Python script above to get started"
          />
        }
        renderItem={({ item, index }) => (
          <AnimatedWorkloadCard item={item} index={index} />
        )}
      />

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)} duration={2500}>
        {snackbar}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { margin: 16, marginBottom: 0, marginTop: 16 },
  input: { marginBottom: 8 },
  subtle: { opacity: 0.6 },
  submitRow: { margin: 16, marginTop: 20 },
  submitBtn: { borderRadius: 10 },
  submitContent: { paddingVertical: 6 },
  itemCard: { marginHorizontal: 16, marginVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});