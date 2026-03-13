import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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

function formatPlaceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently added';
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function PlaceDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { places } = useRelationsStore();
  const place = places.find((item) => item.id === params.id);

  if (!place) {
    return (
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
    );
  }

  const safeRating = sanitizeRating(place.rating);
  const tone = getPlaceTone(safeRating);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View
        style={[
          styles.heroCard,
          {
            backgroundColor: tone.tint,
            borderColor: tone.border,
          },
        ]}
      >
        <Text style={styles.kicker}>{getPlaceCategoryLabel(place.category)}</Text>
        <Text style={styles.title}>{place.name}</Text>
        <View style={styles.heroRow}>
          <Text style={[styles.rating, { color: tone.accent }]}>{safeRating}/5</Text>
          <Text style={[styles.signature, { color: tone.accent }]}>
            {getPlaceRatingSignature(safeRating)}
          </Text>
        </View>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionLabel}>Reading</Text>
        <Text style={styles.readingText}>{getPlaceReading(place)}</Text>
      </View>

      <View style={styles.sectionCard}>
        <Text style={styles.sectionLabel}>Added</Text>
        <Text style={styles.metaText}>{formatPlaceDate(place.createdAt)}</Text>
      </View>

      <Pressable
        onPress={() => router.push(`../place/edit/${place.id}`)}
        style={styles.editButton}
      >
        <Text style={styles.editButtonText}>Edit this place</Text>
      </Pressable>
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
  heroCard: {
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
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
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rating: {
    fontSize: 18,
    fontWeight: '700',
  },
  signature: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
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
  editButton: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  editButtonText: {
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
