import React, { useState, useEffect, useMemo } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Avatar, Button, Card, Chip, Divider, Text, TextInput } from 'react-native-paper';
import {
  useAuthStore,
  selectUser,
  selectProfile,
  selectIsPremium,
  selectMemberSince,
  selectDisplayName,
} from '../store/useAuthStore';

export default function ProfileScreen() {
  // 1. SELECTORS (Store Hooks)
  const user = useAuthStore(selectUser);
  const profile = useAuthStore(selectProfile);
  const isPremium = useAuthStore(selectIsPremium);
  const memberSince = useAuthStore(selectMemberSince);
  const displayName = useAuthStore(selectDisplayName);

  const isLoading = useAuthStore(s => s.isLoading);
  const isProfileLoading = useAuthStore(s => s.isProfileLoading);
  const logout = useAuthStore(s => s.logout);
  const deleteAccount = useAuthStore(s => s.deleteAccount);
  const updateProfile = useAuthStore(s => s.updateProfile);
  const error = useAuthStore(s => s.error);

  // 2. STATE HOOKS
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');

  // 3. EFFECT HOOKS
  // Sync local edit state with profile data when it loads from the server
  useEffect(() => {
    if (profile) {
      setEditName(profile.displayName ?? '');
      setEditBio('');
    }
  }, [profile]);

  // 4. MEMO HOOKS
  // Fixes "Invalid Date" by handling Firebase timestamps or ISO strings
  const formattedDate = useMemo(() => {
    if (!memberSince) return '—';
    try {
      let d;
      if (
        typeof memberSince === 'object' &&
        memberSince !== null &&
        'seconds' in memberSince
      ) {
        // Handle Firebase Timestamp
        const timestamp = memberSince as { seconds: number; nanoseconds?: number };
        d = new Date(timestamp.seconds * 1000);
      } else {
        // Handle String or Number
        d = new Date(memberSince as string | number);
      }

      if (isNaN(d.getTime())) return '—';

      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (e) {
      return '—';
    }
  }, [memberSince]);

  // Generates safe initials for the Avatar
  const initials = useMemo(() => {
    return (displayName || user?.username || 'U')
      .split(' ')
      .filter(Boolean)
      .map((p: string) => p[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }, [displayName, user?.username]);

  // 5. HANDLER FUNCTIONS
  const handleSave = async () => {
    const ok = await updateProfile({
      displayName: editName.trim()
    });
    if (ok) setEditing(false);
  };

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete account',
      'This is permanent and cannot be undone. All your data will be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete forever', style: 'destructive', onPress: deleteAccount },
      ],
    );
  };

  // 6. RENDER LOGIC
  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>

        {/* ── Avatar Section ── */}
        <View style={styles.avatarSection}>
          <Avatar.Text size={88} label={initials} />
          <Text variant="headlineSmall" style={styles.name}>{displayName || 'User'}</Text>
          <Text variant="bodyMedium" style={styles.subtle}>@{user?.username || 'username'}</Text>
          {isPremium && (
            <Chip icon="star" style={styles.premiumChip} textStyle={styles.premiumText} compact>
              Premium Member
            </Chip>
          )}
        </View>

        {/* ── Account Info Card ── */}
        <Card style={styles.card} mode="contained">
          <Card.Title title="Account Info" titleVariant="titleMedium" />
          <Card.Content>
            <InfoRow label="Email" value={user?.email ?? '—'} />
            <Divider style={styles.divider} />
            <InfoRow label="Username" value={`@${user?.username ?? '—'}`} />
            <Divider style={styles.divider} />
            <InfoRow label="Member since" value={formattedDate} />
            <Divider style={styles.divider} />
            <InfoRow label="Plan" value={isPremium ? '⭐ Premium' : 'Free'} />
          </Card.Content>
        </Card>

        {/* ── Edit Profile Card ── */}
        <Card style={styles.card} mode="contained">
          <Card.Title title="Edit Profile" titleVariant="titleMedium" />
          <Card.Content>
            {editing ? (
              <>
                <TextInput
                  label="Display name"
                  value={editName}
                  onChangeText={setEditName}
                  mode="outlined"
                  style={styles.input}
                />
                <TextInput
                  label="Bio"
                  value={editBio}
                  onChangeText={setEditBio}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  style={styles.input}
                />
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                <View style={styles.editActions}>
                  <Button
                    mode="contained"
                    onPress={handleSave}
                    loading={isProfileLoading}
                    style={styles.saveBtn}
                  >
                    Save
                  </Button>
                  <Button mode="outlined" onPress={() => setEditing(false)}>
                    Cancel
                  </Button>
                </View>
              </>
            ) : (
              <Button mode="outlined" icon="pencil" onPress={() => setEditing(true)}>
                Edit display name &amp; bio
              </Button>
            )}
          </Card.Content>
        </Card>

        {/* ── Cluster Access Card ── */}
        <Card style={styles.card} mode="contained">
          <Card.Title title="Cluster Access" titleVariant="titleMedium" />
          <Card.Content>
            <InfoRow label="Role" value={isPremium ? 'Admin' : 'Viewer'} />
            <Divider style={styles.divider} />
            <InfoRow label="API access" value={isPremium ? 'Full' : 'Read-only'} />
            <Divider style={styles.divider} />
            <InfoRow label="Max workers" value={isPremium ? 'Unlimited' : '5'} />
          </Card.Content>
        </Card>

        {/* ── Action Buttons ── */}
        <Card style={styles.card} mode="contained">
          <Card.Title title="Account Actions" titleVariant="titleMedium" />
          <Card.Content style={styles.actionsContent}>
            <Button
              mode="contained-tonal"
              icon="logout"
              onPress={handleLogout}
              disabled={isLoading}
            >
              Log out
            </Button>
            <Button
              mode="contained"
              icon="delete-forever"
              onPress={handleDelete}
              disabled={isLoading}
              buttonColor="#ef4444"
              textColor="#fff"
            >
              Delete account
            </Button>
          </Card.Content>
        </Card>

        <Text variant="labelSmall" style={styles.version}>
          DPDash v1.0.0 · {isPremium ? 'Premium' : 'Free'} plan
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Sub-component for clean layout rows
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="bodyMedium" style={styles.subtle}>{label}</Text>
      <Text variant="bodyMedium" style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { padding: 16, paddingBottom: 48 },
  avatarSection: { alignItems: 'center', paddingVertical: 24 },
  name: { marginTop: 12, fontWeight: '700' },
  subtle: { opacity: 0.6 },
  premiumChip: { marginTop: 8, backgroundColor: '#fef3c722' },
  premiumText: { color: '#f59e0b', fontWeight: '700' },
  card: { marginBottom: 16 },
  divider: { marginVertical: 6 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 2
  },
  infoValue: { fontWeight: '500', flex: 1, textAlign: 'right', marginLeft: 10 },
  input: { marginBottom: 12 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn: { flex: 1 },
  errorText: { color: '#ef4444', marginBottom: 8, fontSize: 12 },
  actionsContent: { gap: 10 },
  version: { textAlign: 'center', opacity: 0.35, marginTop: 8 },
});