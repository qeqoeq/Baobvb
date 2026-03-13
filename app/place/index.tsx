import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import { type PlaceCategory, useRelationsStore } from '@/store/useRelationsStore';

const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  restaurant: 'Restaurant',
  cafe: 'Cafe',
  bar: 'Bar',
  spot: 'Spot',
  other: 'Other',
};

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
          places.map((place) => (
            <View key={place.id} style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.name}>{place.name}</Text>
                <Text style={styles.rating}>{place.rating}/5</Text>
              </View>
              <Text style={styles.meta}>{CATEGORY_LABELS[place.category]}</Text>
              {place.impression ? (
                <Text style={styles.impression}>{place.impression}</Text>
              ) : null}
            </View>
          ))
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
  impression: {
    color: '#5B544D',
    lineHeight: 20,
  },
});
