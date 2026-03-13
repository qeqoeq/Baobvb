import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import { useRelationsStore } from '../../store/useRelationsStore';

type Proximity = 'direct' | 'near' | 'far';

type CircleMember = {
  id: string;
  name: string;
  handle: string;
  proximity: Proximity;
  readingLabel: string;
  avatarSeed?: string;
};

const SUFFIXES = ['branch', 'root', 'leaf', 'seed', 'bloom'];

function deriveHandle(name: string, id: string): string {
  const hash = id.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return '@' + name.toLowerCase().replace(/\s+/g, '.') + '.' + SUFFIXES[hash % SUFFIXES.length];
}

function maskName(name: string, proximity: Proximity): string {
  if (proximity !== 'far') return name;
  return name.charAt(0) + '\u2009\u2022\u2009\u2022\u2009\u2022';
}

const PROXIMITY_META: Record<
  Proximity,
  {
    label: string;
    sectionLabel: string;
    accent: string;
    cardOpacity: number;
    avatarBorder: number;
  }
> = {
  direct: {
    label: 'Direct',
    sectionLabel: 'Inner circle',
    accent: colors.accent.deepTeal,
    cardOpacity: 1.0,
    avatarBorder: 2,
  },
  near: {
    label: 'Near',
    sectionLabel: 'Nearby',
    accent: colors.accent.warmGold,
    cardOpacity: 0.72,
    avatarBorder: 1.5,
  },
  far: {
    label: 'Far',
    sectionLabel: 'Distant',
    accent: colors.text.muted,
    cardOpacity: 0.38,
    avatarBorder: 1,
  },
};

const PROXIMITY_ORDER: Proximity[] = ['direct', 'near', 'far'];

export default function CircleScreen() {
  const { relations, evaluations } = useRelationsStore();

  const readings = useMemo(
    () => getFoundationalReadings(relations, evaluations),
    [relations, evaluations],
  );

  const members = useMemo<CircleMember[]>(
    () => readings.map((reading) => {
      // V1 proximity heuristic:
      // - direct: active + read + not to nurture
      // - near: active + read + to nurture
      // - far: archived OR unread
      const proximity: Proximity = reading.relation.archived
        ? 'far'
        : reading.hasFoundationalReading
          ? reading.toNurture
            ? 'near'
            : 'direct'
          : 'far';

      const readingLabel = reading.relation.archived
        ? `Archived · ${reading.badgeLabel}`
        : reading.badgeLabel;

      return {
        id: reading.relation.id,
        name: reading.relation.name,
        handle: reading.relation.handle || deriveHandle(reading.relation.name, reading.relation.id),
        proximity,
        readingLabel,
        avatarSeed: reading.relation.avatarSeed,
      };
    }),
    [readings],
  );

  const groups = useMemo(() => {
    const map = new Map<Proximity, CircleMember[]>();
    for (const p of PROXIMITY_ORDER) {
      const group = members.filter((m) => m.proximity === p);
      if (group.length > 0) map.set(p, group);
    }
    return map;
  }, [members]);

  const totalCount = members.length;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Circle</Text>
        <View style={styles.heroRow}>
          <View style={styles.heroText}>
            <Text style={styles.title}>Your trust{'\n'}network</Text>
            <Text style={styles.heroCount}>
              {totalCount} {totalCount === 1 ? 'person' : 'people'} in view
            </Text>
          </View>
          <View style={styles.rings}>
            <View style={styles.ringOuter}>
              <View style={styles.ringMiddle}>
                <View style={styles.ringInner}>
                  <View style={styles.ringCenter} />
                </View>
              </View>
            </View>
          </View>
        </View>
        <Text style={styles.intro}>
          The closer people are to your inner circle, the clearer they appear.
        </Text>
      </View>

      {totalCount === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No one yet</Text>
          <Text style={styles.emptyText}>
            Your circle will grow as you add people in your Garden.
          </Text>
        </View>
      ) : (
        PROXIMITY_ORDER.map((proximity) => {
          const group = groups.get(proximity);
          if (!group) return null;
          const meta = PROXIMITY_META[proximity];
          return (
            <View key={proximity} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.sectionDot, { backgroundColor: meta.accent }]} />
                <Text style={[styles.sectionLabel, { color: meta.accent }]}>
                  {meta.sectionLabel}
                </Text>
                <View style={styles.sectionLine} />
              </View>
              <View style={styles.sectionCards}>
                {group.map((member) => (
                  <Pressable
                    key={member.id}
                    onPress={() => router.push(`../relation/${member.id}`)}
                    style={[
                      styles.memberCard,
                      { opacity: meta.cardOpacity, borderLeftColor: meta.accent + '55' },
                    ]}
                  >
                    <View style={styles.avatarWrap}>
                      <View
                        style={[
                          styles.avatar,
                          {
                            backgroundColor: meta.accent + '12',
                            borderColor: meta.accent + '44',
                            borderWidth: meta.avatarBorder,
                          },
                        ]}
                      >
                        <Text style={[styles.avatarLetter, { color: meta.accent }]}>
                          {(member.avatarSeed || member.name.charAt(0) || '?').toUpperCase()}
                        </Text>
                      </View>
                      {proximity === 'far' && <View style={styles.avatarFog} />}
                    </View>
                    <View style={styles.memberBody}>
                      <Text
                        style={[
                          styles.memberName,
                          proximity === 'far' && styles.memberNameFar,
                        ]}
                      >
                        {maskName(member.name, member.proximity)}
                      </Text>
                      <Text
                        style={[
                          styles.memberHandle,
                          proximity === 'direct' && styles.memberHandleDirect,
                        ]}
                      >
                        {member.handle} · {member.readingLabel}
                      </Text>
                    </View>
                    <View style={[styles.proximityBadge, { borderColor: meta.accent + '33' }]}>
                      <Text style={[styles.proximityLabel, { color: meta.accent }]}>
                        {meta.label}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </View>
          );
        })
      )}

      <View style={styles.privacyCard}>
        <View style={styles.privacyDot} />
        <Text style={styles.privacyText}>
          Only link types are visible — detailed notes stay private.
        </Text>
      </View>
    </ScrollView>
  );
}

const RING = colors.accent.deepTeal;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    padding: spacing.lg,
    paddingTop: 48,
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },

  hero: {
    gap: spacing.sm,
  },
  kicker: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.text.muted,
    fontWeight: '600',
  },
  heroRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroText: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 36,
  },
  heroCount: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '600',
    marginTop: 2,
  },
  intro: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text.secondary,
  },

  rings: {
    marginRight: spacing.sm,
  },
  ringOuter: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: RING + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringMiddle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: RING + '28',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: RING + '50',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: RING,
  },

  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },
  sectionCards: {
    gap: spacing.sm,
  },

  memberCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderLeftWidth: 3,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: '700',
  },
  avatarFog: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 24,
    backgroundColor: colors.background.primary + 'AA',
  },
  memberBody: {
    flex: 1,
    gap: 3,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  memberNameFar: {
    color: colors.text.secondary,
    letterSpacing: 1,
  },
  memberHandle: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '500',
  },
  memberHandleDirect: {
    color: colors.accent.warmGold + 'BB',
  },
  proximityBadge: {
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  proximityLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  emptyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },

  privacyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.background.secondary + '80',
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  privacyDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.text.muted,
  },
  privacyText: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 18,
  },
});
