import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  type PlaceCategory,
  type PlaceCreateInput,
  useRelationsStore,
} from '@/store/useRelationsStore';

const CATEGORIES: { id: PlaceCategory; label: string }[] = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'cafe', label: 'Cafe' },
  { id: 'bar', label: 'Bar' },
  { id: 'spot', label: 'Spot' },
  { id: 'other', label: 'Other' },
];

const RATINGS: PlaceCreateInput['rating'][] = [1, 2, 3, 4, 5];

export default function AddPlaceScreen() {
  const { addPlace } = useRelationsStore();

  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('other');
  const [rating, setRating] = useState<PlaceCreateInput['rating']>(4);
  const [impression, setImpression] = useState('');
  const [error, setError] = useState<string | null>(null);

  const isValid = useMemo(() => name.trim().length > 0, [name]);

  const handleSave = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Place name is required.');
      return;
    }

    const created = addPlace({
      name: cleanName,
      category,
      rating,
      impression,
    });
    if (!created) {
      setError('Unable to save this place right now.');
      return;
    }

    router.replace('../place');
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.header}>
        <Text style={styles.kicker}>Places & tastes</Text>
        <Text style={styles.title}>Rate a place</Text>
        <Text style={styles.subtitle}>
          Keep a simple, honest trace of where trust and taste felt right.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Place name</Text>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (error) setError(null);
          }}
          placeholder="Ex: Atelier Celine"
          placeholderTextColor={colors.text.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.rowWrap}>
          {CATEGORIES.map((item) => {
            const active = item.id === category;
            return (
              <Pressable
                key={item.id}
                onPress={() => setCategory(item.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Rating</Text>
        <View style={styles.rowWrap}>
          {RATINGS.map((value) => {
            const active = value === rating;
            return (
              <Pressable
                key={value}
                onPress={() => setRating(value)}
                style={[styles.ratingChip, active && styles.ratingChipActive]}
              >
                <Text style={[styles.ratingText, active && styles.ratingTextActive]}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Short impression (optional)</Text>
        <TextInput
          value={impression}
          onChangeText={setImpression}
          placeholder="One discreet line to remember."
          placeholderTextColor={colors.text.muted}
          style={[styles.input, styles.inputArea]}
          multiline
          maxLength={120}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleSave}
          disabled={!isValid}
          style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
        >
          <Text style={styles.saveButtonText}>Save place</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  kicker: {
    color: colors.text.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    color: colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.text.muted,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    backgroundColor: colors.background.tertiary,
  },
  inputArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  chipActive: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.background.secondary,
  },
  chipText: {
    color: colors.text.muted,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text.primary,
  },
  ratingChip: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  ratingChipActive: {
    borderColor: colors.accent.mutedSage,
    backgroundColor: colors.background.secondary,
  },
  ratingText: {
    color: colors.text.muted,
    fontWeight: '700',
  },
  ratingTextActive: {
    color: '#45603E',
  },
  error: {
    color: '#A34A3B',
    fontSize: 13,
  },
  saveButton: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
