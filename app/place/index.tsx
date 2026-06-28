import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  deriveRouteTerritorySignals,
  deriveTrustWorldTerritory,
  getPlaceCategoryLabel,
  getPlaceReading,
  PLACE_CATEGORY_LABELS,
  PLACE_CONTEXT_FIT_LABELS,
  PLACE_CONTEXT_FIT_OPTIONS,
} from '@/lib/places';
import type { PlaceContextFit } from '@/lib/place-quick-signal';
import { derivePrivatePlaceValue, synthesizeMultiReadInput } from '@/lib/private-place-value';
import { useRelationsStore, type PlaceCategory } from '@/store/useRelationsStore';

// Local-only filter — no engine, no persistence. Selecting a chip filters
// places already saved on this device; it never recommends, ranks, or
// fetches anything new.
const FILTER_CATEGORIES: PlaceCategory[] = ['restaurant', 'cafe', 'bar', 'spot'];

// Same three-bucket semantic logic, applied to the composite private value
// (derivePrivatePlaceValue, lib/private-place-value.ts) rather than to
// landingLevel alone — never a numeric score, never a star, never a gauge.
// Never semantic.trust (relational confidence, never a place's value).
function getPrivatePlaceValueColor(value: number): string {
  if (value >= 70) return colors.semantic.growth;
  if (value >= 45) return colors.semantic.caution;
  return colors.text.muted;
}

