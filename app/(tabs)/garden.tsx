import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getTierAccent } from '../../lib/evaluation';
import { getFoundationalReadings, getGardenMicroSignal } from '../../lib/foundational-reading';
import { useRelationsStore } from '../../store/useRelationsStore';

type GardenFilterKey = 'active' | 'read' | 'unread' | 'toNurture' | 'archived' | 'ready' | 'forming';

const VALID_FILTER_KEYS: GardenFilterKey[] = ['active', 'read', 'unread', 'toNurture', 'archived', 'ready', 'forming'];

export default function GardenScreen() {
  const params = useLocalSearchParams<{ filter?: string }>();
  const { activeRelations, archivedRelations, evaluations, resetDevState } = useRelationsStore();
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

  const readCount = useMemo(
    () => entries.filter((entry) => entry.readingStatus === 'Read').length,
    [entries],
  );
  const unreadCount = useMemo(
    () => entries.filter((entry) => entry.readingStatus === 'Unread').length,
    [entries],
  );
  const toNurtureCount = useMemo(
    () => entries.filter((entry) => entry.toNurture).length,
    [entries],
  );

  const readyCount = useMemo(
    () => entries.filter((entry) =>
      entry.relation.localState.revealSnapshot.status === 'reveal_ready',
    ).length,
    [entries],
  );

  const formingCount = useMemo(
    () => entries.filter((entry) => {
      const s = entry.relation.localState.revealSnapshot.status;
      return s !== 'revealed' && s !== 'reveal_ready';
    }).length,
    [entries],
  );

  const filteredEntries = useMemo(() => {
    const sortedActive = [...entries].sort((a, b) => b.recentDate.localeCompare(a.recentDate));
    const sortedArchived = [...archivedEntries].sort((a, b) => b.recentDate.localeCompare(a.recentDate));

    switch (selectedFilter) {
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
      case 'active':
      default:
        // reveal_ready floats to the top — highest urgency signal
        return [...sortedActive].sort((a, b) => {
          const pa = a.relation.localState.revealSnapshot.status === 'reveal_ready' ? 0 : 1;
          const pb = b.relation.localState.revealSnapshot.status === 'reveal_ready' ? 0 : 1;
          return pa - pb;
        });
    }
  }, [entries, archivedEntries, selectedFilter]);

  const filterLabel = useMemo(() => {
    switch (selectedFilter) {
      case 'read':        return 'read';
      case 'unread':      return 'unread';
      case 'toNurture':   return 'to nurture';
      case 'archived':    return 'archived';
      case 'ready':       return 'ready';
      case 'forming':     return 'forming';
      case 'active':
      default:            return 'relationships';
    }
  }, [selectedFilter]);

  const trustStatus = useMemo(() => {
    if (entries.length === 0) return 'Not yet mapped';
    return toNurtureCount > 0 ? 'Trust in motion' : 'Trust growing';
  }, [entries.length, toNurtureCount]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* ── Header ─────────────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerKicker}>{'BAOBAB'}</Text>
          <Text style={styles.headerTitle}>Garden</Text>
        </View>
        <View style={styles.trustBadge}>
          <View style={styles.trustDot} />
          <Text style={styles.trustBadgeText}>{trustStatus}</Text>
        </View>
      </View>

      {/* ── Filter chips ───────────────────────────────────────────────────────── */}
      <View style={styles.pulseRow}>
        <Pressable
          onPress={() => setSelectedFilter('active')}
          style={[styles.pulseChip, selectedFilter === 'active' && styles.pulseChipActive]}
        >
          <Text style={styles.pulseChipValue}>{activeRelations.length}</Text>
          <Text style={styles.pulseChipLabel}>Active</Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('read')}
          style={[styles.pulseChip, selectedFilter === 'read' && styles.pulseChipActive]}
        >
          <Text style={styles.pulseChipValue}>{readCount}</Text>
          <Text style={styles.pulseChipLabel}>Read</Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('unread')}
          style={[styles.pulseChip, selectedFilter === 'unread' && styles.pulseChipActive]}
        >
          <Text style={styles.pulseChipValue}>{unreadCount}</Text>
          <Text style={styles.pulseChipLabel}>Unread</Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('toNurture')}
          style={[styles.pulseChip, selectedFilter === 'toNurture' && styles.pulseChipActive]}
        >
          <Text style={styles.pulseChipValue}>{toNurtureCount}</Text>
          <Text style={styles.pulseChipLabel}>To nurture</Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('ready')}
          style={[styles.pulseChip, selectedFilter === 'ready' && styles.pulseChipActive]}
        >
          <Text style={styles.pulseChipValue}>{readyCount}</Text>
          <Text style={styles.pulseChipLabel}>Ready</Text>
        </Pressable>
        <Pressable
          onPress={() => setSelectedFilter('forming')}
          style={[styles.pulseChip, selectedFilter === 'forming' && styles.pulseChipActive]}
        >
          <Text style={styles.pulseChipValue}>{formingCount}</Text>
          <Text style={styles.pulseChipLabel}>Forming</Text>
        </Pressable>
      </View>

      {/* ── Relationship list ──────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            {selectedFilter === 'archived'
              ? 'Archived'
              : selectedFilter === 'ready'
                ? 'Ready'
                : selectedFilter === 'forming'
                  ? 'Forming'
                  : selectedFilter === 'unread'
                    ? 'Unread'
                    : selectedFilter === 'read'
                      ? 'Read'
                      : selectedFilter === 'toNurture'
                        ? 'Nurture'
                        : 'Relationships'}
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
              <Text style={styles.emptyText}>Nothing here. Try a different filter.</Text>
            )}
          </View>
        ) : (
          <View style={styles.mappingList}>
            {filteredEntries.map((entry) => {
              const isRevealed = entry.relation.localState.revealSnapshot.status === 'revealed';
              const revealStatus = entry.relation.localState.revealSnapshot.status;
              const signal = isRevealed ? getGardenMicroSignal(entry) : null;
              const unread = entry.readingStatus === 'Unread';
              const accent = isRevealed
                ? (entry.linkTier ? getTierAccent(entry.linkTier) : colors.accent.mutedSage)
                : revealStatus === 'reveal_ready'
                  ? colors.accent.deepTeal
                  : revealStatus === 'cooking_reveal'
                    ? colors.accent.mutedSage
                    : unread
                      ? colors.accent.warmGold
                      : colors.text.muted;
              const mappingLine = entry.readingStatus === 'Read'
                ? (isRevealed ? entry.badgeLabel : 'Private reading saved')
                : 'No reading yet';
              const signalText = isRevealed
                ? signal?.text ?? 'Stable'
                : (
                  revealStatus === 'reveal_ready'
                    ? 'Ready'
                    : revealStatus === 'cooking_reveal'
                      ? 'Preparing'
                      : entry.readingStatus === 'Read'
                        ? 'Waiting'
                        : 'Unread'
                );
              const signalStyle = isRevealed
                ? (signal?.tone === 'nurture'
                  ? styles.mappingSignalNurture
                  : signal?.tone === 'stable'
                    ? styles.mappingSignalStable
                    : styles.mappingSignalUnread)
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
                  <View style={[styles.mappingAvatar, { backgroundColor: accent + '16' }]}>
                    <Text style={[styles.mappingInitial, { color: accent }]}>
                      {(entry.relation.avatarSeed || entry.relation.name.charAt(0) || '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.mappingBody}>
                    <Text style={styles.mappingName}>{entry.relation.name}</Text>
                    {entry.relation.handle ? (
                      <Text style={styles.mappingMeta}>{entry.relation.handle}</Text>
                    ) : null}
                    <Text style={styles.mappingReadingLine}>
                      {mappingLine}
                    </Text>
                  </View>
                  <Text style={[styles.mappingSignal, signalStyle]}>
                    {signalText}
                  </Text>
                  <Text style={styles.mappingChevron}>›</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      {__DEV__ ? (
        <View style={styles.footer}>
          <Pressable onPress={resetDevState} style={styles.devResetButton}>
            <Text style={styles.devResetButtonText}>Reset local dev state</Text>
          </Pressable>
        </View>
      ) : null}

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
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.mutedSage,
  },
  trustBadgeText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // ── Filter chips ────────────────────────────────────────────────────────────

  pulseRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  pulseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  pulseChipActive: {
    borderColor: colors.accent.deepTeal + '99',
    backgroundColor: colors.accent.deepTeal + '14',
  },
  pulseChipValue: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '700',
  },
  pulseChipLabel: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  mappingInitial: {
    fontSize: 14,
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
  mappingSignalUnread: {
    color: colors.text.muted,
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
    color: colors.accent.deepTeal,
  },
  mappingSignalNurture: {
    color: colors.accent.softCoral,
  },
  mappingSignalStable: {
    color: colors.accent.mutedSage,
  },
  mappingChevron: {
    fontSize: 18,
    color: colors.text.muted,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },

  // ── Footer ──────────────────────────────────────────────────────────────────

  footer: {
    alignItems: 'center',
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  footerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  devResetButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  devResetButtonText: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '600',
  },
});
