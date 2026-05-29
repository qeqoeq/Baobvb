import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import { getRelationSheetIdentity } from '../../lib/relation-detail-helpers';
import type { Relation } from '../../store/useRelationsStore';
import { useRelationsStore } from '../../store/useRelationsStore';

type GardenFilterKey =
  | 'active' | 'recent' | 'read' | 'unread' | 'toNurture' | 'archived' | 'ready' | 'forming'
  | 'sharedStrong' | 'sharedGood' | 'sharedFragile' | 'sharedNeedsCare'
  | 'attention';

const VALID_FILTER_KEYS: GardenFilterKey[] = [
  'active', 'recent', 'read', 'unread', 'toNurture', 'archived', 'ready', 'forming',
  'sharedStrong', 'sharedGood', 'sharedFragile', 'sharedNeedsCare',
  'attention',
];

type SharedLinkStrengthLabel = 'Strong' | 'Good' | 'Fragile' | 'Needs care';

function normalizeMutualScore(score?: number | null): number | null {
  if (typeof score !== 'number' || Number.isNaN(score)) return null;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function getLinkStrengthLabel(score: number): SharedLinkStrengthLabel {
  if (score >= 85) return 'Strong';
  if (score >= 70) return 'Good';
  if (score >= 50) return 'Fragile';
  return 'Needs care';
}

function getAvatarPersonalColor(name: string): string {
  const palette = [
    colors.accent.warmGold,
    colors.accent.deepTeal,
    colors.accent.leafGreen,
    colors.accent.mutedSage,
    colors.accent.dustyRose,
    colors.accent.softAmber,
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return palette[Math.abs(hash) % palette.length];
}

function getLinkStrengthAccent(score: number): string {
  if (score >= 85) return colors.accent.leafGreen;
  if (score >= 70) return colors.accent.mutedSage;
  if (score >= 50) return colors.accent.warmGold;
  return colors.accent.dustyRose;
}

function getRevealedLinkStrength(
  relation: Pick<Relation, 'localState'>,
): {
  score: number;
  label: SharedLinkStrengthLabel;
  accent: string;
  line: string;
} | null {
  if (relation.localState.revealSnapshot.status !== 'revealed') return null;
  const score = normalizeMutualScore(relation.localState.revealSnapshot.mutualScore);
  if (score === null) return null;

  return {
    score,
    label: getLinkStrengthLabel(score),
    accent: getLinkStrengthAccent(score),
    line: `Shared link · ${score}%`,
  };
}

function labelToBucketFilter(label: SharedLinkStrengthLabel): GardenFilterKey {
  switch (label) {
    case 'Strong':     return 'sharedStrong';
    case 'Good':       return 'sharedGood';
    case 'Fragile':    return 'sharedFragile';
    case 'Needs care': return 'sharedNeedsCare';
  }
}

export default function GardenScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const { activeRelations, archivedRelations, evaluations } = useRelationsStore();
  const [selectedFilter, setSelectedFilter] = useState<GardenFilterKey>('active');

  // Sync incoming filter param from deep-link (e.g. from World hint taps).
  // Also resets to 'active' when params.filter is cleared (tab press via listener in _layout.tsx).
  useEffect(() => {
    if (params.filter && (VALID_FILTER_KEYS as string[]).includes(params.filter)) {
      setSelectedFilter(params.filter as GardenFilterKey);
    } else {
      setSelectedFilter('active');
    }
  }, [params.filter]);

  const entries = useMemo(
    () => getFoundationalReadings(activeRelations, evaluations),
    [activeRelations, evaluations],
  );
  const archivedEntries = useMemo(
    () => getFoundationalReadings(archivedRelations, evaluations),
    [archivedRelations, evaluations],
  );

  const formingCount = useMemo(
    () => entries.filter((entry) => {
      const s = entry.relation.localState.revealSnapshot.status;
      return s !== 'revealed' && s !== 'reveal_ready';
    }).length,
    [entries],
  );

  const readyEntries = useMemo(
    () =>
      [...entries]
        .filter((entry) => entry.relation.localState.revealSnapshot.status === 'reveal_ready')
        .sort((a, b) => b.recentDate.localeCompare(a.recentDate)),
    [entries],
  );
  const readySignalCount = Math.min(readyEntries.length, 5);

  const revealedEntries = useMemo(
    () =>
      [...entries]
        .filter((entry) => entry.relation.localState.revealSnapshot.status === 'revealed')
        // Garden orders by recency — not by score, which would feel punitive.
        .sort((a, b) => b.recentDate.localeCompare(a.recentDate)),
    [entries],
  );
  const revealedScoredEntries = useMemo(
    () => revealedEntries.filter((entry) => getRevealedLinkStrength(entry.relation) !== null),
    [revealedEntries],
  );
  const linkHealthSummary = useMemo(() => {
    const counts: Record<SharedLinkStrengthLabel, number> = {
      Strong: 0,
      Good: 0,
      Fragile: 0,
      'Needs care': 0,
    };

    for (const entry of revealedScoredEntries) {
      const strength = getRevealedLinkStrength(entry.relation);
      if (!strength) continue;
      counts[strength.label] += 1;
    }

    return counts;
  }, [revealedScoredEntries]);

  const needsAttentionEntries = useMemo(
    () =>
      [...entries]
        .filter((entry) => {
          const status = entry.relation.localState.revealSnapshot.status;
          if (status === 'revealed' || status === 'reveal_ready') return false;
          return entry.toNurture || entry.readingStatus === 'Unread' || status === 'waiting_other_side';
        })
        .sort((a, b) => {
          const getPriority = (entry: (typeof entries)[number]) => {
            const status = entry.relation.localState.revealSnapshot.status;
            if (entry.toNurture) return 0;
            if (entry.readingStatus === 'Unread') return 1;
            if (status === 'waiting_other_side') return 2;
            if (status === 'cooking_reveal') return 3;
            return 4;
          };
          const diff = getPriority(a) - getPriority(b);
          if (diff !== 0) return diff;
          return b.recentDate.localeCompare(a.recentDate);
        }),
    [entries],
  );

  const hasOverviewSharedLinks = revealedEntries.length > 0;
  const isOverviewMode = selectedFilter === 'active' || selectedFilter === 'ready';
  const isBucketFilter = selectedFilter === 'sharedStrong' || selectedFilter === 'sharedGood' || selectedFilter === 'sharedFragile' || selectedFilter === 'sharedNeedsCare';
  const isGroupFilter = isBucketFilter || selectedFilter === 'attention';

  const filteredEntries = useMemo(() => {
    const sortedActive = [...entries].sort((a, b) => b.recentDate.localeCompare(a.recentDate));
    const sortedArchived = [...archivedEntries].sort((a, b) => b.recentDate.localeCompare(a.recentDate));

    switch (selectedFilter) {
      case 'recent':
        return sortedActive;
      case 'read':
        return sortedActive.filter((entry) => entry.readingStatus === 'Read');
      case 'unread':
        return sortedActive.filter((entry) => entry.readingStatus === 'Unread');
      case 'toNurture':
        return sortedActive.filter((entry) => entry.toNurture);
      case 'archived':
        return sortedArchived;
      case 'ready':
        return sortedActive.filter((entry) =>
          entry.relation.localState.revealSnapshot.status === 'reveal_ready',
        );
      case 'forming':
        return sortedActive.filter((entry) => {
          const s = entry.relation.localState.revealSnapshot.status;
          return s !== 'revealed' && s !== 'reveal_ready';
        });
      case 'sharedStrong':
        return sortedActive.filter((entry) => getRevealedLinkStrength(entry.relation)?.label === 'Strong');
      case 'sharedGood':
        return sortedActive.filter((entry) => getRevealedLinkStrength(entry.relation)?.label === 'Good');
      case 'sharedFragile':
        return sortedActive.filter((entry) => getRevealedLinkStrength(entry.relation)?.label === 'Fragile');
      case 'sharedNeedsCare':
        return sortedActive.filter((entry) => getRevealedLinkStrength(entry.relation)?.label === 'Needs care');
      case 'attention':
        return needsAttentionEntries;
      case 'active':
      default:
        // Keep Garden calmer by letting the ready signal live in the top capsule.
        return sortedActive.filter((entry) =>
          entry.relation.localState.revealSnapshot.status !== 'reveal_ready',
        ).length > 0
          ? sortedActive.filter((entry) =>
              entry.relation.localState.revealSnapshot.status !== 'reveal_ready',
            )
          : sortedActive;
    }
  }, [entries, archivedEntries, selectedFilter, needsAttentionEntries]);

  const filterLabel = useMemo(() => {
    switch (selectedFilter) {
      case 'recent':          return 'recent';
      case 'read':            return 'read';
      case 'unread':          return 'unread';
      case 'toNurture':       return 'to nurture';
      case 'archived':        return 'archived';
      case 'ready':           return 'ready';
      case 'forming':         return 'forming';
      case 'sharedStrong':    return 'Strong';
      case 'sharedGood':      return 'Good';
      case 'sharedFragile':   return 'Fragile';
      case 'sharedNeedsCare': return 'Needs care';
      case 'attention':       return 'links';
      case 'active':
      default:                return 'relationships';
    }
  }, [selectedFilter]);

  const worldBridgeText = `${formingCount} links`;
  const hasAnyRelationships = entries.length > 0 || archivedEntries.length > 0;
  const isFilterSelected = (key: GardenFilterKey) => selectedFilter === key;

  const sparkPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (readyEntries.length === 0) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(sparkPulse, { toValue: 1, duration: 950, useNativeDriver: true }),
        Animated.timing(sparkPulse, { toValue: 0, duration: 950, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [readyEntries.length, sparkPulse]);

  const sparkScale = sparkPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 2.2] });
  const sparkOpacity = sparkPulse.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0.85, 1, 0.4] });

  // tracking: onReadyCardPress
  const onReadyCardPress = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/reveals');
  };

  const renderRelationCard = (entry: (typeof entries)[number]) => {
    const isRevealed = entry.relation.localState.revealSnapshot.status === 'revealed';
    const revealStatus = entry.relation.localState.revealSnapshot.status;
    const relationIdentity = getRelationSheetIdentity({ relation: entry.relation });
    const unread = entry.readingStatus === 'Unread';
    const sharedLink = getRevealedLinkStrength(entry.relation);
    const avatarColor = getAvatarPersonalColor(entry.relation.name);
    const accent = isRevealed
      ? sharedLink?.accent ?? colors.accent.mutedSage
      : revealStatus === 'reveal_ready'
        ? colors.accent.softAmber
        : revealStatus === 'cooking_reveal'
          ? colors.accent.mutedSage
          : entry.toNurture
            ? colors.accent.softCoral
            : unread
              ? colors.accent.warmGold
              : colors.text.muted;
    const mappingLine = isRevealed
      ? null
      : entry.readingStatus === 'Read'
        ? (
          revealStatus === 'cooking_reveal'
            ? 'Reveal in progress'
            : revealStatus === 'waiting_other_side'
              ? 'Waiting for them'
              : 'Reading saved'
        )
        : 'No reading yet';
    const signalText = isRevealed
      ? (sharedLink?.label ?? 'Revealed')
      : entry.toNurture
        ? 'To nurture'
        : revealStatus === 'reveal_ready'
          ? 'Ready'
          : revealStatus === 'cooking_reveal'
            ? 'Preparing'
            : revealStatus === 'waiting_other_side'
              ? 'Waiting'
              : unread
                ? 'Unread'
                : 'Reading saved';
    const signalStyle = isRevealed
      ? (sharedLink?.label === 'Strong'
        ? styles.mappingSignalStrengthStrong
        : sharedLink?.label === 'Good'
          ? styles.mappingSignalStrengthGood
          : sharedLink?.label === 'Fragile'
            ? styles.mappingSignalStrengthFragile
            : sharedLink?.label === 'Needs care'
              ? styles.mappingSignalStrengthNeedsCare
              : styles.mappingSignalStable)
      : entry.toNurture
        ? styles.mappingSignalNurture
        : revealStatus === 'reveal_ready'
          ? styles.mappingSignalReady
          : revealStatus === 'cooking_reveal'
            ? styles.mappingSignalCooking
            : unread
              ? styles.mappingSignalUnreadPriority
              : styles.mappingSignalWaiting;

    return (
      <Pressable
        key={entry.relation.id}
        onPress={() => router.push(`/relation/${entry.relation.id}`)}
        style={[styles.mappingCard, { borderLeftColor: accent + '66' }]}
      >
        <View style={[styles.mappingAvatar, { backgroundColor: avatarColor + '22', borderColor: avatarColor + '44' }]}>
          <Text style={[styles.mappingInitial, { color: avatarColor }]}>
            {(entry.relation.avatarSeed || entry.relation.name.charAt(0) || '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.mappingBody}>
          <Text style={styles.mappingName}>{relationIdentity.primaryTitle}</Text>
          {entry.relation.handle ? (
            <Text style={styles.mappingMeta}>{entry.relation.handle}</Text>
          ) : null}
          {mappingLine ? (
            <Text style={styles.mappingReadingLine}>{mappingLine}</Text>
          ) : null}
        </View>
        {isRevealed && sharedLink ? (
          <Text style={[styles.mappingScoreValue, { color: sharedLink.accent }]}>
            {sharedLink.score}%
          </Text>
        ) : (
          <Text style={[styles.mappingSignal, signalStyle]}>{signalText}</Text>
        )}
        <Text style={styles.mappingChevron}>›</Text>
      </Pressable>
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <View style={styles.headerBrand}>
            <View style={styles.baobabMark}>
              <View style={styles.baobabCanopy} />
              <View style={styles.baobabTrunk} />
            </View>
            <Text style={styles.headerKicker}>BAOBAB</Text>
          </View>
          <Text style={styles.headerTitle}>Garden</Text>
        </View>
      </View>

      {isOverviewMode ? (
        <>
          {/* ── Reveal card ──────────────────────────────────────────────────────── */}
          {readyEntries.length > 0 ? (
            <View style={styles.readyMomentsSection}>
              <Pressable onPress={onReadyCardPress} style={styles.readyClusterCard}>
                <View style={styles.readyClusterTopRow}>
                  <View style={styles.readyClusterCountRow}>
                    <Text style={styles.readyClusterCount}>{readyEntries.length}</Text>
                    <Text style={styles.readyClusterConcept}>Reveals</Text>
                  </View>
                  <View style={styles.readyClusterCTA}>
                    <Text style={styles.readyClusterCTAText}>Open</Text>
                    <Text style={styles.readyClusterCTAChevron}>›</Text>
                  </View>
                </View>

                <View style={styles.readySignalField}>
                  {Array.from({ length: readySignalCount }).map((_, index) => (
                    <View
                      key={`ready-orb-${index}`}
                      style={[
                        styles.readySignalOrb,
                        index === 0 ? styles.readySignalOrbPrimary : null,
                        index === 1 ? styles.readySignalOrbSecondary : null,
                        index === 2 ? styles.readySignalOrbTertiary : null,
                        index === 3 ? styles.readySignalOrbQuaternary : null,
                        index === 4 ? styles.readySignalOrbQuinary : null,
                      ]}
                    />
                  ))}
                  <Animated.View
                    style={[
                      styles.readySignalSpark,
                      { transform: [{ scale: sparkScale }], opacity: sparkOpacity },
                    ]}
                  />
                </View>
              </Pressable>
            </View>
          ) : null}

          {/* ── Map bridge ───────────────────────────────────────────────────────── */}
          <Pressable
            onPress={() => router.push('/(tabs)')}
            style={styles.worldBridgeCard}
          >
            <View style={styles.worldBridgeLead}>
              <Text style={styles.worldBridgeEyebrow}>Map</Text>
              {formingCount > 0 ? (
                <Text style={styles.worldBridgeDetail}>{worldBridgeText}</Text>
              ) : null}
            </View>
            <View style={styles.worldBridgeFooter}>
              <Text style={styles.worldBridgeCTA}>Open</Text>
              <Text style={styles.worldBridgeChevron}>›</Text>
            </View>
          </Pressable>

          {/* ── Health bar ───────────────────────────────────────────────────────── */}
          {hasAnyRelationships ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Health</Text>
                <View style={styles.sectionLine} />
              </View>

              {hasOverviewSharedLinks ? (
                revealedScoredEntries.length > 0 ? (
                  <View style={styles.healthSummaryCompact}>
                    <View style={[styles.healthBar, { height: 7 }]}>
                      {(['Strong', 'Good', 'Fragile', 'Needs care'] as SharedLinkStrengthLabel[]).map((label) => {
                        const count = linkHealthSummary[label];
                        if (count === 0) return null;
                        const segColor = label === 'Strong'
                          ? colors.accent.leafGreen
                          : label === 'Good'
                            ? colors.accent.mutedSage
                            : label === 'Fragile'
                              ? colors.accent.warmGold
                              : colors.accent.softCoral;
                        return (
                          <View
                            key={label}
                            style={[styles.healthBarSegment, { flex: count, backgroundColor: segColor + '88' }]}
                          />
                        );
                      })}
                    </View>
                  </View>
                ) : (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyText}>
                      Link strength will appear here when shared reveal data is available.
                    </Text>
                  </View>
                )
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Shared links will appear here</Text>
                  <Text style={styles.emptyText}>
                    After a mutual reveal opens, this garden starts showing link strength.
                  </Text>
                </View>
              )}
            </View>
          ) : null}

          {/* ── Shared links buckets ─────────────────────────────────────────────── */}
          {hasOverviewSharedLinks ? (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>Shared links</Text>
                <View style={styles.sectionLine} />
              </View>
              <View style={styles.bucketGrid}>
                {(['Strong', 'Good', 'Fragile', 'Needs care'] as SharedLinkStrengthLabel[]).map((label) => {
                  const count = linkHealthSummary[label];
                  const dotColor = label === 'Strong'
                    ? colors.accent.leafGreen
                    : label === 'Good'
                      ? colors.accent.mutedSage
                      : label === 'Fragile'
                        ? colors.accent.warmGold
                        : colors.accent.dustyRose;
                  return (
                    <Pressable
                      key={label}
                      style={[styles.bucketDoor, count === 0 && styles.bucketDoorEmpty]}
                      onPress={() => { if (count > 0) setSelectedFilter(labelToBucketFilter(label)); }}
                    >
                      <View style={[styles.bucketDot, { backgroundColor: dotColor + (count > 0 ? '88' : '33') }]} />
                      <Text style={[styles.bucketDoorLabel, count === 0 && styles.bucketDoorLabelEmpty]}>{label}</Text>
                      {count > 0 ? <Text style={styles.bucketChevron}>›</Text> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}

          {/* ── Attention door ───────────────────────────────────────────────────── */}
          {needsAttentionEntries.length > 0 ? (
            <Pressable onPress={() => setSelectedFilter('attention')} style={styles.attentionCard}>
              <View style={styles.attentionCardLead}>
                <Text style={styles.attentionCardEyebrow}>Attention</Text>
                <Text style={styles.attentionCardBody}>Links that need action</Text>
              </View>
              <View style={styles.attentionCardCTA}>
                <Text style={styles.attentionCardCTAText}>Open</Text>
                <Text style={styles.attentionCardChevron}>›</Text>
              </View>
            </Pressable>
          ) : null}

          {/* ── Recent ──────────────────────────────────────────────────────────── */}
          {hasAnyRelationships ? (
            <View style={styles.secondaryFilterRow}>
              <Pressable
                onPress={() => setSelectedFilter('recent')}
                style={[styles.secondaryFilterChip, isFilterSelected('recent') && styles.secondaryFilterChipActive]}
              >
                <Text style={styles.secondaryFilterText}>Recent</Text>
              </Pressable>
            </View>
          ) : null}

          {!hasAnyRelationships ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No relationships yet</Text>
              <Text style={styles.emptyText}>
                Start with someone you trust.
              </Text>
              <Pressable onPress={() => router.push('/relation/add')} style={styles.emptyAction}>
                <Text style={styles.emptyActionText}>Add someone</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ── Archived link ────────────────────────────────────────────────────── */}
          {hasAnyRelationships ? (
            <Pressable onPress={() => setSelectedFilter('archived')} style={styles.archivedLink}>
              <Text style={styles.archivedLinkText}>Archived</Text>
            </Pressable>
          ) : null}
        </>
      ) : (
        <>
          <View style={styles.filterSection}>
            <View style={styles.filterBackRow}>
              <Pressable
                onPress={() => setSelectedFilter('active')}
                style={styles.filterBackButton}
              >
                <Text style={styles.filterBackText}>‹ Garden</Text>
              </Pressable>
            </View>
            {!isGroupFilter ? (
              <View style={styles.secondaryFilterRow}>
                <Pressable
                  onPress={() => setSelectedFilter('recent')}
                  style={[styles.secondaryFilterChip, isFilterSelected('recent') && styles.secondaryFilterChipActive]}
                >
                  <Text style={styles.secondaryFilterText}>Recent</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSelectedFilter('toNurture')}
                  style={[styles.secondaryFilterChip, isFilterSelected('toNurture') && styles.secondaryFilterChipActive]}
                >
                  <Text style={styles.secondaryFilterText}>To nurture</Text>
                </Pressable>
                <Pressable
                  onPress={() => setSelectedFilter('archived')}
                  style={[styles.secondaryFilterChip, isFilterSelected('archived') && styles.secondaryFilterChipActive]}
                >
                  <Text style={styles.secondaryFilterText}>Archived</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>
                {selectedFilter === 'attention'
                  ? 'Attention'
                  : selectedFilter === 'archived'
                    ? 'Archived'
                    : selectedFilter === 'recent'
                      ? 'Recent'
                      : selectedFilter === 'sharedStrong'
                        ? 'Strong'
                        : selectedFilter === 'sharedGood'
                          ? 'Good'
                          : selectedFilter === 'sharedFragile'
                            ? 'Fragile'
                            : selectedFilter === 'sharedNeedsCare'
                              ? 'Needs care'
                              : 'Nurture'}
              </Text>
              <View style={styles.sectionLine} />
              {filteredEntries.length > 0 ? (
                <Text style={styles.sectionSupportText}>{filteredEntries.length} {filterLabel.toLowerCase()}</Text>
              ) : null}
            </View>

            {filteredEntries.length === 0 ? (
              <View style={styles.emptyCard}>
                {entries.length === 0 ? (
                  <>
                    <Text style={styles.emptyTitle}>No relationships yet</Text>
                    <Text style={styles.emptyText}>
                      Start with someone you trust.
                    </Text>
                    <Pressable onPress={() => router.push('/relation/add')} style={styles.emptyAction}>
                      <Text style={styles.emptyActionText}>Add someone</Text>
                    </Pressable>
                  </>
                ) : selectedFilter === 'archived' ? (
                  <Text style={styles.emptyText}>No archived relationships.</Text>
                ) : (
                  <Text style={styles.emptyText}>Nothing here. Try a different view.</Text>
                )}
              </View>
            ) : (
              <View style={styles.mappingList}>
                {filteredEntries.map((entry) => renderRelationCard(entry))}
              </View>
            )}
          </View>
        </>
      )}


    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },

  // ── Header ─────────────────────────────────────────────────────────────────

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingBottom: spacing.md,
  },
  headerTitleBlock: {
    gap: 1,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  baobabMark: {
    width: 20,
    alignItems: 'center',
    gap: 2,
  },
  baobabCanopy: {
    width: 18,
    height: 13,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: colors.accent.leafGreen + '99',
    backgroundColor: colors.accent.leafGreen + '28',
  },
  baobabTrunk: {
    width: 4,
    height: 7,
    borderRadius: 2,
    backgroundColor: colors.accent.leafGreen + '88',
  },
  headerKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.3,
  },

  // ── Filter chips ────────────────────────────────────────────────────────────

  filterSection: {
    gap: 6,
  },
  filterBackRow: {
    marginBottom: spacing.xs,
  },
  filterBackButton: {
    alignSelf: 'flex-start',
  },
  filterBackText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent.mutedSage,
  },
  secondaryFilterRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  secondaryFilterChip: {
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  secondaryFilterChipActive: {
    borderColor: colors.accent.mutedSage + '88',
    backgroundColor: colors.accent.mutedSage + '12',
  },
  secondaryFilterText: {
    fontSize: 10,
    color: colors.text.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── Reveal card ─────────────────────────────────────────────────────────────

  readyMomentsSection: {
    gap: 4,
  },
  readyClusterCard: {
    backgroundColor: colors.accent.warmGold + '12',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '44',
    padding: spacing.sm + 2,
    gap: spacing.sm,
    shadowColor: colors.accent.warmGold,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  readyClusterTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  readyClusterCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  readyClusterCount: {
    fontSize: 36,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -1,
  },
  readyClusterConcept: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent.softAmber,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  readyClusterCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.accent.softAmber + '1F',
    borderWidth: 1,
    borderColor: colors.accent.softAmber + '2F',
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  readyClusterCTAText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent.softAmber,
    letterSpacing: 0.2,
  },
  readyClusterCTAChevron: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent.softAmber,
  },
  readySignalField: {
    height: 72,
    position: 'relative',
  },
  readySignalOrb: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: colors.accent.warmGold + '30',
    shadowColor: colors.accent.warmGold,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  readySignalOrbPrimary: {
    width: 42,
    height: 42,
    left: 2,
    top: 16,
    backgroundColor: colors.accent.softAmber + '44',
  },
  readySignalOrbSecondary: {
    width: 30,
    height: 30,
    left: 36,
    top: 4,
    backgroundColor: colors.accent.warmGold + '3A',
  },
  readySignalOrbTertiary: {
    width: 26,
    height: 26,
    left: 54,
    top: 34,
    backgroundColor: colors.accent.softAmber + '36',
  },
  readySignalOrbQuaternary: {
    width: 34,
    height: 34,
    left: 76,
    top: 14,
    backgroundColor: colors.accent.warmGold + '28',
  },
  readySignalOrbQuinary: {
    width: 18,
    height: 18,
    left: 104,
    top: 38,
    backgroundColor: colors.accent.softAmber + '46',
  },
  readySignalSpark: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    right: 18,
    top: 6,
    backgroundColor: colors.accent.softAmber,
    shadowColor: colors.accent.softAmber,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },

  // ── Health ──────────────────────────────────────────────────────────────────

  healthSummaryCompact: {
    gap: spacing.xs,
  },
  healthBar: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    overflow: 'hidden',
    height: 5,
  },
  healthBarSegment: {
    height: 5,
  },

  // ── Map bridge ──────────────────────────────────────────────────────────────

  worldBridgeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  worldBridgeLead: {
    flex: 1,
    gap: 3,
  },
  worldBridgeEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.accent.mutedSage,
  },
  worldBridgeDetail: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 1,
  },
  worldBridgeFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  worldBridgeCTA: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.mutedSage,
    letterSpacing: 0.2,
  },
  worldBridgeChevron: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent.mutedSage,
  },

  // ── Attention door ──────────────────────────────────────────────────────────

  attentionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.softCoral + '33',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  attentionCardLead: {
    flex: 1,
    gap: 3,
  },
  attentionCardEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.accent.softCoral,
  },
  attentionCardBody: {
    fontSize: 12,
    color: colors.text.muted,
    marginTop: 1,
  },
  attentionCardCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  attentionCardCTAText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.mutedSage,
    letterSpacing: 0.2,
  },
  attentionCardChevron: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent.mutedSage,
  },

  // ── Section ─────────────────────────────────────────────────────────────────

  section: {
    gap: spacing.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.text.muted,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },
  sectionSupportText: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
  },

  // ── Empty state ─────────────────────────────────────────────────────────────

  emptyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  emptyAction: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '55',
    backgroundColor: colors.accent.warmGold + '14',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  emptyActionText: {
    fontSize: 12,
    color: colors.accent.warmGold,
    fontWeight: '700',
  },

  // ── Relationship list ───────────────────────────────────────────────────────

  mappingList: {
    gap: spacing.sm,
  },
  mappingCard: {
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
  mappingAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mappingInitial: {
    fontSize: 15,
    fontWeight: '700',
  },
  mappingBody: {
    flex: 1,
    gap: 3,
  },
  mappingName: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '600',
  },
  mappingMeta: {
    fontSize: 11,
    color: colors.text.muted,
  },
  mappingReadingLine: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  mappingSignal: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  mappingSignalUnreadPriority: {
    color: colors.accent.warmGold,
  },
  mappingSignalWaiting: {
    color: colors.text.muted,
  },
  mappingSignalCooking: {
    color: colors.accent.mutedSage,
  },
  mappingSignalReady: {
    color: colors.accent.softAmber,
  },
  mappingSignalNurture: {
    color: colors.accent.dustyRose,
  },
  mappingSignalStable: {
    color: colors.accent.mutedSage,
  },
  mappingSignalStrengthStrong: {
    color: colors.accent.leafGreen,
  },
  mappingSignalStrengthGood: {
    color: colors.accent.mutedSage,
  },
  mappingSignalStrengthFragile: {
    color: colors.accent.warmGold,
  },
  mappingSignalStrengthNeedsCare: {
    color: colors.accent.dustyRose,
  },
  mappingScoreValue: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  mappingChevron: {
    fontSize: 18,
    color: colors.text.muted,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },

  // ── Bucket doors ────────────────────────────────────────────────────────────

  bucketGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  bucketDoor: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bucketDoorEmpty: {
    opacity: 0.4,
  },
  bucketDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  bucketDoorLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  bucketDoorLabelEmpty: {
    color: colors.text.muted,
  },
  bucketChevron: {
    fontSize: 16,
    color: colors.text.muted,
    fontWeight: '500',
  },

  // ── Archived link ───────────────────────────────────────────────────────────

  archivedLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  archivedLinkText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
  },
});
