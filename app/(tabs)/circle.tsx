import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import EgoGraph from '../../components/ui/EgoGraph';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import {
  deriveCircleProximity,
  deriveGatewayAccessState,
  deriveGatewayPowerBand,
  deriveProximityBand,
  deriveLinkQualityBand,
  getCircleNodeStatus,
  getCircleNodeStatusLabel,
  type CircleNodeStatus,
  type MapMember,
  type Proximity,
} from '../../lib/circle-node-state';
import { useRelationsStore } from '../../store/useRelationsStore';

// ─── Types ────────────────────────────────────────────────────────────────────

type CircleMember = {
  id: string;
  name: string;
  handle: string;
  proximity: Proximity;
  status: CircleNodeStatus;
  archived: boolean;
  avatarSeed?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const VIEW_MODE_KEY = 'circle:viewMode';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CircleScreen() {
  const { me, relations, evaluations } = useRelationsStore();
  const { width: screenWidth } = useWindowDimensions();
  const atlasSize = screenWidth - spacing.lg * 2;
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');

  // Restore persisted view preference
  useEffect(() => {
    AsyncStorage.getItem(VIEW_MODE_KEY)
      .then((val) => { if (val === 'map') setViewMode('map'); })
      .catch(() => {});
  }, []);

  const handleToggle = useCallback((mode: 'list' | 'map') => {
    setViewMode(mode);
    void AsyncStorage.setItem(VIEW_MODE_KEY, mode);
  }, []);

  const handleOverflowTap = useCallback(() => {
    handleToggle('list');
  }, [handleToggle]);

  const readings = useMemo(
    () => getFoundationalReadings(relations, evaluations),
    [relations, evaluations],
  );

  // List view members — all relations (archived appear in 'far' section)
  const members = useMemo<CircleMember[]>(
    () => readings.map((reading) => ({
      id: reading.relation.id,
      name: reading.relation.name,
      handle: reading.relation.handle || deriveHandle(reading.relation.name, reading.relation.id),
      proximity: deriveCircleProximity(reading),
      status: getCircleNodeStatus(reading),
      archived: reading.relation.archived,
      avatarSeed: reading.relation.avatarSeed,
    })),
    [readings],
  );

  // Graph view members — revealed only (mutual reveal complete)
  const graphMembers = useMemo<MapMember[]>(
    () => readings
      .filter((r) => r.relation.localState.revealSnapshot.status === 'revealed')
      .map((r) => {
        const gatewayPowerBand = deriveGatewayPowerBand(r);
        return {
          id: r.relation.id,
          name: r.relation.name,
          status: getCircleNodeStatus(r),
          avatarSeed: r.relation.avatarSeed,
          proximityBand: deriveProximityBand(r),
          gatewayPowerBand,
          gatewayAccessState: deriveGatewayAccessState(r, gatewayPowerBand),
          linkQualityBand: deriveLinkQualityBand(r),
        };
      }),
    [readings],
  );

  const nonRevealedCount = useMemo(
    () => readings.filter((r) =>
      !r.relation.archived &&
      r.relation.localState.revealSnapshot.status !== 'revealed',
    ).length,
    [readings],
  );

  // Insight bar metrics — derived from revealed-only graphMembers
  const closeCount = useMemo(
    () => graphMembers.filter((m) => m.proximityBand === 'core' || m.proximityBand === 'close').length,
    [graphMembers],
  );
  const gatewayCount = useMemo(
    () => graphMembers.filter((m) => m.gatewayPowerBand !== 'low').length,
    [graphMembers],
  );
  const careCount = useMemo(
    () => graphMembers.filter((m) => m.status === 'revealed_to_nurture' || m.linkQualityBand === 'faint').length,
    [graphMembers],
  );
  const openGatewayMembers = useMemo(
    () => graphMembers.filter((m) => m.gatewayAccessState === 'open'),
    [graphMembers],
  );

  // Compact summary line for World Card header
  const atlasSummary = useMemo(() => {
    const parts: string[] = [];
    if (closeCount > 0) parts.push(`${closeCount} close`);
    if (gatewayCount > 0) parts.push(`${gatewayCount} ${gatewayCount === 1 ? 'gateway' : 'gateways'}`);
    if (careCount > 0) parts.push(`${careCount} care`);
    return parts.join(' · ');
  }, [closeCount, gatewayCount, careCount]);

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
    <View style={styles.screen}>
      {/* Toggle — shared header for both views */}
      <View style={styles.toggleContainer}>
        <Pressable
          onPress={() => handleToggle('list')}
          style={[styles.toggleBtn, viewMode === 'list' && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleBtnLabel, viewMode === 'list' && styles.toggleBtnLabelActive]}>
            List
          </Text>
        </Pressable>
        <Pressable
          onPress={() => handleToggle('map')}
          style={[styles.toggleBtn, viewMode === 'map' && styles.toggleBtnActive]}
        >
          <Text style={[styles.toggleBtnLabel, viewMode === 'map' && styles.toggleBtnLabelActive]}>
            Map
          </Text>
        </Pressable>
      </View>

      {viewMode === 'map' ? (
        <View style={styles.atlasWrap}>

          {/* WORLD CARD — header + canvas + hint, unified object */}
          <View style={styles.worldCard}>
            <View style={styles.worldCardHeader}>
              <Text style={styles.worldCardTitle}>Your world</Text>
              {atlasSummary ? (
                <Text style={styles.worldCardSummary}>{atlasSummary}</Text>
              ) : null}
            </View>

            <EgoGraph
              members={graphMembers}
              me={me}
              size={atlasSize}
              onOverflowTap={handleOverflowTap}
            />

            {nonRevealedCount > 0 && (
              <Text style={styles.worldCardHint}>
                {nonRevealedCount} {nonRevealedCount === 1 ? 'link' : 'links'} still forming
              </Text>
            )}
          </View>

          {/* ACTION RAIL */}
          <View style={styles.actionRail}>
            <Pressable
              style={styles.actionChip}
              onPress={() => {
                if (openGatewayMembers.length === 1) {
                  router.push(`../relation/${openGatewayMembers[0].id}`);
                } else {
                  handleToggle('list');
                }
              }}
            >
              <Text style={styles.actionChipText}>
                {'Open worlds'}
                {openGatewayMembers.length > 0 && (
                  <Text style={styles.actionChipCount}>{` · ${openGatewayMembers.length}`}</Text>
                )}
              </Text>
            </Pressable>
            <Pressable style={styles.actionChip} onPress={() => handleToggle('list')}>
              <Text style={styles.actionChipText}>
                {'Closest'}
                {closeCount > 0 && (
                  <Text style={styles.actionChipCount}>{` · ${closeCount}`}</Text>
                )}
              </Text>
            </Pressable>
            <Pressable style={styles.actionChip} onPress={() => handleToggle('list')}>
              <Text style={styles.actionChipText}>
                {'Nurture'}
                {careCount > 0 && (
                  <Text style={styles.actionChipCount}>{` · ${careCount}`}</Text>
                )}
              </Text>
            </Pressable>
          </View>

        </View>
      ) : (
        <ScrollView style={styles.listScroll} contentContainerStyle={styles.content}>
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
                            {member.handle}
                            {' · '}
                            {member.archived
                              ? 'Archived'
                              : getCircleNodeStatusLabel(member.status)}
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
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const RING = colors.accent.deepTeal;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },

  // Toggle
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: 48,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    backgroundColor: colors.background.primary,
  },
  toggleBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  toggleBtnActive: {
    borderColor: colors.accent.deepTeal,
    backgroundColor: colors.accent.deepTeal + '1A',
  },
  toggleBtnLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  toggleBtnLabelActive: {
    color: colors.accent.deepTeal,
  },

  // List
  listScroll: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.md,
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

  // Atlas wrap — contains World Card + action rail
  atlasWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
    gap: spacing.md,
    alignItems: 'stretch',
  },

  // World Card — unified object: header + canvas + hint
  worldCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    overflow: 'hidden',
  },
  worldCardHeader: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm + 4,
    gap: 3,
  },
  worldCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  worldCardSummary: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  worldCardHint: {
    fontSize: 11,
    color: colors.text.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },

  // Action rail
  actionRail: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionChip: {
    flex: 1,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  actionChipCount: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.primary,
  },
});
