import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../../constants/colors';
import { radius, spacing } from '../../../constants/spacing';
import { deriveAvatarSeed, normalizeHandleInput } from '../../../lib/identity-format';
import { devLogLinking } from '../../../lib/dev-linking-log';
import { useRelationsStore } from '../../../store/useRelationsStore';

export default function InviteIdentityScreen() {
  const { relationId, token } = useLocalSearchParams<{ relationId: string; token?: string }>();
  const relationIdTrim = typeof relationId === 'string' ? relationId.trim() : '';
  const { updateMe } = useRelationsStore();
  const [displayName, setDisplayName] = useState('');
  const [handleInput, setHandleInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const returnToInvite = () => {
    router.replace({
      pathname: '/invite/[relationId]',
      params: { relationId: relationIdTrim, token: token || '' },
    });
  };

  const handleContinue = () => {
    const cleanName = displayName.trim();
    if (!cleanName) {
      setError('Your name is required.');
      return;
    }

    const handleSource = handleInput.trim() ? handleInput : cleanName;
    const cleanHandle = normalizeHandleInput(handleSource);
    if (!cleanHandle) {
      setError('Username is invalid. Use letters, numbers, dots, dashes or underscores.');
      return;
    }

    const saved = updateMe({
      displayName: cleanName,
      handle: cleanHandle,
      avatarSeed: deriveAvatarSeed(cleanName),
    });

    if (!saved) {
      setError('Could not save your card. Please try again.');
      return;
    }

    returnToInvite();
  };

  if (!relationIdTrim) {
    if (__DEV__) {
      devLogLinking('invite identity: missing relationId', {});
    }
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Invalid link</Text>
          <Text style={styles.body}>This screen needs a relationship id in the URL.</Text>
          <Pressable onPress={() => router.back()} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Create your card</Text>
        <Text style={styles.body}>Add just enough to continue this invitation.</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Your name</Text>
          <TextInput
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (error) setError(null);
            }}
            placeholder="Your name"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            autoFocus
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Username (optional)</Text>
          <TextInput
            value={handleInput}
            onChangeText={(value) => {
              setHandleInput(value);
              if (error) setError(null);
            }}
            placeholder="@your.name"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldHint}>If left empty, we'll generate one from your name.</Text>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable onPress={handleContinue} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Continue</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Not now</Text>
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
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: colors.text.primary,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.text.muted,
    fontWeight: '700',
  },
  fieldHint: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
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
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
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
