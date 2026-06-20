import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  getPlaceCategoryLabel,
  getPlaceFitLabel,
  getPlaceReading,
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
  const { places, updatePlace } = useRelationsStore();
  const place = places.find((item) => item.id === params.id);

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
          <Text style={styles.kicker}>{getPlaceCategoryLabel(place.category)}</Text>
          <Text style={styles.title}>{place.name}</Text>
          <Text style={styles.fit}>{getPlaceFitLabel(place.personalFit)}</Text>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionLabel}>Reading</Text>
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

        <Pressable
          onPress={() => router.push(`../place/edit/${place.id}`)}
          style={styles.editButton}
        >
          <Text style={styles.editButtonText}>Edit this place</Text>
        </Pressable>
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
