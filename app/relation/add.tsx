import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function AddRelationScreen() {
  const params = useLocalSearchParams<{
    prefillName?: string;
    prefillHandle?: string;
    prefillAvatarSeed?: string;
    scannedMeId?: string;
    fromScan?: string;
  }>();
  const { me, relations, addRelation } = useRelationsStore();
  const [name, setName] = useState(params.prefillName ?? '');

  const canSubmit = name.trim().length > 0;
  const fromScan = params.fromScan === '1';

  const handleCreate = () => {
    if (!canSubmit) return;

    if (params.scannedMeId && params.scannedMeId === me.id) {
      Alert.alert('This is your own card', 'Scan another person to add a new link.');
      return;
    }

    const cleanName = name.trim();
    const existing = relations.find(
      (relation) => relation.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );
    if (existing) {
      Alert.alert('Person already exists', `${existing.name} is already in your Garden.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open link', onPress: () => router.replace(`../${existing.id}`) },
      ]);
      return;
    }

    const created = addRelation(cleanName);
    if (!created) return;
    router.replace(`../${created.id}`);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Add a person</Text>
        <Text style={styles.subtitle}>
          Start your mapping with a name. You can enrich the link right after.
        </Text>
        {fromScan && (
          <View style={styles.scanHintCard}>
            <Text style={styles.scanHintTitle}>Scanned card detected</Text>
            <Text style={styles.scanHintText}>
              {params.prefillHandle ?? 'Unknown handle'}
              {params.prefillAvatarSeed ? ` · seed ${params.prefillAvatarSeed}` : ''}
            </Text>
          </View>
        )}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Person name"
          placeholderTextColor={colors.text.muted}
          style={styles.input}
          autoFocus
        />

        <Pressable
          onPress={handleCreate}
          disabled={!canSubmit}
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>Create link</Text>
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
  scanHintCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.sm + 2,
    gap: 2,
  },
  scanHintTitle: {
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scanHintText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  button: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
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
