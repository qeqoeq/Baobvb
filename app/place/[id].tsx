import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  getPlaceCategoryLabel,
  getPlaceFitLabel,
  getPlaceReading,
  PLACE_CONTEXT_FIT_LABELS,
} from '@/lib/places';
import { derivePrivatePlaceValue } from '@/lib/private-place-value';
import { useRelationsStore, type Place } from '@/store/useRelationsStore';

function formatPlaceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently added';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Same three-bucket semantic logic already used on Place Index, applied to
// the same composite private value — never a numeric score, never a star.
// Never semantic.trust (relational confidence, never a place's value).
function getPrivatePlaceValueColor(value: number): string {
  if (value >= 70) return colors.semantic.growth;
  if (value >= 45) return colors.semantic.caution;
  return colors.text.muted;
}

// Lived traces, read only from the place's own raw fields — never from
// derivePrivatePlaceValue's signature/confidence/reasons. This narration
// stays independent of the internal scoring engine on purpose: if the
// formula's thresholds change tomorrow, this text never has to change
// with it, and the engine never has to anticipate becoming user-facing copy.
function deriveLivedPlaceTraces(place: Place): string[] {
  const traces: string[] = [];
  if (place.personalFit === 'kept') traces.push('Kept');
  if (place.wentAgainAt !== undefined) traces.push('Came back');
  const contextFit = place.quickSignal?.contextFit ?? [];
  if (contextFit.length > 0) {
    traces.push(
      contextFit
        .map((context) => PLACE_CONTEXT_FIT_LABELS[context])
        .filter(Boolean)
        .join(' · '),
    );
  }
  return traces.filter(Boolean);
}

export default function PlaceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { places, updatePlace } = useRelationsStore();
  const place = places.find((item) => item.id === params.id);
  // Local-only UI feedback — never read from place.wentAgainAt, never
  // persisted, resets whenever this screen unmounts/remounts.
  const [wentAgainConfirmed, setWentAgainConfirmed] = useState(false);

  // Explicit, never auto-triggered. Omitting worldFit/quickSignal/
  // identityHint here is safe — X.45b preserves them by default.
  const onWentAgain = () => {
    if (!place) return;
    updatePlace(place.id, {
      name: place.name,
      category: place.category,
      personalFit: place.personalFit,
      wentAgainAt: new Date().toISOString(),
    });
    setWentAgainConfirmed(true);
  };

  if (!place) {
    return (
      <>
        <Stack.Screen
          options={{
            title: '',
            headerStyle: { backgroundColor: colors.background.primary },
            headerTintColor: colors.text.primary,
            headerShadowVisible: false,
            headerBackTitle: '',
          }}
        />
        <View style={styles.missingScreen}>
          <View style={styles.missingCard}>
            <Text style={styles.missingTitle}>Place not found</Text>
            <Text style={styles.missingText}>
              This place is not available anymore in your local memory.
            </Text>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          </View>
        </View>
      </>
    );
  }

  const privateValue = derivePrivatePlaceValue({
    personalFit: place.personalFit,
    quickSignal: place.quickSignal,
    wentAgainAt: place.wentAgainAt,
    impression: place.impression,
  });
  const livedTraces = deriveLivedPlaceTraces(place);

  return (
    <>
      <Stack.Screen
        options={{
          title: place.name,
          headerStyle: { backgroundColor: colors.background.primary },
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <View style={styles.headerBrand}>
            <View style={styles.baobabMark} />
            <Text style={styles.headerKicker}>{'BAOBAB'}</Text>
          </View>
          <Text style={styles.kicker}>{getPlaceCategoryLabel(place.category)}</Text>
          <Text style={styles.title}>{place.name}</Text>
          <Text style={styles.fit}>{getPlaceFitLabel(place.personalFit)}</Text>
        </View>

        <View style={styles.valueCard}>
          <Text style={[styles.valueNumber, { color: getPrivatePlaceValueColor(privateValue.value) }]}>
            {privateValue.value}
          </Text>
          <Text style={styles.valueLabel}>{'private read'}</Text>
        </View>

        {livedTraces.length > 0 && (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>What this place carries</Text>
            {livedTraces.map((trace) => (
              <Text key={trace} style={styles.traceRow}>{trace}</Text>
            ))}
          </View>
        )}

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Your trace</Text>
          <Text style={styles.readingText}>{getPlaceReading(place)}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Added</Text>
          <Text style={styles.metaText}>{formatPlaceDate(place.createdAt)}</Text>
        </View>

        {place.identityHint ? (
          <View style={styles.sectionCard}>
            <Text style={styles.sectionLabel}>Saved reference</Text>
            <Text style={styles.metaText}>{place.identityHint}</Text>
          </View>
        ) : null}

        <Pressable onPress={onWentAgain} style={styles.wentAgainButton}>
          <Text style={styles.wentAgainButtonText}>I went again</Text>
        </Pressable>
        {wentAgainConfirmed ? (
          <Text style={styles.wentAgainConfirmedText}>Saved privately</Text>
        ) : null}
      </ScrollView>
    </>
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
  heroCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  baobabMark: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.accent.warmGold,
    shadowColor: colors.accent.warmGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 6,
  },
  headerKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.warmGold,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
  },
  valueCard: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  valueNumber: {
    fontSize: 40,
    fontWeight: '700',
  },
  valueLabel: {
    fontSize: 13,
    color: colors.text.muted,
  },
  traceRow: {
    color: colors.text.secondary,
    fontSize: 14,
    lineHeight: 22,
  },
  kicker: {
    fontSize: 12,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  title: {
    color: colors.text.primary,
    fontSize: 30,
    fontWeight: '700',
  },
  fit: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  sectionCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  sectionLabel: {
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    fontSize: 11,
    fontWeight: '700',
  },
  readingText: {
    color: '#CFC8BF',
    lineHeight: 22,
    fontSize: 15,
  },
  metaText: {
    color: colors.text.secondary,
    fontSize: 14,
  },
  wentAgainButton: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  wentAgainButtonText: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  wentAgainConfirmedText: {
    color: colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
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
