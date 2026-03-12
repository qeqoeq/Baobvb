import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getTierAccent, type PillarKey } from '../../lib/evaluation';
import { getFoundationalReadingForRelation } from '../../lib/foundational-reading';
import { useRelationsStore } from '../../store/useRelationsStore';

const PILLAR_LABELS: Record<PillarKey, string> = {
  trust: 'Trust',
  interactions: 'Interactions',
  affinity: 'Affinity',
  support: 'Support',
  sharedNetwork: 'Shared Network',
};

const PILLAR_ORDER: PillarKey[] = [
  'trust',
  'interactions',
  'affinity',
  'support',
  'sharedNetwork',
];

export default function RelationDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { relations, evaluations } = useRelationsStore();

  const relation = useMemo(
    () => relations.find((r) => r.id === id) ?? null,
    [relations, id],
  );

  const reading = useMemo(
    () => (relation ? getFoundationalReadingForRelation(relation, evaluations) : null),
    [relation, evaluations],
  );

  useEffect(() => {
    if (!id || !relation) {
      router.back();
    }
  }, [id, relation]);

  if (!relation) {
    return <View style={styles.screen} />;
  }

  const evaluation = reading?.foundationalEvaluation ?? null;
  const accent = reading?.linkTier ? getTierAccent(reading.linkTier) : colors.accent.warmGold;
  const badgeLabel = reading?.badgeLabel ?? 'Unread';
  const sourceLabel = relation.source === 'scan' ? 'Added by scan' : 'Added manually';
  const sourceSubtext = relation.source === 'scan' && relation.sourceHandle
    ? `Scanned from ${relation.sourceHandle}`
    : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: accent + '14', borderColor: accent + '44' }]}>
          <Text style={[styles.avatarText, { color: accent }]}>
            {relation.name.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{relation.name}</Text>
        <View style={[styles.tierBadge, { backgroundColor: accent + '18' }]}>
          <Text style={[styles.tierBadgeText, { color: accent }]}>
            {evaluation ? `${badgeLabel} · ${evaluation.score}` : badgeLabel}
          </Text>
        </View>
        <Text style={styles.statusText}>Status: {reading?.readingStatus ?? 'Unread'}</Text>
        <View style={styles.originCard}>
          <Text style={styles.originLabel}>{sourceLabel}</Text>
          {sourceSubtext ? (
            <Text style={styles.originSubtext}>{sourceSubtext}</Text>
          ) : null}
        </View>
      </View>

      {evaluation ? (
        <View style={styles.readingSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Foundational reading</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.readingCard}>
            <View style={styles.scoreRow}>
              <Text style={[styles.scoreValue, { color: accent }]}>
                {evaluation.score}
              </Text>
              <View style={styles.scoreMeta}>
                <Text style={[styles.scoreTier, { color: accent }]}>
                  {evaluation.tier}
                </Text>
                <Text style={styles.scoreDate}>
                  {new Date(evaluation.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>

            <View style={styles.pillarsSection}>
              {PILLAR_ORDER.map((key) => {
                const dots = reading?.pillarDots?.[key] ?? [];
                return (
                  <View key={key} style={styles.pillarRow}>
                    <Text style={styles.pillarLabel}>{PILLAR_LABELS[key]}</Text>
                    <View style={styles.pillarDots}>
                      {dots.map((isFilled, idx) => (
                        <View
                          key={idx}
                          style={[
                            styles.pillarDot,
                            isFilled
                              ? { backgroundColor: accent }
                              : { backgroundColor: colors.border.soft },
                          ]}
                        />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
            <Text style={styles.pillarSummary}>
              Strongest: {reading?.strongestPillar ?? '-'} · Weakest: {reading?.weakestPillar ?? '-'}
            </Text>
          </View>

          <View style={styles.readingNote}>
            <Text style={styles.readingNoteText}>
              This is your foundational reading. It captures your first deep
              impression of this link.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.unreadSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Foundational reading</Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.unreadCard}>
            <Text style={styles.unreadTitle}>This link hasn't been read yet</Text>
            <Text style={styles.unreadText}>
              A foundational reading captures the shape and strength of your
              relationship through 5 pillars.
            </Text>
          </View>

          <Pressable
            onPress={() => router.push(`./evaluate/${relation.id}`)}
            style={styles.ctaButton}
          >
            <Text style={styles.ctaButtonText}>Read this link</Text>
          </Pressable>
        </View>
      )}
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
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },

  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '700',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  tierBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  tierBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  statusText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '500',
  },
  originCard: {
    marginTop: spacing.xs,
    alignItems: 'center',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  originLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  originSubtext: {
    fontSize: 12,
    color: colors.text.muted,
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

  readingSection: {
    gap: spacing.md,
  },
  readingCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  scoreValue: {
    fontSize: 40,
    fontWeight: '700',
  },
  scoreMeta: {
    gap: 2,
  },
  scoreTier: {
    fontSize: 16,
    fontWeight: '700',
  },
  scoreDate: {
    fontSize: 12,
    color: colors.text.muted,
  },
  pillarsSection: {
    gap: spacing.md,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pillarLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  pillarDots: {
    flexDirection: 'row',
    gap: 6,
  },
  pillarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pillarSummary: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
  readingNote: {
    paddingHorizontal: spacing.sm,
  },
  readingNoteText: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 18,
  },

  unreadSection: {
    gap: spacing.md,
  },
  unreadCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  unreadTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  unreadText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  ctaButton: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
