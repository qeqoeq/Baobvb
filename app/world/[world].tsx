import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/constants/colors';
import { spacing } from '@/constants/spacing';
import { getPlaceCategoryLabel } from '@/lib/places';
import {
  deriveWorldKeptPlaces,
  getRelationOpenWorldLabel,
  isRelationOpenWorld,
} from '@/lib/relation-open-worlds';
import { useRelationsStore } from '@/store/useRelationsStore';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function WorldDetailScreen() {
  const params = useLocalSearchParams<{ world?: string }>();
  const { places, relations, evaluations } = useRelationsStore();
  const { bottom: bottomInset } = useSafeAreaInsets();

  const world = isRelationOpenWorld(params.world) ? params.world : null;
  const worldLabel = world ? getRelationOpenWorldLabel(world) : '';

  const keptPlaces = useMemo(
    () => (world ? deriveWorldKeptPlaces(world, places, relations, evaluations) : []),
    [world, places, relations, evaluations],
  );

  if (!world) {
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
        <View style={styles.screen}>
          <Text style={styles.invalidText}>{'Unknown world.'}</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: worldLabel,
          headerStyle: { backgroundColor: colors.background.primary },
          headerTintColor: colors.text.primary,
          headerShadowVisible: false,
          headerBackTitle: '',
          headerBackButtonDisplayMode: 'minimal',
        }}
      />
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: Math.max(spacing.xl, bottomInset) },
        ]}
      >
        <Text style={styles.caption}>{'Places you kept as this world opened.'}</Text>

        {keptPlaces.length === 0 ? (
          <Text style={styles.emptyText}>{'Nothing kept in this world yet.'}</Text>
        ) : (
          <View style={styles.placeList}>
            {keptPlaces.map((item, index) => (
              <Pressable
                key={item.id}
                style={[styles.placeRow, index > 0 && styles.placeRowBorder]}
                onPress={() => {
                  if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/place/${item.id}`);
                }}
              >
                <Text style={styles.placeName}>{item.name}</Text>
                <Text style={styles.placeCategory}>{getPlaceCategoryLabel(item.category)}</Text>
                {item.impression ? (
                  <Text style={styles.placeImpression}>{item.impression}</Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  invalidText: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    fontSize: 14,
    color: colors.text.muted,
  },
  caption: {
    fontSize: 13,
    color: colors.text.muted,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    color: colors.text.muted,
    lineHeight: 20,
  },
  placeList: {
    gap: 0,
  },
  placeRow: {
    paddingVertical: spacing.md,
    gap: 4,
  },
  placeRowBorder: {
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
  },
  placeName: {
    fontSize: 17,
    fontWeight: '600',
    color: colors.text.primary,
    letterSpacing: -0.2,
  },
  placeCategory: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  placeImpression: {
    fontSize: 14,
    color: colors.text.secondary,
    lineHeight: 20,
    marginTop: 2,
  },
});
