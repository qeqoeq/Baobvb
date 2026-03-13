import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getTierAccent } from '../../lib/evaluation';
import { getFoundationalReadings, getGardenMicroSignal } from '../../lib/foundational-reading';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function GardenScreen() {
  const { me, activeRelations, archivedRelations, evaluations } = useRelationsStore();

  const entries = useMemo(
    () => getFoundationalReadings(activeRelations, evaluations),
    [activeRelations, evaluations],
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

  const continueMapping = useMemo(
    () => [...entries].sort((a, b) => b.recentDate.localeCompare(a.recentDate)).slice(0, 4),
    [entries],
  );

  const trustStatus = useMemo(() => {
    if (me.trustPassportStatus === 'new') return 'Passport not mapped yet';
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
        <View style={styles.brandSignature}>
          <View style={styles.brandMark}>
            <View style={styles.brandMarkCrown} />
            <View style={styles.brandMarkLeafLeft} />
            <View style={styles.brandMarkLeafRight} />
            <View style={styles.brandMarkTrunk} />
          </View>
          <Text style={styles.brandWordmark}>BAOBAB</Text>
        </View>
        <View style={styles.passportTopRow}>
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
            <View style={styles.trustBadge}>
              <View style={styles.trustDot} />
              <Text style={styles.trustBadgeText}>{trustStatus}</Text>
            </View>
          </View>
        </View>
        <View style={styles.heroActionsRow}>
          <Pressable
            onPress={() => void shareMyCard()}
            style={[styles.heroActionButton, styles.heroActionPrimary]}
          >
            <Text style={styles.heroActionPrimaryText}>Share my card</Text>
          </Pressable>
          <Pressable
            onPress={openScan}
            style={styles.heroActionButton}
          >
            <Text style={styles.heroActionText}>Scan a person</Text>
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

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Continue mapping</Text>
          <View style={styles.sectionLine} />
        </View>

        {continueMapping.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No people mapped yet</Text>
            <Text style={styles.emptyText}>
              Add your first person to start building your trust garden.
            </Text>
            <Pressable onPress={() => router.push('../relation/add')} style={styles.emptyAction}>
              <Text style={styles.emptyActionText}>Add a person</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.mappingList}>
            {continueMapping.map((entry) => {
              const accent = entry.linkTier
                ? getTierAccent(entry.linkTier)
                : colors.accent.warmGold;
              const signal = getGardenMicroSignal(entry);

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
                    <Text style={styles.mappingMeta}>
                      {entry.relation.handle
                        ? `${entry.relation.handle} · `
                        : ''}
                      {entry.readingStatus === 'Read'
                        ? `${entry.badgeLabel} · ${entry.foundationalScore}`
                        : 'Unread'}
                    </Text>
                    <Text
                      style={[
                        styles.mappingSignal,
                        signal.tone === 'nurture'
                          ? styles.mappingSignalNurture
                          : signal.tone === 'stable'
                            ? styles.mappingSignalStable
                            : styles.mappingSignalUnread,
                      ]}
                    >
                      {signal.text}
                    </Text>
                  </View>
                  <Text style={styles.mappingCTA}>Open link</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Garden pulse</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.pulseGrid}>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{activeRelations.length}</Text>
            <Text style={styles.pulseLabel}>Active</Text>
          </View>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{archivedRelations.length}</Text>
            <Text style={styles.pulseLabel}>Archived</Text>
          </View>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{readCount}</Text>
            <Text style={styles.pulseLabel}>Read</Text>
          </View>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{unreadCount}</Text>
            <Text style={styles.pulseLabel}>Unread</Text>
          </View>
          <View style={styles.pulseCardWide}>
            <Text style={styles.pulseValue}>{toNurtureCount}</Text>
            <Text style={styles.pulseLabel}>To nurture</Text>
          </View>
        </View>

        {archivedRelations.length > 0 && (
          <Pressable onPress={() => router.push('../relation/archived')} style={styles.archivedRow}>
            <Text style={styles.archivedRowText}>Open archived links</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Baobab — local-first, private by design.</Text>
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
    gap: spacing.md,
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
  passportTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarWrap: {
    padding: 2,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: colors.accent.softAmber + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  avatarText: {
    fontSize: 28,
    color: colors.text.primary,
    fontWeight: '700',
  },
  passportTextBlock: {
    flex: 1,
    gap: 4,
  },
  passportName: {
    fontSize: 26,
    lineHeight: 30,
    color: colors.text.primary,
    fontWeight: '700',
  },
  passportHandle: {
    fontSize: 14,
    color: colors.accent.warmGold,
    fontWeight: '600',
  },
  trustBadge: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.pill,
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
  heroActionsRow: {
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
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold + '15',
  },
  heroActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  heroActionPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.warmGold,
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
    gap: 2,
  },
  mappingName: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '600',
  },
  mappingMeta: {
    fontSize: 12,
    color: colors.text.muted,
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

  pulseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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

  footer: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  footerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
});
