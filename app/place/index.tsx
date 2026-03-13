import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  getPlaceCategoryLabel,
  getPlaceReading,
  getPlaceRatingSignature,
  getPlaceTone,
  sanitizeRating,
} from '@/lib/places';
import { useRelationsStore } from '@/store/useRelationsStore';

export default function PlacesScreen() {
  const { places } = useRelationsStore();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Places & tastes</Text>
        <Text style={styles.subtitle}>
          A quiet memory of where connection felt right.
        </Text>
        <Link href="../place/add" style={styles.addLink}>
          + Rate a place
        </Link>
      </View>

      <View style={styles.list}>
        {places.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No place yet</Text>
            <Text style={styles.emptyText}>
              Start with one place and one simple note of taste.
            </Text>
          </View>
        ) : (
          places.map((place) => {
            const safeRating = sanitizeRating(place.rating);
            const tone = getPlaceTone(safeRating);
            return (
              <Pressable
                key={place.id}
                onPress={() => router.push(`../place/${place.id}`)}
                style={[
                  styles.card,
                  {
                    borderColor: tone.border,
                    backgroundColor: tone.tint,
                  },
                ]}
              >
                <View style={styles.row}>
                  <Text style={styles.name}>{place.name}</Text>
                  <Text style={[styles.rating, { color: tone.accent }]}>{safeRating}/5</Text>
                </View>
                <View style={styles.metaRow}>
                  <Text style={styles.meta}>{getPlaceCategoryLabel(place.category)}</Text>
                  <Text style={[styles.signature, { color: tone.accent }]}>
                    {getPlaceRatingSignature(safeRating)}
                  </Text>
                </View>
                <Text style={styles.impression}>{getPlaceReading(place)}</Text>
              </Pressable>
            );
          })
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    gap: spacing.lg,
  },
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
  rating: {
    color: '#48624B',
    fontWeight: '700',
  },
  meta: {
    color: colors.text.muted,
    fontSize: 13,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  signature: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  impression: {
    color: '#CFC8BF',
    lineHeight: 20,
  },
});
