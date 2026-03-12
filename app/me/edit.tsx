import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { useRelationsStore } from '../../store/useRelationsStore';

function normalizeHandleInput(raw: string) {
  const noSpaces = raw.trim().toLowerCase().replace(/\s+/g, '');
  const noAt = noSpaces.replace(/^@+/, '');
  const safe = noAt.replace(/[^a-z0-9._-]/g, '');
  return safe ? `@${safe}` : '';
}

function normalizeAvatarSeedInput(raw: string, displayName: string) {
  const seed = raw.trim().toUpperCase().replace(/\s+/g, '').slice(0, 2);
  if (seed) return seed;
  const fallback = displayName.trim().charAt(0).toUpperCase();
  return fallback || '?';
}

export default function EditMyCardScreen() {
  const { me, updateMe } = useRelationsStore();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [handle, setHandle] = useState(me.handle);
  const [avatarSeed, setAvatarSeed] = useState(me.avatarSeed);
  const [error, setError] = useState<string | null>(null);

  const handleSave = () => {
    const cleanDisplayName = displayName.trim();
    const cleanHandle = normalizeHandleInput(handle);
    const cleanAvatarSeed = normalizeAvatarSeedInput(avatarSeed, cleanDisplayName);

    if (!cleanDisplayName) {
      setError('Display name cannot be empty.');
      return;
    }
    if (!cleanHandle) {
      setError('Handle is invalid. Use letters, numbers, dots, dashes or underscores.');
      return;
    }

    const ok = updateMe({
      displayName: cleanDisplayName,
      handle: cleanHandle,
      avatarSeed: cleanAvatarSeed,
    });
    if (!ok) {
      setError('Could not save your card. Please check your fields.');
      return;
    }

    router.back();
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Edit my card</Text>
        <Text style={styles.subtitle}>
          Personalize how people see you in Baobab.
        </Text>

        <View style={styles.previewAvatar}>
          <Text style={styles.previewAvatarText}>
            {normalizeAvatarSeedInput(avatarSeed, displayName)}
          </Text>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Display name</Text>
          <TextInput
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (error) setError(null);
            }}
            placeholder="Your name"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Handle</Text>
          <TextInput
            value={handle}
            onChangeText={(value) => {
              setHandle(value);
              if (error) setError(null);
            }}
            placeholder="@your.handle"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Avatar seed</Text>
          <TextInput
            value={avatarSeed}
            onChangeText={(value) => {
              setAvatarSeed(value);
              if (error) setError(null);
            }}
            placeholder="2 letters max"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            autoCapitalize="characters"
            maxLength={2}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable onPress={handleSave} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Save my card</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  previewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.accent.softAmber + '66',
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  previewAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.text.muted,
    fontWeight: '700',
  },
  input: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    fontSize: 15,
  },
  errorText: {
    fontSize: 12,
    color: colors.semantic.alert,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
