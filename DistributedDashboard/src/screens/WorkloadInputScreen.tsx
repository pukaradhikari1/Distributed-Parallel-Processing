// src/screens/WorkloadInputScreen.tsx
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Button,
  Card,
  Chip,
  Divider,
  Menu,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import { useClusterStore } from '../store/useClusterStore';
import StatusChip from '../components/StatusChip';
import EmptyState from '../components/EmptyState';

// ── Types ─────────────────────────────────────────────────────────────────────
interface PickedFile {
  name: string;
  size: number;
  uri: string;
  type: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── File Picker (uses React Native's DocumentPicker if available) ──────────────
async function pickFile(accept: 'py' | 'zip'): Promise<PickedFile | null> {
  try {
    const { pick, types, isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
    const acceptedTypes =
      accept === 'py'
        ? [types.plainText, 'text/x-python', 'application/octet-stream']
        : [types.zip, 'application/zip', 'application/x-zip-compressed'];

    // copyTo: 'cachesDirectory' ensures we get a real file:// uri that RN's
    // networking layer can reliably stream for multipart upload, instead of
    // a content:// uri that may not be readable directly.
    const [result] = await pick({ type: acceptedTypes, copyTo: 'cachesDirectory' });
    return {
      name: result.name ?? 'unknown',
      size: result.size ?? 0,
      uri: result.uri,
      type: result.type ?? '',
    };
  } catch (err: any) {
    try {
      const { isErrorWithCode, errorCodes } = require('@react-native-documents/picker');
      if (isErrorWithCode(err) && err.code === errorCodes.OPERATION_CANCELED) return null;
    } catch { }
    // DocumentPicker not installed, or some other error — fall back to manual path
    return null;
  }
}

// ── File Badge ─────────────────────────────────────────────────────────────────
function FileBadge({
  file,
  onRemove,
  color = '#1E6FA8',
}: {
  file: PickedFile;
  onRemove: () => void;
  color?: string;
}) {
  return (
    <View style={[styles.fileBadge, { borderColor: color }]}>
      <View style={{ flex: 1 }}>
        <Text variant="labelMedium" numberOfLines={1} style={{ color }}>
          {file.name}
        </Text>
        <Text variant="bodySmall" style={styles.subtle}>
          {formatBytes(file.size)}
        </Text>
      </View>
      <TouchableOpacity onPress={onRemove} style={styles.removeBtn} hitSlop={8}>
        <Text style={{ color: '#EF4444', fontSize: 16, fontWeight: '700' }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Upload Button ──────────────────────────────────────────────────────────────
function UploadButton({
  label,
  hint,
  onPress,
  disabled,
}: {
  label: string;
  hint: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
      style={[styles.uploadBtn, disabled && styles.uploadBtnDisabled]}
    >
      <Text style={styles.uploadIcon}>⬆</Text>
      <View style={{ flex: 1 }}>
        <Text variant="labelLarge" style={styles.uploadLabel}>
          {label}
        </Text>
        <Text variant="bodySmall" style={styles.subtle}>
          {hint}
        </Text>
      </View>
      <Text style={styles.uploadArrow}>›</Text>
    </TouchableOpacity>
  );
}

// ── Animated job card ─────────────────────────────────────────────────────────
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

// ══════════════════════════════════════════════════════════════════════════════
// MAIN SCREEN
// ══════════════════════════════════════════════════════════════════════════════
export default function WorkloadInputScreen() {
  const { workloads, fetchWorkloads, submitWorkload } = useClusterStore();

  // Form state
  const [jobName, setJobName] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Worker count state
  const [workerCount, setWorkerCount] = useState(1);
  const [workerMenuVisible, setWorkerMenuVisible] = useState(false);

  // File state
  const [pyFile, setPyFile] = useState<PickedFile | null>(null);
  const [pyPath, setPyPath] = useState('');   // manual path fallback
  const [zipFile, setZipFile] = useState<PickedFile | null>(null);
  const [zipPath, setZipPath] = useState('');  // manual path fallback
  const [showManualPy, setShowManualPy] = useState(false);
  const [showManualZip, setShowManualZip] = useState(false);

  // Entrance animation
  const formOpacity = useRef(new Animated.Value(0)).current;
  const formTranslateY = useRef(new Animated.Value(28)).current;

  useEffect(() => {
    fetchWorkloads();
    Animated.parallel([
      Animated.timing(formOpacity, { toValue: 1, duration: 420, useNativeDriver: true }),
      Animated.timing(formTranslateY, { toValue: 0, duration: 420, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── File pickers ─────────────────────────────────────────────────────────────
  const handlePickPy = async () => {
    const file = await pickFile('py');
    if (file) {
      if (!file.name.endsWith('.py')) {
        Alert.alert('Wrong file type', 'Please select a .py Python script.');
        return;
      }
      setPyFile(file);
      setShowManualPy(false);
    } else {
      // DocumentPicker not available — show manual input
      setShowManualPy(true);
    }
  };

  const handlePickZip = async () => {
    const file = await pickFile('zip');
    if (file) {
      if (!file.name.endsWith('.zip')) {
        Alert.alert('Wrong file type', 'Please select a .zip archive.');
        return;
      }
      setZipFile(file);
      setShowManualZip(false);
    } else {
      setShowManualZip(true);
    }
  };

  // ── Validation ────────────────────────────────────────────────────────────────
  const hasPyFile = !!pyFile || pyPath.trim().endsWith('.py');
  const canSubmit = !submitting && jobName.trim().length > 0 && hasPyFile;

  // ── Submit ────────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);

    const result = await submitWorkload({
      name: jobName.trim(),
      type: 'python-script',
      payload: '', // no longer used for file transfer — kept for the Workload record only
      priority: 'normal',
      pyFileUri: pyFile?.uri || undefined,
      pyFileName: pyFile?.name || (pyPath ? pyPath.split('/').pop() : undefined),
      zipFileUri: zipFile?.uri || undefined,
      zipFileName: zipFile?.name || (zipPath ? zipPath.split('/').pop() : undefined),
      notes: notes.trim(),
      workerCount,
    });

    setSubmitting(false);
    if (result) {
      setSnackbar(`Job "${result.name}" submitted`);
      setJobName('');
      setNotes('');
      setPyFile(null);
      setPyPath('');
      setZipFile(null);
      setZipPath('');
      setShowManualPy(false);
      setShowManualZip(false);
      setWorkerCount(1);
    } else {
      // Show the real backend error message instead of a generic fallback,
      // e.g. "Not enough workers available" rather than "Failed to submit job".
      const err = useClusterStore.getState().error;
      setSnackbar(err ?? 'Failed to submit job');
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <View style={styles.flex}>
      <FlatList
        data={workloads}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 48 }}
        ListHeaderComponent={
          <Animated.View style={{ opacity: formOpacity, transform: [{ translateY: formTranslateY }] }}>

            {/* ── Job Details ─────────────────────────────────────────────── */}
            <Card style={styles.card} mode="contained">
              <Card.Title title="Job Details" titleVariant="titleMedium" />
              <Card.Content>
                <TextInput
                  label="Job name *"
                  value={jobName}
                  onChangeText={setJobName}
                  mode="outlined"
                  style={styles.input}
                  left={<TextInput.Icon icon="tag-outline" />}
                  placeholder="e.g. Train ResNet batch 12"
                />

                {/* Worker Count selector */}
                <Text variant="labelLarge" style={styles.workerCountLabel}>
                  Workers to Use
                </Text>
                <Menu
                  visible={workerMenuVisible}
                  onDismiss={() => setWorkerMenuVisible(false)}
                  anchor={
                    <Button
                      mode="outlined"
                      onPress={() => setWorkerMenuVisible(true)}
                      icon="menu-down"
                      contentStyle={{ flexDirection: 'row-reverse' }}
                      style={styles.workerCountBtn}
                    >
                      {workerCount}
                    </Button>
                  }
                >
                  {[1, 2, 3, 4, 5, 6, 7, 8].map(n => (
                    <Menu.Item
                      key={n}
                      onPress={() => {
                        setWorkerCount(n);
                        setWorkerMenuVisible(false);
                      }}
                      title={`${n}`}
                    />
                  ))}
                </Menu>
              </Card.Content>
            </Card>

            {/* ── Python Script ────────────────────────────────────────────── */}
            <Card style={styles.card} mode="contained">
              <Card.Title
                title="Python Script *"
                titleVariant="titleMedium"
                subtitle="Required — .py file to execute on the worker"
                subtitleVariant="bodySmall"
              />
              <Card.Content>

                {/* Picked file badge */}
                {pyFile && (
                  <FileBadge
                    file={pyFile}
                    color="#1E6FA8"
                    onRemove={() => { setPyFile(null); setShowManualPy(false); }}
                  />
                )}

                {/* Upload button — shown when no file picked */}
                {!pyFile && (
                  <UploadButton
                    label="Upload .py file"
                    hint="Tap to browse and select your Python script"
                    onPress={handlePickPy}
                  />
                )}

                {/* Manual path fallback */}
                {(showManualPy && !pyFile) && (
                  <View style={{ marginTop: 10 }}>
                    <Text variant="bodySmall" style={[styles.subtle, { marginBottom: 6 }]}>
                      Or enter the file path manually:
                    </Text>
                    <TextInput
                      label="Path to .py file"
                      value={pyPath}
                      onChangeText={setPyPath}
                      mode="outlined"
                      autoCapitalize="none"
                      autoCorrect={false}
                      left={<TextInput.Icon icon="language-python" />}
                      placeholder="/jobs/train.py or s3://bucket/train.py"
                    />
                  </View>
                )}

                {/* Show manual path option if picker unavailable */}
                {!pyFile && !showManualPy && (
                  <Button
                    mode="text"
                    compact
                    onPress={() => setShowManualPy(true)}
                    style={{ marginTop: 6, alignSelf: 'flex-start' }}
                  >
                    Enter path manually instead
                  </Button>
                )}

              </Card.Content>
            </Card>

            {/* ── Image Dataset (ZIP) ────────────────────────────────────── */}
            <Card style={styles.card} mode="contained">
              <Card.Title
                title="Image Dataset"
                titleVariant="titleMedium"
                subtitle="Optional — .zip archive of training images"
                subtitleVariant="bodySmall"
                right={() => <Chip style={{ marginRight: 16 }} compact>Optional</Chip>}
              />
              <Card.Content>

                {/* Picked zip badge */}
                {zipFile && (
                  <FileBadge
                    file={zipFile}
                    color="#0D9488"
                    onRemove={() => { setZipFile(null); setShowManualZip(false); }}
                  />
                )}

                {/* Upload button */}
                {!zipFile && (
                  <UploadButton
                    label="Upload .zip dataset"
                    hint="Tap to browse and select your image archive"
                    onPress={handlePickZip}
                  />
                )}

                {/* Manual path fallback */}
                {(showManualZip && !zipFile) && (
                  <View style={{ marginTop: 10 }}>
                    <Text variant="bodySmall" style={[styles.subtle, { marginBottom: 6 }]}>
                      Or enter the file path manually:
                    </Text>
                    <TextInput
                      label="Path to .zip file"
                      value={zipPath}
                      onChangeText={setZipPath}
                      mode="outlined"
                      autoCapitalize="none"
                      autoCorrect={false}
                      left={<TextInput.Icon icon="folder-zip-outline" />}
                      placeholder="/data/images.zip or s3://bucket/batch.zip"
                    />
                  </View>
                )}

                {!zipFile && !showManualZip && (
                  <Button
                    mode="text"
                    compact
                    onPress={() => setShowManualZip(true)}
                    style={{ marginTop: 6, alignSelf: 'flex-start' }}
                  >
                    Enter path manually instead
                  </Button>
                )}

                {/* Format info */}
                <Divider style={{ marginTop: 12, marginBottom: 8 }} />
                <Text variant="bodySmall" style={styles.subtle}>
                  Accepted: JPEG, PNG, TIFF, WebP inside the .zip · Max 500 MB
                </Text>

              </Card.Content>
            </Card>

            {/* ── Notes ──────────────────────────────────────────────────── */}
            <Card style={styles.card} mode="contained">
              <Card.Title
                title="Notes"
                titleVariant="titleMedium"
                right={() => <Chip style={{ marginRight: 16 }} compact>Optional</Chip>}
              />
              <Card.Content>
                <TextInput
                  label="Additional instructions"
                  value={notes}
                  onChangeText={setNotes}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  style={styles.input}
                  left={<TextInput.Icon icon="note-text-outline" />}
                  placeholder="e.g. Use GPU node, skip validation, epochs=20…"
                />
              </Card.Content>
            </Card>

            {/* ── Submit ─────────────────────────────────────────────────── */}
            <View style={styles.submitRow}>
              {/* Validation hints */}
              {!jobName.trim() && (
                <Text variant="bodySmall" style={styles.hint}>• Job name is required</Text>
              )}
              {!hasPyFile && (
                <Text variant="bodySmall" style={styles.hint}>• Python script is required</Text>
              )}

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

            {/* ── Recent jobs header ──────────────────────────────────────── */}
            {workloads.length > 0 && (
              <Text variant="labelLarge" style={styles.recentLabel}>
                Recent Jobs
              </Text>
            )}

          </Animated.View>
        }
        ListEmptyComponent={
          <EmptyState
            title="No jobs yet"
            subtitle="Upload a Python script above and submit your first job"
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
  input: { marginBottom: 4 },
  subtle: { opacity: 0.6 },

  workerCountLabel: { marginTop: 12, marginBottom: 6, opacity: 0.8 },
  workerCountBtn: { alignSelf: 'flex-start', minWidth: 72 },

  // Upload button
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderColor: '#1E6FA8',
    borderStyle: 'dashed',
    borderRadius: 10,
    padding: 14,
    backgroundColor: '#0A1A2A',
    marginBottom: 4,
  },
  uploadBtnDisabled: { opacity: 0.4 },
  uploadIcon: { fontSize: 22, color: '#1E6FA8' },
  uploadLabel: { color: '#2A7FC1', marginBottom: 2 },
  uploadArrow: { fontSize: 22, color: '#2A7FC1', opacity: 0.6 },

  // File badge
  fileBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#0A1A2A',
    marginBottom: 8,
    gap: 10,
  },
  removeBtn: { padding: 4 },

  // Submit
  submitRow: { margin: 16, marginTop: 20, gap: 6 },
  hint: { color: '#F59E0B', opacity: 0.8, marginLeft: 2 },
  submitBtn: { borderRadius: 10, marginTop: 6 },
  submitContent: { paddingVertical: 6 },

  // Job history
  recentLabel: { marginHorizontal: 16, marginTop: 20, marginBottom: 4, opacity: 0.5 },
  itemCard: { marginHorizontal: 16, marginVertical: 6 },
  itemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});