export default function PlacesScreen() {
  const { places, relations, evaluations } = useRelationsStore();
  const [selectedCategory, setSelectedCategory] = useState<PlaceCategory | null>(null);
  const [selectedContext, setSelectedContext] = useState<PlaceContextFit | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const territory = useMemo(
    () => deriveTrustWorldTerritory(deriveRouteTerritorySignals(places, relations, evaluations)),
    [places, relations, evaluations],
  );

  // Synthesized inputs keyed by place.id — computed once per places-change,
  // used for value, context filter, dominantContext chip, and impression.
  const placeInputs = useMemo(
    () => new Map(places.map((p) => [p.id, synthesizeMultiReadInput(p)])),
    [places],
  );

  const territoryCategories = territory.categories.filter(
    (c) => c.category !== 'other',
  );

  // Private structural counts only — own data, never a route/relation
  // count, never a percentage, average, or score.
  const totalPlaceCount = places.length;
  const keptPlaceCount = places.filter((place) => place.personalFit === 'kept').length;
  const territoryCount = territoryCategories.length;

  const hasActivePlaceFilter = selectedCategory !== null || selectedContext !== null;

  const toggleCategory = (category: PlaceCategory) => {
    setSelectedCategory((current) => (current === category ? null : category));
  };

  const toggleContext = (context: PlaceContextFit) => {
    setSelectedContext((current) => (current === context ? null : context));
  };

  // Local filter only — reads category/contextFit/personalFit directly off
  // each Place, never a derived engine signal (no PrivateObjectFit, no
  // PrivateRouteObjectFit, no PrivateTasteVector). With no filter active,
  // this is a no-op identity filter — the page behaves exactly as before.
  const filteredPlaces = places.filter((place) => {
    const passesCategory = selectedCategory == null || place.category === selectedCategory;
    const syntheticContextFit = placeInputs.get(place.id)?.quickSignal?.contextFit;
    const passesContext =
      selectedContext == null || syntheticContextFit?.includes(selectedContext) === true;
    const passesFit = !hasActivePlaceFilter || place.personalFit !== 'not_for_me';
    return passesCategory && passesContext && passesFit;
  });

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View pointerEvents="none" style={styles.glowAccent} />

      <View style={styles.header}>
        <View style={styles.headerBrand}>
          <View style={styles.baobabMark} />
          <Text style={styles.headerKicker}>{'BAOBAB'}</Text>
        </View>
        <Text style={styles.title}>Your places</Text>
        <Text style={styles.subtitle}>
          A private read of where your world leaves traces.
        </Text>
        <View style={styles.headerAccentLine} />
      </View>

      {totalPlaceCount > 0 && (
        <View style={styles.readingCard}>
          <Text style={styles.readingTotal}>{totalPlaceCount}</Text>
          <Text style={styles.readingTotalLabel}>places in your real world</Text>
          <Text style={styles.readingDetail}>
            {`${keptPlaceCount} kept · ${territoryCount} territories`}
          </Text>
        </View>
      )}

      {territoryCategories.length > 0 && (
        <View style={styles.territoryCard}>
          <Text style={styles.territoryEyebrow}>{'TERRITORIES'}</Text>
          <View style={styles.chipRow}>
            {territoryCategories.map(({ category }) => (
              <View key={category} style={styles.chip}>
                <Text style={styles.chipText}>{getPlaceCategoryLabel(category)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.territoryCaption}>
            {'What your trusted world keeps finding.'}
          </Text>
        </View>
      )}

      <Pressable
        style={styles.filterRow}
        onPress={() => setFilterOpen((open) => !open)}
      >
        <Text style={styles.filterRowText}>Filter places</Text>
      </Pressable>

      {filterOpen && (
        <View style={styles.filterCard}>
          <Text style={styles.filterSubtitle}>
            {'Look through places you’ve added.'}
          </Text>
          <View style={styles.chipRow}>
            {FILTER_CATEGORIES.map((category) => {
              const active = category === selectedCategory;
              return (
                <Pressable
                  key={category}
                  onPress={() => toggleCategory(category)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {PLACE_CATEGORY_LABELS[category]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.chipRow}>
            {PLACE_CONTEXT_FIT_OPTIONS.map((context) => {
              const active = context === selectedContext;
              return (
                <Pressable
                  key={context}
                  onPress={() => toggleContext(context)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {PLACE_CONTEXT_FIT_LABELS[context]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.list}>
        {places.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No place yet</Text>
            <Text style={styles.emptyText}>
              Start with one place and one simple note.
            </Text>
          </View>
        ) : filteredPlaces.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>Nothing here yet.</Text>
            <Text style={styles.emptyText}>
              No places match this filter.
            </Text>
          </View>
        ) : (
          filteredPlaces.map((place) => {
            const valueInput = placeInputs.get(place.id)!;
            const privateValue = derivePrivatePlaceValue(valueInput);
            const dominantContext = valueInput.quickSignal?.contextFit?.[0];
            return (
              <Pressable
                key={place.id}
                onPress={() => router.push(`../place/${place.id}`)}
                style={styles.card}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.name}>{place.name}</Text>
                  <Text style={[styles.readValue, { color: getPrivatePlaceValueColor(privateValue.value) }]}>
                    {privateValue.value}
                  </Text>
                </View>
                <View style={styles.cardMetaRow}>
                  <View style={styles.metaRow}>
                    <Text style={styles.meta}>{getPlaceCategoryLabel(place.category)}</Text>
                    {dominantContext && (
                      <>
                        <Text style={styles.metaSeparator}>{' · '}</Text>
                        <Text style={styles.metaContext}>{PLACE_CONTEXT_FIT_LABELS[dominantContext]}</Text>
                      </>
                    )}
                  </View>
                  <Text style={styles.readValueLabel}>{'private read'}</Text>
                </View>
                <Text style={styles.impression}>
                  {getPlaceReading({ impression: valueInput.impression, personalFit: place.personalFit })}
                </Text>
              </Pressable>
            );
          })
        )}
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
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  glowAccent: {
    position: 'absolute',
    top: -10,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent.warmGold + '0C',
  },

  // ── Header ─────────────────────────────────────────────────────────────────

  header: {
    gap: spacing.xs + 2,
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
  title: {
    color: colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.text.muted,
    lineHeight: 20,
  },
  headerAccentLine: {
    width: 28,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent.warmGold + '55',
    marginTop: spacing.xs,
  },

  // ── Territory card ─────────────────────────────────────────────────────────

  territoryCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '2A',
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    gap: spacing.sm,
  },
  territoryEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent.warmGold,
    letterSpacing: 2.5,
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
  chipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  territoryCaption: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 18,
  },

  // ── Private reading ────────────────────────────────────────────────────────

  readingCard: {
    gap: spacing.xs,
  },
  readingTotal: {
    color: colors.text.primary,
    fontSize: 40,
    fontWeight: '700',
  },
  readingTotalLabel: {
    color: colors.text.muted,
    fontSize: 13,
  },
  readingDetail: {
    color: colors.accent.warmGold,
    fontSize: 13,
    fontWeight: '600',
    opacity: 0.85,
  },

  // ── Filter block ───────────────────────────────────────────────────────────

  filterRow: {
    paddingVertical: spacing.xs,
  },
  filterRowText: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  filterCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    gap: spacing.sm,
  },
  filterSubtitle: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 18,
  },
  chipActive: {
    borderColor: colors.accent.deepTeal,
    backgroundColor: colors.background.tertiary,
  },
  chipTextActive: {
    color: colors.text.primary,
  },

  // ── Place list ─────────────────────────────────────────────────────────────

  list: {
    gap: spacing.md,
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    color: colors.text.muted,
    lineHeight: 20,
  },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  readValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  cardMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  readValueLabel: {
    color: colors.text.muted,
    fontSize: 11,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    color: colors.text.muted,
    fontSize: 13,
  },
  metaSeparator: {
    color: colors.text.muted,
    fontSize: 13,
  },
  metaContext: {
    color: colors.text.muted,
    fontSize: 13,
  },
  impression: {
    color: '#CFC8BF',
    lineHeight: 20,
  },
});
