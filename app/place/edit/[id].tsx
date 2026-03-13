import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  PLACE_CATEGORY_LABELS,
  getPlaceTone,
  sanitizeRating,
} from '@/lib/places';
import {
  type PlaceCategory,
  type PlaceUpdateInput,
  useRelationsStore,
} from '@/store/useRelationsStore';

const CATEGORIES: { id: PlaceCategory; label: string }[] = [
  { id: 'restaurant', label: PLACE_CATEGORY_LABELS.restaurant },
  { id: 'cafe', label: PLACE_CATEGORY_LABELS.cafe },
  { id: 'bar', label: PLACE_CATEGORY_LABELS.bar },
  { id: 'spot', label: PLACE_CATEGORY_LABELS.spot },
  { id: 'other', label: PLACE_CATEGORY_LABELS.other },
];

const RATINGS: PlaceUpdateInput['rating'][] = [1, 2, 3, 4, 5];

export default function EditPlaceScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { places, updatePlace } = useRelationsStore();
  const place = places.find((item) => item.id === params.id);

  const [name, setName] = useState(place?.name ?? '');
  const [category, setCategory] = useState<PlaceCategory>(place?.category ?? 'other');
  const [rating, setRating] = useState<PlaceUpdateInput['rating']>(
    sanitizeRating(place?.rating ?? 3),
  );
  const [impression, setImpression] = useState(place?.impression ?? '');
  const [error, setError] = useState<string | null>(null);

  const tone = useMemo(() => getPlaceTone(rating), [rating]);

  if (!place) {
    return (
      <View style={styles.missingScreen}>
        <View style={styles.missingCard}>
          <Text style={styles.missingTitle}>Place not found</Text>
          <Text style={styles.missingText}>This place cannot be edited right now.</Text>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const onSave = () => {
    const ok = updatePlace(place.id, {
      name,
      category,
      rating,
      impression,
    });

    if (!ok) {
      setError('Please provide a valid place name.');
      return;
    }

    router.replace(`../../place/${place.id}`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={[styles.previewCard, { borderColor: tone.border, backgroundColor: tone.tint }]}>
        <Text style={styles.previewLabel}>Place preview</Text>
        <Text style={styles.previewName}>{name.trim() || place.name}</Text>
        <Text style={[styles.previewRating, { color: tone.accent }]}>{rating}/5</Text>
      </View>

      <View style={styles.formCard}>
        <Text style={styles.inputLabel}>Place name</Text>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (error) setError(null);
          }}
          placeholder="Place name"
          placeholderTextColor={colors.text.muted}
          style={styles.input}
        />

        <Text style={styles.inputLabel}>Category</Text>
        <View style={styles.rowWrap}>
          {CATEGORIES.map((item) => {
            const active = item.id === category;
            return (
              <Pressable
                key={item.id}
                onPress={() => setCategory(item.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.inputLabel}>Rating</Text>
        <View style={styles.rowWrap}>
          {RATINGS.map((value) => {
            const active = value === rating;
            return (
              <Pressable
                key={value}
                onPress={() => setRating(value)}
                style={[styles.ratingChip, active && styles.ratingChipActive]}
              >
                <Text style={[styles.ratingChipText, active && styles.ratingChipTextActive]}>
                  {value}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.inputLabel}>Short impression (optional)</Text>
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

        <Pressable onPress={onSave} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save changes</Text>
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
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  previewCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  previewLabel: {
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontSize: 11,
    fontWeight: '700',
  },
  previewName: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  previewRating: {
    fontWeight: '700',
  },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.lg,
    gap: spacing.md,
  },
  inputLabel: {
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
  ratingChipText: {
    color: colors.text.muted,
    fontWeight: '700',
  },
  ratingChipTextActive: {
    color: colors.text.primary,
  },
  error: {
    color: colors.accent.softCoral,
    fontSize: 13,
  },
  saveButton: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  saveButtonText: {
    color: colors.text.primary,
    fontWeight: '700',
  },
  missingScreen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  missingCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  missingTitle: {
    color: colors.text.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  missingText: {
    color: colors.text.secondary,
    lineHeight: 20,
  },
  backButton: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  backButtonText: {
    color: colors.accent.softAmber,
    fontWeight: '700',
  },
});
