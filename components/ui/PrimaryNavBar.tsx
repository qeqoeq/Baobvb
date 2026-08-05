import * as Haptics from 'expo-haptics';
import { router, usePathname, type Href } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../constants/colors';
import { spacing } from '../../constants/spacing';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import { getPrimaryNavItems, type PrimaryNavKey } from '../../lib/primary-nav';
import { useRelationsStore } from '../../store/useRelationsStore';

/**
 * B30 — the ONE permanent primary navigation bar, shared across the five primary
 * surfaces: the home (Jardin), Rechercher, Lieux, Révélations, Toi. It is mounted
 * on all five so the return to the home is uniform from every screen (Sou 20/07:
 * « un retour uniforme à la HomePage depuis toutes les pages »).
 *
 * Extracted verbatim in intent from app/(tabs)/index.tsx (B23 invariant preserved:
 * every entry ALWAYS renders; a count is only an informational badge, never a gate).
 * The active entry is visually distinguished (accent label + underline) — Sou:
 * « bien distinguer les différentes pages ».
 *
 * Routing is deterministic: every entry navigates with router.push (never replace);
 * tapping the entry you are already on is a no-op (prevents redundant self-pushes).
 */

const ROUTE_BY_KEY: Record<PrimaryNavKey, Href> = {
  home: '/(tabs)',
  garden: '/garden',
  places: '/place',
  reveals: '/reveals',
  profile: '/me/profile',
};

function activeKeyForPath(pathname: string): PrimaryNavKey | null {
  if (pathname === '/' || pathname === '/(tabs)') return 'home';
  if (pathname.startsWith('/garden')) return 'garden';
  if (pathname.startsWith('/place')) return 'places';
  if (pathname.startsWith('/reveals')) return 'reveals';
  if (pathname.startsWith('/me/profile')) return 'profile';
  return null;
}

export function PrimaryNavBar() {
  const { relations, evaluations } = useRelationsStore();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const activeKey = activeKeyForPath(usePathname());

  // Pending reveals badge — computed once here so every host shows the same count
  // (ready + in-flight toward a reveal), same rule as the home used before B30.
  const pendingReveals = useMemo(() => {
    const readings = getFoundationalReadings(relations, evaluations);
    return readings.filter((r) => {
      if (r.relation.archived) return false;
      const s = r.relation.localState.revealSnapshot.status;
      return (
        s === 'reveal_ready' ||
        s === 'cooking_reveal' ||
        (s === 'waiting_other_side' && r.hasFoundationalReading)
      );
    }).length;
  }, [relations, evaluations]);

  return (
    <View style={[styles.bar, { paddingBottom: bottomInset + spacing.xs }]}>
      {getPrimaryNavItems({ pendingReveals }).map((item) => {
        const isActive = item.key === activeKey;
        return (
          <Pressable
            key={item.key}
            style={styles.item}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            onPress={() => {
              if (isActive) return;
              if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push(ROUTE_BY_KEY[item.key]);
            }}
          >
            <Text
              style={[styles.label, isActive && styles.labelActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {item.label}
            </Text>
            {/* Badge is absolutely positioned so it never competes with the label
                width — the longest label ("Révélations") always keeps the full cell,
                so 5 entries never truncate. */}
            {item.badge !== null ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.badge}</Text>
              </View>
            ) : null}
            <View style={[styles.activeBar, isActive && styles.activeBarOn]} />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
    backgroundColor: colors.background.primary,
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    paddingVertical: spacing.xs,
    gap: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    letterSpacing: 0,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.accent.warmGold,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: '22%',
    minWidth: 15,
    height: 15,
    borderRadius: 7.5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.warmGold,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.background.primary,
  },
  activeBar: {
    width: 16,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'transparent',
  },
  activeBarOn: {
    backgroundColor: colors.accent.warmGold,
  },
});
