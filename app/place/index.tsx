import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  deriveRouteTerritorySignals,
  deriveTrustWorldTerritory,
  getPlaceCategoryLabel,
  getPlaceFitLabel,
  getPlaceReading,
} from '@/lib/places';
import { useRelationsStore } from '@/store/useRelationsStore';

export default function PlacesScreen() {
  const { places } = useRelationsStore();

  const territory = useMemo(
    () => deriveTrustWorldTerritory(deriveRouteTerritorySignals(places)),
    [places],
  );

  const territoryCategories = territory.categories.filter(
    (c) => c.category !== 'other',
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Places</Text>
        <Text style={styles.subtitle}>
          A quiet memory of where connection felt right.
        </Text>
        <Link href="../place/add" style={styles.addLink}>
          + Save a place
        </Link>
      </View>

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

      <View style={styles.list}>
        {places.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No place yet</Text>
            <Text style={styles.emptyText}>
              Start with one place and one simple note.
            </Text>
          </View>
        ) : (
          places.map((place) => (
            <Pressable
              key={place.id}
              onPress={() => router.push(`../place/${place.id}`)}
              style={styles.card}
            >
              <View style={styles.row}>
                <Text style={styles.name}>{place.name}</Text>
                <Text style={styles.fit}>{getPlaceFitLabel(place.personalFit)}</Text>
              </View>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{getPlaceCategoryLabel(place.category)}</Text>
              </View>
              <Text style={styles.impression}>{getPlaceReading(place)}</Text>
            </Pressable>
          ))
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
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  // ── Header ─────────────────────────────────────────────────────────────────

  header: {
    gap: spacing.xs + 2,
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
  addLink: {
    marginTop: spacing.sm,
    color: '#315245',
    fontWeight: '700',
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
    color: colors.text.muted,
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
  row: {
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
  fit: {
    color: colors.text.secondary,
    fontSize: 12,
    fontWeight: '600',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meta: {
    color: colors.text.muted,
    fontSize: 13,
  },
  impression: {
    color: '#CFC8BF',
    lineHeight: 20,
  },
});
