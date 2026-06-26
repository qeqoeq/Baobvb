import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import { PLACE_CONTEXT_FIT_LABELS } from '@/lib/places';
import {
  PLACE_CONTEXT_FIT_OPTIONS,
  PLACE_LANDING_LEVEL_LABELS,
  PLACE_LANDING_LEVEL_OPTIONS,
  RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS,
  type PlaceContextFit,
  type PlaceExperienceLevel,
  type PlaceLandingLevel,
  type RestaurantExperienceDimension,
  type RestaurantExperienceDimensions,
} from '@/lib/place-quick-signal';
import type { PlaceCategory, PlaceReadEntryInput } from '@/store/useRelationsStore';

const DRIVER_DIMENSIONS_MAX = 5;
const CONTEXT_FIT_MAX = 2;
const EXPERIENCE_LEVELS: readonly PlaceExperienceLevel[] = [1, 2, 3, 4, 5];
const CATEGORIES_WITH_DIMENSIONS: readonly PlaceCategory[] = ['restaurant', 'cafe', 'bar'];

const DRIVER_QUESTION_BY_LANDING_LEVEL: Record<PlaceLandingLevel, string> = {
  1: 'What went wrong?',
  2: "What didn't fit?",
  3: 'What made it uneven?',
  4: 'What made it work?',
  5: 'What made it exceptional?',
};
const DRIVER_QUESTION_DEFAULT = 'What should Baobab remember?';

const DRIVER_SHORT_LABELS: Record<RestaurantExperienceDimension, string> = {
  food: 'Food',
  service: 'Service',
  atmosphere: 'Atmosphere',
  value: 'Value',
  cleanliness: 'Cleanliness',
};

type PlaceNewReadSheetProps = {
  visible: boolean;
  category: PlaceCategory;
  onClose: () => void;
  onSave: (input: PlaceReadEntryInput) => void;
};

