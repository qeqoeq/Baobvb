import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { PlaceQuickSignalSheet } from '@/components/place/PlaceQuickSignalSheet';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  PLACE_CATEGORY_LABELS,
  PLACE_PERSONAL_FIT_CAPTURE_OPTIONS,
  PLACE_PERSONAL_FIT_LABELS,
  PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION,
} from '@/lib/places';
import type { PlaceQuickSignal } from '@/lib/place-quick-signal';
import type { RelationOpenWorld } from '@/lib/relation-open-worlds';
import {
  type PlaceCategory,
  type PlacePersonalFit,
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

export default function EditPlaceScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { places, updatePlace } = useRelationsStore();
  const place = places.find((item) => item.id === params.id);

  const [name, setName] = useState(place?.name ?? '');
  const [category, setCategory] = useState<PlaceCategory>(place?.category ?? 'other');
  const [identityHint, setIdentityHint] = useState(place?.identityHint ?? '');
  const [personalFit, setPersonalFit] = useState<PlaceUpdateInput['personalFit']>(
    place?.personalFit ?? 'saved',
  );
  const [impression, setImpression] = useState(place?.impression ?? '');
  const [noteVisible, setNoteVisible] = useState(Boolean(place?.impression?.trim()));
  const [worldFit] = useState<RelationOpenWorld[]>(place?.worldFit ?? []);
  const [quickSignal, setQuickSignal] = useState<PlaceQuickSignal>(place?.quickSignal ?? {});
  const [quickSignalVisible, setQuickSignalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePersonalFitChange = (fit: PlacePersonalFit) => {
    if (fit === 'kept' && personalFit !== 'kept') {
      setQuickSignalVisible(true);
    }
    setPersonalFit(fit);
  };

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
      personalFit,
      impression,
      worldFit,
      quickSignal,
      identityHint,
    });

    if (!ok) {
      setError('Please provide a valid place name.');
      return;
    }

    router.replace(`../../place/${place.id}`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.previewCard}>
        <Text style={styles.previewLabel}>Place preview</Text>
        <Text style={styles.previewName}>{name.trim() || place.name}</Text>
        <Text style={styles.previewFit}>{PLACE_PERSONAL_FIT_LABELS[personalFit]}</Text>
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

        <Text style={styles.inputLabel}>Address or link (optional)</Text>
        <TextInput
          value={identityHint}
          onChangeText={setIdentityHint}
          placeholder="Google Maps, website, or address"
          placeholderTextColor={colors.text.muted}
          style={styles.input}
        />
        <Text style={styles.identityHintHint}>Only to recognize it later.</Text>

        {/* "Save for later" is personal memory, not experience evidence.
            "Went there" remains the current trigger for quickSignal. */}
        <Text style={styles.inputLabel}>Your experience</Text>
        <View style={styles.rowWrap}>
          {PLACE_PERSONAL_FIT_CAPTURE_OPTIONS.map((item) => {
            const active = item.id === personalFit;
            return (
              <Pressable
                key={item.id}
                onPress={() => handlePersonalFitChange(item.id)}
                style={[styles.fitChip, active && styles.fitChipActive]}
              >
                <Text style={[styles.fitChipText, active && styles.fitChipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => handlePersonalFitChange(PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION.id)}
          style={styles.saveForLaterLink}
        >
          <Text
            style={[
              styles.saveForLaterLinkText,
              personalFit === PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION.id &&
                styles.saveForLaterLinkTextActive,
            ]}
          >
            {personalFit === PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION.id ? '✓ ' : ''}
            {PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION.label}
          </Text>
        </Pressable>

        {noteVisible ? (
          <>
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
          </>
        ) : (
          <Pressable onPress={() => setNoteVisible(true)} style={styles.addNoteLink}>
            <Text style={styles.addNoteLinkText}>Add a note</Text>
          </Pressable>
        )}

        {personalFit === 'kept' ? (
          <Pressable
            onPress={() => setQuickSignalVisible(true)}
            style={styles.refineButton}
          >
            <Text style={styles.refineButtonText}>Refine the read</Text>
          </Pressable>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable onPress={onSave} style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Save changes</Text>
        </Pressable>
      </View>

      <PlaceQuickSignalSheet
        visible={quickSignalVisible}
        value={quickSignal}
        onChange={setQuickSignal}
        onDismiss={() => setQuickSignalVisible(false)}
        category={category}
      />
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
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
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
  previewFit: {
    color: colors.text.secondary,
    fontSize: 13,
    fontWeight: '600',
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
  identityHintHint: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: -spacing.xs,
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
  fitChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  fitChipActive: {
    borderColor: colors.accent.mutedSage,
    backgroundColor: colors.background.secondary,
  },
  fitChipText: {
    color: colors.text.muted,
    fontWeight: '600',
  },
  fitChipTextActive: {
    color: colors.text.primary,
  },
  saveForLaterLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  saveForLaterLinkText: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  saveForLaterLinkTextActive: {
    color: colors.accent.mutedSage,
  },
  addNoteLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  addNoteLinkText: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  refineButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  refineButtonText: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
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
