import { Link, router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  getPlaceCategoryLabel,
  getPlaceFitLabel,
  getPlaceReading,
} from '@/lib/places';
import { useRelationsStore } from '@/store/useRelationsStore';

export default function PlacesScreen() {
  const { places } = useRelationsStore();

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Places</Text>
        <Text style={styles.subtitle}>
          A quiet memory of where connection felt right.
        </Text>
        <Link href="../place/add" style={styles.addLink}>
          + Save a place
        </Link>
      </View>

      <View style={styles.list}>
        {places.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No place yet</Text>
            <Text style={styles.emptyText}>
              Start with one place and one simple note.
            </Text>
          </View>
        ) : (
          places.map((place) => {
            return (
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