export function PlaceNewReadSheet({
  visible,
  category,
  onClose,
  onSave,
}: PlaceNewReadSheetProps) {
  const [landingLevel, setLandingLevel] = useState<PlaceLandingLevel | undefined>(undefined);
  const [driverDimensions, setDriverDimensions] = useState<RestaurantExperienceDimension[]>([]);
  const [restaurantDimensions, setRestaurantDimensions] = useState<RestaurantExperienceDimensions>({});
  const [contextFit, setContextFit] = useState<PlaceContextFit[]>([]);
  const [impression, setImpression] = useState('');

  useEffect(() => {
    if (visible) {
      setLandingLevel(undefined);
      setDriverDimensions([]);
      setRestaurantDimensions({});
      setContextFit([]);
      setImpression('');
    }
  }, [visible]);

  const allowsDriverDimensions = CATEGORIES_WITH_DIMENSIONS.includes(category);
  const showCloserLook = allowsDriverDimensions && driverDimensions.length > 0;
  const driverQuestion =
    landingLevel !== undefined
      ? DRIVER_QUESTION_BY_LANDING_LEVEL[landingLevel]
      : DRIVER_QUESTION_DEFAULT;

  const isValid =
    landingLevel !== undefined ||
    contextFit.length > 0 ||
    impression.trim().length > 0;

  const handleSetLandingLevel = (level: PlaceLandingLevel) => {
    setLandingLevel(level);
  };

  const handleToggleDriver = (dimension: RestaurantExperienceDimension) => {
    const selected = driverDimensions.includes(dimension);
    if (selected) {
      const nextDrivers = driverDimensions.filter((d) => d !== dimension);
      const { [dimension]: _removed, ...rest } = restaurantDimensions;
      setDriverDimensions(nextDrivers);
      setRestaurantDimensions(rest as RestaurantExperienceDimensions);
      return;
    }
    if (driverDimensions.length >= DRIVER_DIMENSIONS_MAX) return;
    setDriverDimensions([...driverDimensions, dimension]);
  };

  const handleToggleContextFit = (option: PlaceContextFit) => {
    const selected = contextFit.includes(option);
    if (selected) {
      setContextFit(contextFit.filter((c) => c !== option));
      return;
    }
    if (contextFit.length >= CONTEXT_FIT_MAX) return;
    setContextFit([...contextFit, option]);
  };

  const handleSetDimensionLevel = (
    dimension: RestaurantExperienceDimension,
    level: PlaceExperienceLevel,
  ) => {
    setRestaurantDimensions({ ...restaurantDimensions, [dimension]: level });
  };

  const handleSave = () => {
    if (!isValid) return;
    const input: PlaceReadEntryInput = {
      ...(landingLevel !== undefined ? { landingLevel } : {}),
      ...(contextFit.length > 0 ? { contextFit } : {}),
      ...(driverDimensions.length > 0 ? { driverDimensions } : {}),
      ...(Object.keys(restaurantDimensions).length > 0 ? { restaurantDimensions } : {}),
      ...(impression.trim() ? { impression: impression.trim() } : {}),
    };
    onSave(input);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>Another read</Text>
        <Text style={styles.caption}>{"What's different this time."}</Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.question}>How did it land?</Text>
            <View style={styles.segmentRow}>
              {PLACE_LANDING_LEVEL_OPTIONS.map((level) => {
                const active = landingLevel !== undefined && level <= landingLevel;
                return (
                  <Pressable
                    key={level}
                    onPress={() => handleSetLandingLevel(level)}
                    style={[styles.segment, active && styles.segmentActive]}
                  />
                );
              })}
            </View>
            {landingLevel !== undefined ? (
              <Text style={styles.landingCaption}>
                {PLACE_LANDING_LEVEL_LABELS[landingLevel]}
              </Text>
            ) : null}
          </View>

          {allowsDriverDimensions ? (
            <View style={styles.section}>
              <Text style={styles.question}>{driverQuestion}</Text>
              <View style={styles.chipRow}>
                {RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS.map((dimension) => {
                  const selected = driverDimensions.includes(dimension);
                  const atMax = driverDimensions.length >= DRIVER_DIMENSIONS_MAX;
                  const disabled = !selected && atMax;
                  return (
                    <Pressable
                      key={dimension}
                      onPress={() => handleToggleDriver(dimension)}
                      disabled={disabled}
                      style={[
                        styles.chip,
                        selected && styles.chipSelected,
                        disabled && styles.chipDisabled,
                      ]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        {DRIVER_SHORT_LABELS[dimension]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.question}>Good for…</Text>
            <View style={styles.chipRow}>
              {PLACE_CONTEXT_FIT_OPTIONS.map((option) => {
                const selected = contextFit.includes(option);
                const atMax = contextFit.length >= CONTEXT_FIT_MAX;
                const disabled = !selected && atMax;
                return (
                  <Pressable
                    key={option}
                    onPress={() => handleToggleContextFit(option)}
                    disabled={disabled}
                    style={[
                      styles.chip,
                      selected && styles.chipSelected,
                      disabled && styles.chipDisabled,
                    ]}
                  >
                    <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                      {PLACE_CONTEXT_FIT_LABELS[option]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {showCloserLook ? (
            <View style={styles.section}>
              <Text style={styles.question}>A closer look</Text>
              {driverDimensions.map((dimension) => (
                <View key={dimension} style={styles.dimensionRow}>
                  <Text style={styles.dimensionLabel}>
                    {DRIVER_SHORT_LABELS[dimension]}
                  </Text>
                  <View style={[styles.segmentRow, styles.segmentRowFlex]}>
                    {EXPERIENCE_LEVELS.map((level) => {
                      const current = restaurantDimensions[dimension];
                      const active = current !== undefined && level <= current;
                      return (
                        <Pressable
                          key={level}
                          onPress={() => handleSetDimensionLevel(dimension, level)}
                          style={[styles.segment, active && styles.segmentActive]}
                        />
                      );
                    })}
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.question}>A note</Text>
            <TextInput
              value={impression}
              onChangeText={setImpression}
              placeholder="What changed, stayed, or surprised you?"
              placeholderTextColor={colors.text.muted}
              style={styles.noteInput}
              multiline
              maxLength={160}
            />
          </View>
        </ScrollView>

        <Pressable
          onPress={handleSave}
          disabled={!isValid}
          style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
        >
          <Text style={styles.saveButtonText}>Save this read</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  caption: {
    color: colors.text.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  scroll: {
    maxHeight: 420,
  },
  scrollContent: {
    gap: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  question: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 4,
  },
  segmentRowFlex: {
    flex: 1,
  },
  segment: {
    flex: 1,
    height: 36,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  segmentActive: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold,
  },
  landingCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.warmGold,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  chipSelected: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold + '18',
  },
  chipDisabled: {
    opacity: 0.4,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  chipTextSelected: {
    color: colors.accent.warmGold,
  },
  dimensionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  dimensionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    backgroundColor: colors.background.tertiary,
    minHeight: 72,
    textAlignVertical: 'top',
    fontSize: 14,
    lineHeight: 20,
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
