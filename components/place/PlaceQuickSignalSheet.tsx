import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import { PLACE_CONTEXT_FIT_LABELS, RESTAURANT_EXPERIENCE_DIMENSION_LABELS } from '@/lib/places';
import {
  PLACE_CONTEXT_FIT_OPTIONS,
  PLACE_LANDING_LEVEL_LABELS,
  PLACE_LANDING_LEVEL_OPTIONS,
  RESTAURANT_EXPERIENCE_DIMENSION_OPTIONS,
  type PlaceContextFit,
  type PlaceExperienceLevel,
  type PlaceLandingLevel,
  type PlaceQuickSignal,
  type RestaurantExperienceDimension,
  type RestaurantExperienceDimensions,
} from '@/lib/place-quick-signal';
import type { PlaceCategory } from '@/store/useRelationsStore';

const CONTEXT_FIT_MAX = 2;
const DRIVER_DIMENSIONS_MAX = 2;
const EXPERIENCE_LEVELS: readonly PlaceExperienceLevel[] = [1, 2, 3, 4, 5];
const CATEGORIES_WITH_DIMENSIONS: readonly PlaceCategory[] = ['restaurant', 'cafe', 'bar'];

const DRIVER_QUESTION_BY_LANDING_LEVEL: Record<PlaceLandingLevel, string> = {
  1: 'Qu’est-ce qui a cloché ?',
  2: 'Qu’est-ce qui n’allait pas ?',
  3: 'Qu’est-ce qui était inégal ?',
  4: 'Qu’est-ce qui a marché ?',
  5: 'Qu’est-ce qui l’a rendu exceptionnel ?',
};
const DRIVER_QUESTION_DEFAULT = 'Qu’est-ce qui a le plus compté ?';

type PlaceQuickSignalSheetProps = {
  visible: boolean;
  value: PlaceQuickSignal;
  onChange: (value: PlaceQuickSignal) => void;
  onDismiss: () => void;
  category: PlaceCategory;
};

