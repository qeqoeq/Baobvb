import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../../constants/colors';
import { radius, spacing } from '../../../constants/spacing';
import { getNormalizedPrivateLabel } from '../../../lib/relation-model';
import { useRelationsStore } from '../../../store/useRelationsStore';

export default function EditRelationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { relations, updateRelation } = useRelationsStore();

  const relation = useMemo(
    () => relations.find((r) => r.id === id) ?? null,
    [relations, id],
  );

  const [name, setName] = useState(relation ? getNormalizedPrivateLabel(relation) : '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !relation) {
      router.back();
    }
  }, [id, relation]);

  if (!relation) {
    return <View style={styles.screen} />;
  }

  const save = () => {
    const cleanName = name.trim();

    if (!cleanName) {
      setError('Label cannot be empty.');
      return;
    }

    const ok = updateRelation(relation.id, {
      name: cleanName,
    });
    if (!ok) {
      setError('Could not save relation.');
      return;
    }

    router.back();
  };

  return (
    <Pressable style={styles.screen} onPress={Keyboard.dismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kav}
      >
      <View style={styles.card}>
        <Text style={styles.title}>Edit relation</Text>
        <Text style={styles.subtitle}>
          Your private label for this person. Only visible to you.
        </Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>Private label</Text>
          <TextInput
            value={name}
            onChangeText={(value) => {
              setName(value);
              if (error) setError(null);
            }}
            placeholder="Your label for this person"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            autoFocus
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable onPress={save} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Save relation</Text>
        </Pressable>
        <Text style={styles.helperText}>Changes appear immediately in Garden and this relationship.</Text>
        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
      </KeyboardAvoidingView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  kav: {
    flex: 1,
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
  helperText: {
    marginTop: -spacing.xs,
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.muted,
    textAlign: 'center',
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
