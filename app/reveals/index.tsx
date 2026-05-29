import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import { getRelationSheetIdentity } from '../../lib/relation-detail-helpers';
import { useRelationsStore } from '../../store/useRelationsStore';

// Dark-warm palette — scoped to /reveals, consistent with the Baobab dark world.
const p = {
  screenBg:    colors.background.primary,    // '#111313'
  cardBg:      colors.background.secondary,  // '#171A18'
  cardBorder:  '#342A18',                    // amber-tinted dark edge
  heroBg:      '#161210',                    // very dark warm ground
  heroBorder:  '#3C2E14',                    // muted gold ring
  heroGlow:    '#9A7010',                    // shadow colour for hero card
  textPrimary: colors.text.primary,          // '#F4F1EA'
  textSub:     colors.text.secondary,        // '#B8B3A8'
  textMuted:   colors.text.muted,            // '#7E7A72'
  gold:        colors.accent.warmGold,       // '#D8A85F'
  amber:       colors.accent.softAmber,      // '#E8B87A'
  backBorder:  colors.border.soft,           // '#252C25'
} as const;

// Avatar ring colours — legible on dark surfaces.
const avatarPaletteReveal = [
  '#A04818', // terracotta
  '#1A6040', // deep teal
  '#702858', // plum
  '#245480', // slate blue
  '#486818', // olive
  '#803A18', // burnt sienna
] as const;

function getAvatarRevealColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return avatarPaletteReveal[Math.abs(hash) % avatarPaletteReveal.length];
}

