import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getTierAccent } from '../../lib/evaluation';
import { getFoundationalReadings, getGardenMicroSignal } from '../../lib/foundational-reading';
import { useRelationsStore } from '../../store/useRelationsStore';

type GardenFilterKey = 'active' | 'read' | 'unread' | 'toNurture' | 'archived';

export default function GardenScreen() {
  const { me, activeRelations, archivedRelations, evaluations, resetDevState } = useRelationsStore();
  const [selectedFilter, setSelectedFilter] = useState<GardenFilterKey>('active');

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
      case 'active':
      default:
        return sortedActive;
    }
  }, [entries, archivedEntries, selectedFilter]);

  const filterLabel = useMemo(() => {
    switch (selectedFilter) {
      case 'read':
        return 'Read';
      case 'unread':
        return 'Unread';
      case 'toNurture':
        return 'To nurture';
      case 'archived':
        return 'Archived';
      case 'active':
      default:
        return 'Active';
    }
  }, [selectedFilter]);

  const trustStatus = useMemo(() => {
    if (me.trustPassportStatus === 'new') return 'Not yet mapped';
    if (me.trustPassportStatus === 'steady') return 'Trust well rooted';
    return toNurtureCount > 0 ? 'Trust in motion' : 'Trust growing';
  }, [me.trustPassportStatus, toNurtureCount]);

  const openScan = () => {
    router.push('../me/scan');
  };

  const shareMyCard = async () => {
    try {
      await Share.share({
        title: 'My Baobab card',
        message: `Connect with ${me.displayName} on Baobab (${me.handle}).`,
      });
    } catch {
      Alert.alert('Share my card', 'Sharing is not available on this device.');
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.passportCard}>
        <View style={styles.heroTopRow}>
          <View style={styles.brandSignature}>
            <View style={styles.brandMark}>
              <View style={styles.brandMarkCrown} />
              <View style={styles.brandMarkLeafLeft} />
              <View style={styles.brandMarkLeafRight} />
              <View style={styles.brandMarkTrunk} />
            </View>
            <Text style={styles.brandWordmark}>BAOBAB</Text>
          </View>
          <View style={[styles.trustBadge, styles.trustBadgeTop]}>
            <View style={styles.trustDot} />
            <Text style={styles.trustBadgeText}>{trustStatus}</Text>
          </View>
        </View>

        <Text style={styles.heroTagline}>
          Know who you can trust through people you already trust.
        </Text>

        <View style={styles.profileRow}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Text style={styles.avatarText}>
                  {(me.avatarSeed || me.displayName.charAt(0) || '?').toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.passportTextBlock}>
            <Text style={styles.passportName}>{me.displayName}</Text>
            <Text style={styles.passportHandle}>{me.handle}</Text>
          </View>
        </View>

        <Pressable
          onPress={openScan}
          style={[styles.heroActionButton, styles.heroActionPrimary]}
        >
          <Text style={styles.heroActionPrimaryText}>Scan a person</Text>
        </Pressable>

        <View style={styles.heroSecondaryActionsRow}>
          <Pressable
            onPress={() => void shareMyCard()}
            style={styles.heroActionButton}
          >
            <Text style={styles.heroActionText}>Share my card</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('../relation/add')}
            style={styles.heroActionButton}
          >
            <Text style={styles.heroActionText}>Add manually</Text>
          </Pressable>
        </View>

        <Pressable onPress={() => router.push('../me/edit')} style={styles.editCardButton}>
          <Text style={styles.editCardButtonText}>Edit my card</Text>
        </Pressable>
      </View>

      <View style={styles.framingCard}>
        <Text style={styles.framingText}>
          Add the people you already trust, starting with those you would actually turn to first.
        </Text>
        <Text style={styles.framingHint}>
          When it matters, whose judgment would you trust first?
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>
            {entries.length === 0
              ? 'Your trust network'
              : selectedFilter === 'archived'
                ? 'Archived'
                : 'Trusted people'}
          </Text>
          <View style={styles.sectionLine} />
        </View>

        {filteredEntries.length === 0 ? (
          <View style={styles.emptyCard}>
            {entries.length === 0 ? (
              <>
                <Text style={styles.emptyTitle}>Your trust network is empty</Text>
                <Text style={styles.emptyText}>
                  Add people you trust to start building context around your network.
                </Text>
                <Pressable onPress={() => router.push('../relation/add')} style={styles.emptyAction}>
                  <Text style={styles.emptyActionText}>Add a person</Text>
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
                ? (isRevealed
                  ? `${entry.badgeLabel} · Score ${entry.foundationalScore}`
                  : 'Private reading saved')
                : 'Unread · Start private reading';
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
                  onPress={() => router.push(`../relation/${entry.relation.id}`)}
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
                  <Text
                    style={[
                      styles.mappingSignal,
                      signalStyle,
                    ]}
                  >
                    {signalText}
                  </Text>
                  <Text style={styles.mappingChevron}>›</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        {filteredEntries.length > 0 ? (
          <Text style={styles.sectionSupportText}>
            Showing {filteredEntries.length} {filterLabel.toLowerCase()} {filteredEntries.length === 1 ? 'contact' : 'contacts'}.
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Network overview</Text>
          <View style={styles.sectionLine} />
        </View>
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
            onPress={() => setSelectedFilter('archived')}
            style={[styles.pulseChip, selectedFilter === 'archived' && styles.pulseChipActive]}
          >
            <Text style={styles.pulseChipValue}>{archivedRelations.length}</Text>
            <Text style={styles.pulseChipLabel}>Archived</Text>
          </Pressable>
        </View>

        {archivedRelations.length > 0 && (
          <Pressable onPress={() => router.push('../relation/archived')} style={styles.archivedRow}>
            <Text style={styles.archivedRowText}>Open archived relationships</Text>
          </Pressable>
        )}
        <Text style={styles.pulseSupportText}>
          Tap a chip to filter your network.
        </Text>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Baobab — local-first, private by design.</Text>
        {__DEV__ ? (
          <Pressable onPress={resetDevState} style={styles.devResetButton}>
            <Text style={styles.devResetButtonText}>Reset local dev state</Text>
          </Pressable>
        ) : null}
      </View>
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
    paddingTop: 44,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },

  section: {
    gap: spacing.sm,
  },
  sectionSupportText: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
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

  passportCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.strong,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandSignature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs + 2,
  },
  brandMark: {
    width: 20,
    height: 20,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkCrown: {
    position: 'absolute',
    top: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.warmGold,
  },
  brandMarkLeafLeft: {
    position: 'absolute',
    top: 5,
    left: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.deepTeal + 'BB',
  },
  brandMarkLeafRight: {
    position: 'absolute',
    top: 5,
    right: 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.mutedSage + 'BB',
  },
  brandMarkTrunk: {
    position: 'absolute',
    bottom: 1,
    width: 3,
    height: 8,
    borderRadius: 2,
    backgroundColor: colors.text.muted,
  },
  brandWordmark: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.text.muted,
    fontWeight: '700',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarWrap: {
    padding: 1,
  },
  avatarRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1.5,
    borderColor: colors.accent.softAmber + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  avatarText: {
    fontSize: 24,
    color: colors.text.primary,
    fontWeight: '700',
  },
  passportTextBlock: {
    flex: 1,
    gap: 3,
  },
  passportName: {
    fontSize: 24,
    lineHeight: 28,
    color: colors.text.primary,
    fontWeight: '700',
  },
  passportHandle: {
    fontSize: 14,
    color: colors.accent.warmGold,
    fontWeight: '600',
  },
  trustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trustBadgeTop: {
    alignSelf: 'auto',
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
  heroTagline: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
    fontWeight: '500',
  },
  heroActionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroSecondaryActionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroActionButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  heroActionPrimary: {
    borderColor: colors.accent.deepTeal,
    backgroundColor: colors.accent.deepTeal,
  },
  heroActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  heroActionPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  editCardButton: {
    alignSelf: 'flex-start',
    paddingTop: spacing.xs,
  },
  editCardButtonText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

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
  mappingCTA: {
    fontSize: 12,
    color: colors.accent.warmGold,
    fontWeight: '700',
  },
  mappingChevron: {
    fontSize: 18,
    color: colors.text.muted,
    fontWeight: '500',
    marginLeft: spacing.xs,
  },

  pulseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
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
  pulseCard: {
    width: '48.5%',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  pulseCardWide: {
    width: '100%',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  pulseValue: {
    fontSize: 26,
    color: colors.text.primary,
    fontWeight: '700',
  },
  pulseLabel: {
    fontSize: 11,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '600',
  },

  framingCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  framingText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  framingHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.muted,
    marginTop: spacing.xs,
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

  archivedRow: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  archivedRowText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  pulseSupportText: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
  },

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
