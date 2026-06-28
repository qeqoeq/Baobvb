import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { PlaceNewReadSheet } from '@/components/place/PlaceNewReadSheet';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  getPlaceCategoryLabel,
  getPlaceFitLabel,
  getPlaceReading,
  PLACE_CONTEXT_FIT_LABELS,
} from '@/lib/places';
import { PLACE_LANDING_LEVEL_LABELS } from '@/lib/place-quick-signal';
import {
  derivePrivatePlaceValue,
  synthesizeMultiReadInput,
} from '@/lib/private-place-value';
import {
  useRelationsStore,
  type Place,
  type PlaceReadEntryInput,
} from '@/store/useRelationsStore';

const DRIVER_SHORT_LABELS: Readonly<Record<string, string>> = {
  food: 'Food',
  service: 'Service',
  atmosphere: 'Atmosphere',
  value: 'Value',
  cleanliness: 'Cleanliness',
} as const;

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
  const { places, updatePlace, addPlaceRead } = useRelationsStore();
  const place = places.find((item) => item.id === params.id);
  // Local-only UI feedback — never read from place.wentAgainAt, never
  // persisted, resets whenever this screen unmounts/remounts.
  const [wentAgainConfirmed, setWentAgainConfirmed] = useState(false);
  const [readSheetVisible, setReadSheetVisible] = useState(false);
  const [readSaved, setReadSaved] = useState(false);

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

  const handleOpenReadSheet = () => {
    setReadSaved(false);
    setReadSheetVisible(true);
  };

  const handleSaveRead = (input: PlaceReadEntryInput) => {
    if (!place) return;
    addPlaceRead(place.id, input);
    setReadSheetVisible(false);
    setReadSaved(true);
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

  // Uses deriveEffectivePlaceValueInput so the latest read in reads[] is
  // authoritative when present — legacy quickSignal/impression remain the
  // fallback for places with no accumulated reads.
  const privateValue = derivePrivatePlaceValue(synthesizeMultiReadInput(place));
  const livedTraces = deriveLivedPlaceTraces(place);

  const latestRead = place.reads?.length ? place.reads[place.reads.length - 1] : undefined;
  const hasReads = latestRead !== undefined;

  const latestReadText =
    latestRead?.impression?.trim() ||
    (latestRead?.landingLevel !== undefined
      ? PLACE_LANDING_LEVEL_LABELS[latestRead.landingLevel]
      : undefined) ||
    getPlaceReading(place);

  const latestReadDrivers = (latestRead?.driverDimensions ?? []).map(
    (d) => DRIVER_SHORT_LABELS[d] ?? d,
  );
  const latestReadContextFit = (latestRead?.contextFit ?? []).map(
    (c) => PLACE_CONTEXT_FIT_LABELS[c] ?? c,
  );
  const hasShapingSignals = latestReadDrivers.length > 0 || latestReadContextFit.length > 0;

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

        {hasReads ? (
          <>
            <View style={styles.sectionCard}>
              <Text style={styles.sectionLabel}>Latest read</Text>
              <Text style={styles.readingText}>{latestReadText}</Text>
            </View>
            {hasShapingSignals ? (
              <View style={styles.sectionCard}>
                <Text style={styles.sectionLabel}>What shaped this value</Text>
                {latestReadDrivers.length > 0 ? (
                  <Text style={styles.traceRow}>{latestReadDrivers.join(' · ')}</Text>
                ) : null}
                {latestReadContextFit.length > 0 ? (
                  <Text style={styles.traceRow}>{latestReadContextFit.join(' · ')}</Text>
                ) : null}
              </View>
            ) : null}
          </>
        ) : (
          <>
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
          </>
        )}

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

        <Pressable onPress={handleOpenReadSheet} style={styles.addReadButton}>
          <Text style={styles.addReadButtonText}>Add a read</Text>
        </Pressable>
        {readSaved ? (
          <Text style={styles.readSavedText}>Read saved privately.</Text>
        ) : null}

        <Pressable onPress={onWentAgain} style={styles.wentAgainButton}>
          <Text style={styles.wentAgainButtonText}>I went again</Text>
        </Pressable>
        {wentAgainConfirmed ? (
          <Text style={styles.wentAgainConfirmedText}>Saved privately</Text>
        ) : null}
      </ScrollView>

      <PlaceNewReadSheet
        visible={readSheetVisible}
        category={place.category}
        onClose={() => setReadSheetVisible(false)}
        onSave={handleSaveRead}
      />
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
  addReadButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  addReadButtonText: {
    color: colors.accent.warmGold,
    fontSize: 13,
    fontWeight: '600',
  },
  readSavedText: {
    color: colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
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