export default function RevealLinksScreen() {
  const { activeRelations, evaluations } = useRelationsStore();

  const heroPulse = useRef(new Animated.Value(0)).current;

  // Reveal links ordered by recency — this surface is about opening what just became ready.
  const readyEntries = useMemo(
    () =>
      getFoundationalReadings(activeRelations, evaluations)
        .filter((entry) => entry.relation.localState.revealSnapshot.status === 'reveal_ready')
        .sort((a, b) => b.recentDate.localeCompare(a.recentDate)),
    [activeRelations, evaluations],
  );

  useEffect(() => {
    if (readyEntries.length === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroPulse, { toValue: 1, duration: 1300, useNativeDriver: true }),
        Animated.timing(heroPulse, { toValue: 0, duration: 1300, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [readyEntries.length, heroPulse]);

  const heroSparkScale   = heroPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] });
  const heroSparkOpacity = heroPulse.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.55, 1, 0.25] });

  // tracking: onRevealMomentPress
  const handleMomentPress = (id: string) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/relation/${id}`);
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ headerShown: false }} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerKicker}>BAOBAB</Text>
          <Text style={styles.headerTitle}>Reveal</Text>
        </View>
        <Pressable
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/garden');
          }}
          style={styles.headerBack}
        >
          <Text style={styles.headerBackText}>Garden</Text>
        </Pressable>
      </View>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <View style={styles.heroCard}>
        <View style={styles.heroCountRow}>
          <Text style={styles.heroCount}>{readyEntries.length}</Text>
          <Text style={styles.heroConcept}>READY</Text>
        </View>
        <View style={styles.heroField}>
          {/* Warm-embers orb constellation — solid, no blur. */}
          <View style={[styles.heroOrb, styles.heroOrbA]} />
          <View style={[styles.heroOrb, styles.heroOrbB]} />
          <View style={[styles.heroOrb, styles.heroOrbC]} />
          <View style={[styles.heroOrb, styles.heroOrbD]} />
          {readyEntries.length > 0 ? (
            <Animated.View
              style={[
                styles.heroSpark,
                { transform: [{ scale: heroSparkScale }], opacity: heroSparkOpacity },
              ]}
            />
          ) : null}
        </View>
      </View>

      {/* ── List / Empty ───────────────────────────────────────────────────── */}
      {readyEntries.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>All clear</Text>
          <Text style={styles.emptyBody}>
            When both sides are in, a link appears here.
          </Text>
          <Pressable onPress={() => router.replace('/(tabs)/garden')} style={styles.emptyCTA}>
            <Text style={styles.emptyCTAText}>Garden</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.momentList}>
          {readyEntries.map((entry) => {
            const identity    = getRelationSheetIdentity({ relation: entry.relation });
            const avatarColor = getAvatarRevealColor(entry.relation.name);
            const initial     = (entry.relation.avatarSeed || entry.relation.name.charAt(0) || '?').toUpperCase();
            return (
              <Pressable
                key={entry.relation.id}
                onPress={() => handleMomentPress(entry.relation.id)}
                style={styles.momentCard}
              >
                <View style={[styles.momentAvatar, { backgroundColor: avatarColor + '22', borderColor: avatarColor + '66' }]}>
                  <Text style={[styles.momentInitial, { color: avatarColor + 'EE' }]}>{initial}</Text>
                </View>
                <Text style={styles.momentTitle}>{identity.primaryTitle}</Text>
                <Text style={styles.momentChevron}>›</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: p.screenBg,
  },
  content: {
    padding: spacing.lg,
    paddingTop: 52,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },

  // ── Header ───────────────────────────────────────────────────────────────

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerTitleBlock: {
    gap: 2,
  },
  headerKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: p.textMuted,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: p.textPrimary,
    letterSpacing: -0.5,
  },
  headerBack: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: p.backBorder,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  headerBackText: {
    fontSize: 11,
    fontWeight: '700',
    color: p.textMuted,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },

  // ── Hero ─────────────────────────────────────────────────────────────────

  heroCard: {
    backgroundColor: p.heroBg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: p.heroBorder,
    padding: spacing.lg,
    gap: spacing.xs,
    shadowColor: p.heroGlow,
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  heroCountRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  heroCount: {
    fontSize: 52,
    lineHeight: 52,
    fontWeight: '700',
    color: p.textPrimary,
    letterSpacing: -2,
  },
  heroConcept: {
    fontSize: 13,
    fontWeight: '700',
    color: p.gold,
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    paddingBottom: 7,
  },
  heroField: {
    position: 'relative',
    height: 88,
    marginTop: spacing.xs,
  },
  heroOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  heroOrbA: {
    width: 54,
    height: 54,
    left: 8,
    top: 18,
    backgroundColor: '#7E5614',
  },
  heroOrbB: {
    width: 34,
    height: 34,
    left: 50,
    top: 4,
    backgroundColor: '#A87828',
  },
  heroOrbC: {
    width: 26,
    height: 26,
    left: 96,
    top: 42,
    backgroundColor: '#BE8C30',
  },
  heroOrbD: {
    width: 44,
    height: 44,
    right: 36,
    top: 12,
    backgroundColor: '#6A4810',
  },
  heroSpark: {
    position: 'absolute',
    width: 9,
    height: 9,
    borderRadius: 5,
    right: 10,
    top: 52,
    backgroundColor: p.amber,
    shadowColor: p.amber,
    shadowOpacity: 0.8,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },

  // ── Moment list ───────────────────────────────────────────────────────────

  momentList: {
    gap: spacing.sm,
  },
  momentCard: {
    backgroundColor: p.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: p.cardBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  momentAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  momentInitial: {
    fontSize: 16,
    fontWeight: '700',
  },
  momentTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: p.textPrimary,
  },
  momentChevron: {
    fontSize: 20,
    fontWeight: '400',
    color: p.textMuted,
  },

  // ── Empty ─────────────────────────────────────────────────────────────────

  emptyCard: {
    backgroundColor: p.cardBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: p.textPrimary,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 19,
    color: p.textSub,
  },
  emptyCTA: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: p.backBorder,
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  emptyCTAText: {
    fontSize: 12,
    fontWeight: '700',
    color: p.textMuted,
    letterSpacing: 0.3,
  },
});