export function PlaceQuickSignalSheet({
  visible,
  value,
  onChange,
  onDismiss,
  category,
}: PlaceQuickSignalSheetProps) {
  const [touched, setTouched] = useState(false);

  const contextFit = value.contextFit ?? [];
  const restaurantDimensions = value.restaurantDimensions ?? {};
  // Legacy: a place rated before driverDimensions existed may already carry
  // restaurantDimensions with no driverDimensions. We don't pre-populate
  // driverDimensions from those keys — the safest option is to leave the
  // model untouched and let "A closer look" stay hidden until the user
  // actively picks a driver, exactly like a new place. Existing ratings
  // are never erased; they simply aren't shown until their dimension is
  // (re)selected as a driver.
  const driverDimensions = value.driverDimensions ?? [];
  // category gate: a driver chip must always be able to open a notable
  // dimension. restaurant/cafe/bar have a dimension catalog; spot/other
  // don't — so the entire driver section (not just "A closer look") is
  // hidden for them, never a visible chip with no signal behind it.
  const allowsDriverDimensions = CATEGORIES_WITH_DIMENSIONS.includes(category);
  const showDimensions = allowsDriverDimensions && driverDimensions.length > 0;
  // outcome is legacy — no longer asked in UI, landingLevel is the active verdict.
  const driverQuestion =
    value.landingLevel !== undefined
      ? DRIVER_QUESTION_BY_LANDING_LEVEL[value.landingLevel]
      : DRIVER_QUESTION_DEFAULT;

  const showAcknowledgement = useMemo(
    () =>
      touched &&
      (value.landingLevel !== undefined ||
        value.outcome !== undefined ||
        value.repeatDesire !== undefined ||
        value.shareSafe !== undefined ||
        contextFit.length > 0 ||
        driverDimensions.length > 0 ||
        Object.keys(restaurantDimensions).length > 0),
    [
      touched,
      value.landingLevel,
      value.outcome,
      value.repeatDesire,
      value.shareSafe,
      contextFit.length,
      driverDimensions.length,
      restaurantDimensions,
    ],
  );

  const setLandingLevel = (landingLevel: PlaceLandingLevel) => {
    setTouched(true);
    onChange({ ...value, landingLevel });
  };

  const toggleDriverDimension = (dimension: RestaurantExperienceDimension) => {
    const selected = driverDimensions.includes(dimension);
    setTouched(true);
    if (selected) {
      const nextDrivers = driverDimensions.filter((item) => item !== dimension);
      const { [dimension]: _removed, ...rest } = restaurantDimensions;
      const nextDimensions: RestaurantExperienceDimensions = rest;
      onChange({
        ...value,
        driverDimensions: nextDrivers.length > 0 ? nextDrivers : undefined,
        restaurantDimensions: Object.keys(nextDimensions).length > 0 ? nextDimensions : undefined,
      });
      return;
    }
    if (driverDimensions.length >= DRIVER_DIMENSIONS_MAX) return;
    onChange({ ...value, driverDimensions: [...driverDimensions, dimension] });
  };

  const setShareSafe = (shareSafe: boolean) => {
    setTouched(true);
    onChange({ ...value, shareSafe });
  };

  const toggleContextFit = (option: PlaceContextFit) => {
    const selected = contextFit.includes(option);
    const next = selected
      ? contextFit.filter((item) => item !== option)
      : contextFit.length >= CONTEXT_FIT_MAX
        ? contextFit
        : [...contextFit, option];
    setTouched(true);
    onChange({ ...value, contextFit: next });
  };

  const setDimensionLevel = (
    dimension: RestaurantExperienceDimension,
    level: PlaceExperienceLevel,
  ) => {
    setTouched(true);
    onChange({
      ...value,
      restaurantDimensions: { ...restaurantDimensions, [dimension]: level },
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />

        <Text style={styles.title}>Une lecture rapide</Text>
        <Text style={styles.caption}>Aide Bao à comprendre quand ce lieu te convient.</Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.section}>
          <Text style={styles.question}>Comment tu l’as ressenti ?</Text>
          <View style={styles.capsuleRow}>
            {PLACE_LANDING_LEVEL_OPTIONS.map((level) => {
              const active = value.landingLevel !== undefined && level <= value.landingLevel;
              return (
                <Pressable
                  key={level}
                  onPress={() => setLandingLevel(level)}
                  style={[styles.capsule, active && styles.capsuleActive]}
                />
              );
            })}
          </View>
          {value.landingLevel !== undefined ? (
            <Text style={styles.landingLevelCaption}>
              {PLACE_LANDING_LEVEL_LABELS[value.landingLevel]}
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
                    onPress={() => toggleDriverDimension(dimension)}
                    disabled={disabled}
                    style={[
                      styles.contextChip,
                      selected && styles.contextChipSelected,
                      disabled && styles.contextChipDisabled,
                    ]}
                  >
                    <Text
                      style={[
                        styles.contextChipText,
                        selected && styles.contextChipTextSelected,
                      ]}
                    >
                      {RESTAURANT_EXPERIENCE_DIMENSION_LABELS[dimension]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {/* repeatDesire and outcome are legacy-only in UI; landingLevel is the active verdict. */}
        <View style={styles.section}>
          <Text style={styles.question}>Enverrais-tu quelqu’un ici ?</Text>
          <View style={styles.row}>
            <YesNoChip
              label="Oui"
              active={value.shareSafe === true}
              onPress={() => setShareSafe(true)}
            />
            <YesNoChip
              label="Non"
              active={value.shareSafe === false}
              onPress={() => setShareSafe(false)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.question}>Bien pour…</Text>
          <View style={styles.chipRow}>
            {PLACE_CONTEXT_FIT_OPTIONS.map((option) => {
              const selected = contextFit.includes(option);
              const atMax = contextFit.length >= CONTEXT_FIT_MAX;
              const disabled = !selected && atMax;
              return (
                <Pressable
                  key={option}
                  onPress={() => toggleContextFit(option)}
                  disabled={disabled}
                  style={[
                    styles.contextChip,
                    selected && styles.contextChipSelected,
                    disabled && styles.contextChipDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.contextChipText,
                      selected && styles.contextChipTextSelected,
                    ]}
                  >
                    {PLACE_CONTEXT_FIT_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {showDimensions ? (
          <View style={styles.section}>
            <Text style={styles.question}>Regarde de plus près</Text>
            <Text style={styles.dimensionsCaption}>
              Évalue ce qui a compté dans cette expérience.
            </Text>
            {driverDimensions.map((dimension) => (
              <View key={dimension} style={styles.dimensionRow}>
                <Text style={styles.dimensionLabel}>
                  {RESTAURANT_EXPERIENCE_DIMENSION_LABELS[dimension]}
                </Text>
                <View style={styles.capsuleRow}>
                  {EXPERIENCE_LEVELS.map((level) => {
                    const currentLevel = restaurantDimensions[dimension];
                    const active = currentLevel !== undefined && level <= currentLevel;
                    return (
                      <Pressable
                        key={level}
                        onPress={() => setDimensionLevel(dimension, level)}
                        style={[styles.capsule, active && styles.capsuleActive]}
                      />
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {showAcknowledgement ? (
          <Text style={styles.acknowledgement}>Ton Bao a appris ce lieu.</Text>
        ) : null}
        </ScrollView>

        <Pressable onPress={onDismiss} style={styles.doneButton}>
          <Text style={styles.doneButtonText}>Terminé</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function YesNoChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.yesNoChip, active && styles.yesNoChipActive]}>
      <Text style={[styles.yesNoChipText, active && styles.yesNoChipTextActive]}>{label}</Text>
    </Pressable>
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
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  yesNoChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  yesNoChipActive: {
    borderColor: colors.accent.deepTeal,
    backgroundColor: colors.accent.deepTeal + '1F',
  },
  yesNoChipText: {
    color: colors.text.muted,
    fontWeight: '600',
  },
  yesNoChipTextActive: {
    color: colors.text.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  landingLevelCaption: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.warmGold,
  },
  contextChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  contextChipSelected: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold + '18',
  },
  contextChipDisabled: {
    opacity: 0.4,
  },
  contextChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  contextChipTextSelected: {
    color: colors.accent.warmGold,
  },
  dimensionsCaption: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 18,
  },
  dimensionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  dimensionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  capsuleRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  capsule: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  capsuleActive: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold,
  },
  acknowledgement: {
    color: colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  doneButton: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
