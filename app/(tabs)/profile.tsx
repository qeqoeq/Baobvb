import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import { useRelationsStore } from '../../store/useRelationsStore';

const LINK_TYPES = ['Legend', 'Anchor', 'Vibrant', 'Thrill', 'Spark', 'Ghost'] as const;

const LINK_META: Record<string, { accent: string; signature: string }> = {
  Legend: { accent: colors.accent.softAmber, signature: 'Rare and unforgettable' },
  Anchor: { accent: colors.accent.deepTeal, signature: 'Deep and steady' },
  Vibrant: { accent: colors.accent.mutedSage, signature: 'Alive and growing' },
  Thrill: { accent: colors.accent.dustyRose, signature: 'Exciting and moving' },
  Spark: { accent: colors.accent.warmGold, signature: 'Early and promising' },
  Ghost: { accent: colors.text.muted, signature: 'Distant or fading' },
};

export default function ProfileScreen() {
  const { me, evaluations, activeRelations, archivedRelations } = useRelationsStore();

  const activeReadings = useMemo(
    () => getFoundationalReadings(activeRelations, evaluations),
    [activeRelations, evaluations],
  );

  const readCount = useMemo(
    () => activeReadings.filter((reading) => reading.hasFoundationalReading).length,
    [activeReadings],
  );
  const unreadCount = useMemo(
    () => activeReadings.filter((reading) => !reading.hasFoundationalReading).length,
    [activeReadings],
  );
  const toNurtureCount = useMemo(
    () => activeReadings.filter((reading) => reading.toNurture).length,
    [activeReadings],
  );

  const tierCounts = useMemo(() => {
    const counts: Record<(typeof LINK_TYPES)[number], number> = {
      Ghost: 0,
      Spark: 0,
      Thrill: 0,
      Vibrant: 0,
      Anchor: 0,
      Legend: 0,
    };

    for (const reading of activeReadings) {
      if (reading.linkTier) {
        counts[reading.linkTier] += 1;
      }
    }
    return counts;
  }, [activeReadings]);

  const hasAnyReadings = readCount > 0;
  const stableCount = useMemo(
    () => activeReadings.filter((reading) => reading.readingStatus === 'Read' && !reading.toNurture).length,
    [activeReadings],
  );

  const dominantTier = useMemo(() => {
    let bestTier: (typeof LINK_TYPES)[number] | null = null;
    let bestCount = 0;
    for (const tier of LINK_TYPES) {
      const count = tierCounts[tier];
      if (count > bestCount) {
        bestTier = tier;
        bestCount = count;
      }
    }
    return bestTier;
  }, [tierCounts]);

  const landscapeSummary = useMemo(() => {
    if (!hasAnyReadings) return 'No foundational readings yet.';
    if (!dominantTier) return `${readCount} links read so far.`;
    const dominantCount = tierCounts[dominantTier];
    return `${dominantCount} ${dominantTier.toLowerCase()} link${dominantCount > 1 ? 's' : ''} lead your current landscape.`;
  }, [hasAnyReadings, dominantTier, tierCounts, readCount]);

  const trustTitle = useMemo(() => {
    if (activeRelations.length === 0) return 'Your circle has not started yet';
    if (!hasAnyReadings) return 'Your circle is taking shape';
    if (toNurtureCount > 0) return 'Your trust map is alive';
    return 'Your mapped links feel steady';
  }, [activeRelations.length, hasAnyReadings, toNurtureCount]);

  const trustSub = useMemo(() => {
    if (activeRelations.length === 0) {
      return 'Add your first relation to start your trust passport.';
    }
    if (!hasAnyReadings) {
      return `You have ${activeRelations.length} active link${activeRelations.length > 1 ? 's' : ''}, still unread.`;
    }
    if (toNurtureCount > 0) {
      return `You have ${readCount} read link${readCount > 1 ? 's' : ''} and ${toNurtureCount} to nurture.`;
    }
    return `${stableCount} mapped link${stableCount > 1 ? 's feel' : ' feels'} stable right now.`;
  }, [activeRelations.length, hasAnyReadings, readCount, stableCount, toNurtureCount]);

  const passportStatusLabel = useMemo(() => {
    if (me.trustPassportStatus === 'new') return 'Emerging';
    if (me.trustPassportStatus === 'steady') return 'Steady';
    return 'Growing';
  }, [me.trustPassportStatus]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.passportCard}>
        <Text style={styles.passportKicker}>Trust passport</Text>

        <View style={styles.avatarRing}>
          <View style={styles.avatarInner}>
            <Text style={styles.avatarText}>
              {(me.avatarSeed || me.displayName.charAt(0) || '?').toUpperCase()}
            </Text>
          </View>
        </View>

        <Text style={styles.handle}>{me.handle}</Text>
        <Text style={styles.displayName}>{me.displayName}</Text>

        <View style={styles.verifyBadge}>
          <View style={styles.verifyDot} />
          <Text style={styles.verifyText}>{passportStatusLabel}</Text>
        </View>

        <View style={styles.passportDivider} />

        <Text style={styles.passportHint}>
          Your card reflects your local trust identity and evolves with every
          mapped link.
        </Text>
        <Pressable onPress={() => router.push('../me/edit')} style={styles.editCardLink}>
          <Text style={styles.editCardLinkText}>Edit my card</Text>
        </Pressable>
        <View style={styles.profileActionsRow}>
          <Pressable onPress={() => router.push('../me/qr')} style={styles.profileActionButton}>
            <Text style={styles.profileActionText}>Show QR</Text>
          </Pressable>
          <Pressable onPress={() => router.push('../me/scan')} style={styles.profileActionButton}>
            <Text style={styles.profileActionText}>Scan</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{activeRelations.length}</Text>
          <View style={[styles.statAccent, { backgroundColor: colors.accent.deepTeal }]} />
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{archivedRelations.length}</Text>
          <View style={[styles.statAccent, { backgroundColor: colors.text.muted }]} />
          <Text style={styles.statLabel}>Archived</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{readCount}</Text>
          <View style={[styles.statAccent, { backgroundColor: colors.accent.warmGold }]} />
          <Text style={styles.statLabel}>Read</Text>
        </View>
      </View>
      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{unreadCount}</Text>
          <View style={[styles.statAccent, { backgroundColor: colors.text.muted }]} />
          <Text style={styles.statLabel}>Unread</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{toNurtureCount}</Text>
          <View style={[styles.statAccent, { backgroundColor: colors.accent.dustyRose }]} />
          <Text style={styles.statLabel}>To nurture</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Relationship landscape</Text>
        <View style={styles.sectionLine} />
      </View>

      <View style={styles.landscapeCard}>
        {LINK_TYPES.map((type) => {
          const meta = LINK_META[type];
          return (
            <View key={type} style={styles.landscapeRow}>
              <View style={styles.landscapeLeft}>
                <View style={[styles.landscapeSwatch, { backgroundColor: meta.accent }]} />
                <View style={styles.landscapeLabels}>
                  <Text style={styles.landscapeName}>{type}</Text>
                  <Text style={styles.landscapeSignature}>{meta.signature}</Text>
                </View>
              </View>
              <Text style={[styles.landscapeCount, { color: meta.accent }]}>
                {tierCounts[type]}
              </Text>
            </View>
          );
        })}
        <View style={styles.landscapeSummaryCard}>
          <Text style={styles.landscapeSummaryText}>{landscapeSummary}</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Trust status</Text>
        <View style={styles.sectionLine} />
      </View>

      <View style={styles.trustCard}>
        <View style={styles.trustShield}>
          <Text style={styles.trustEmoji}>{'\u{1F6E1}'}</Text>
        </View>
        <View style={styles.trustBody}>
          <Text style={styles.trustTitle}>{trustTitle}</Text>
          <Text style={styles.trustSub}>{trustSub}</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Baobab — local-first, private by design.
        </Text>
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
    paddingTop: 48,
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },

  passportCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  passportKicker: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: colors.text.muted,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.accent.warmGold + '44',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  avatarInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '600',
    color: colors.text.muted,
  },
  handle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.accent.warmGold,
    letterSpacing: 0.3,
  },
  displayName: {
    fontSize: 15,
    color: colors.text.secondary,
    fontStyle: 'italic',
  },
  verifyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: spacing.xs,
  },
  verifyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.text.muted,
  },
  verifyText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  passportDivider: {
    width: 40,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.strong,
    marginVertical: spacing.xs,
  },
  passportHint: {
    fontSize: 12,
    lineHeight: 19,
    color: colors.text.muted,
    textAlign: 'center',
  },
  editCardLink: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  editCardLinkText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
    textDecorationLine: 'underline',
  },
  profileActionsRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  profileActionButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 3,
  },
  profileActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },

  statsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
  },
  statAccent: {
    width: 20,
    height: 3,
    borderRadius: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },

  landscapeCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md + 4,
  },
  landscapeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  landscapeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  landscapeSwatch: {
    width: 4,
    height: 32,
    borderRadius: 2,
  },
  landscapeLabels: {
    gap: 1,
  },
  landscapeName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  landscapeSignature: {
    fontSize: 12,
    color: colors.text.muted,
  },
  landscapeCount: {
    fontSize: 20,
    fontWeight: '700',
    width: 32,
    textAlign: 'right',
  },
  landscapeSummaryCard: {
    marginTop: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  landscapeSummaryText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },

  trustCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  trustShield: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent.warmGold + '14',
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustEmoji: {
    fontSize: 18,
  },
  trustBody: {
    flex: 1,
    gap: 4,
  },
  trustTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  trustSub: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },

  footer: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  footerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
});
