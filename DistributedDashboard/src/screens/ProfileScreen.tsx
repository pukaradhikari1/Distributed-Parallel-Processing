// src/screens/ProfileScreen.tsx
import React, { useState } from 'react';
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

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(profile?.displayName ?? '');
  const [editBio, setEditBio] = useState(profile?.bio ?? '');

  const formattedDate = memberSince
    ? new Date(memberSince).toLocaleDateString(undefined, {
      year: 'numeric', month: 'long', day: 'numeric',
    })
    : '—';

  const handleSave = async () => {
    const ok = await updateProfile({ displayName: editName.trim(), bio: editBio.trim() });
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

  const initials = displayName
    .split(' ')
    .map(p => p[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>

        {/* ── Avatar + name ── */}
        <View style={styles.avatarSection}>
          {profile?.avatarUrl ? (
            <Avatar.Image size={88} source={{ uri: profile.avatarUrl }} />
          ) : (
            <Avatar.Text size={88} label={initials} />
          )}
          <Text variant="headlineSmall" style={styles.name}>{displayName}</Text>
          <Text variant="bodyMedium" style={styles.subtle}>@{user?.username}</Text>
          {isPremium && (
            <Chip icon="star" style={styles.premiumChip} textStyle={styles.premiumText} compact>
              Premium Member
            </Chip>
          )}
        </View>

        {/* ── Account info card ── */}
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
            {profile?.bio ? (
              <>
                <Divider style={styles.divider} />
                <InfoRow label="Bio" value={profile.bio} />
              </>
            ) : null}
          </Card.Content>
        </Card>

        {/* ── Edit profile card ── */}
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
                {error ? (
                  <Text variant="bodySmall" style={styles.errorText}>{error}</Text>
                ) : null}
                <View style={styles.editActions}>
                  <Button
                    mode="contained"
                    onPress={handleSave}
                    loading={isProfileLoading}
                    disabled={isProfileLoading || !editName.trim()}
                    style={styles.saveBtn}
                  >
                    Save
                  </Button>
                  <Button
                    mode="outlined"
                    onPress={() => { setEditing(false); setEditName(profile?.displayName ?? ''); setEditBio(profile?.bio ?? ''); }}
                    disabled={isProfileLoading}
                  >
                    Cancel
                  </Button>
                </View>
              </>
            ) : (
              <Button
                mode="outlined"
                icon="pencil"
                onPress={() => { setEditing(true); setEditName(profile?.displayName ?? ''); setEditBio(profile?.bio ?? ''); }}
              >
                Edit display name &amp; bio
              </Button>
            )}
          </Card.Content>
        </Card>

        {/* ── Cluster stats card ── */}
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

        {/* ── Actions ── */}
        <Card style={styles.card} mode="contained">
          <Card.Title title="Account Actions" titleVariant="titleMedium" />
          <Card.Content style={styles.actionsContent}>
            <Button
              mode="contained-tonal"
              icon="logout"
              onPress={handleLogout}
              disabled={isLoading}
              style={styles.actionBtn}
            >
              Log out
            </Button>
            <Button
              mode="contained"
              icon="delete-forever"
              onPress={handleDelete}
              disabled={isLoading}
              style={[styles.actionBtn, styles.deleteBtn]}
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
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingVertical: 2 },
  infoValue: { fontWeight: '500', flex: 1, textAlign: 'right' },
  input: { marginBottom: 12 },
  editActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  saveBtn: { flex: 1 },
  errorText: { color: '#ef4444', marginBottom: 8 },
  actionsContent: { gap: 10 },
  actionBtn: { paddingVertical: 2 },
  deleteBtn: { marginTop: 2 },
  version: { textAlign: 'center', opacity: 0.35, marginTop: 8 },
});