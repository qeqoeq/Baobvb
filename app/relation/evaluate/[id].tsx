import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../../constants/colors';
import { radius, spacing } from '../../../constants/spacing';
import {
  computeScore,
  getTier,
  type Evaluation,
  type PillarKey,
  type PillarRating,
} from '../../../lib/evaluation';
import { useRelationsStore } from '../../../store/useRelationsStore';

const PILLARS: { key: PillarKey; label: string; hint: string }[] = [
  { key: 'trust', label: 'Trust', hint: 'How much do you trust this person?' },
  { key: 'interactions', label: 'Interactions', hint: 'How often and how well do you interact?' },
  { key: 'affinity', label: 'Affinity', hint: 'How naturally do you connect?' },
  { key: 'support', label: 'Support', hint: 'How much mutual support exists?' },
  { key: 'sharedNetwork', label: 'Shared Network', hint: 'How much social context do you share?' },
];

const RATING_OPTIONS: PillarRating[] = [1, 2, 3, 4, 5];

export default function EvaluateScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { relations, evaluations, addEvaluation } = useRelationsStore();

  const relation = useMemo(
    () => relations.find((r) => r.id === id) ?? null,
    [relations, id],
  );

  const hasEvaluation = useMemo(
    () => evaluations.some((e) => e.relationId === id),
    [evaluations, id],
  );

  useEffect(() => {
    if (!id || !relation) {
      router.back();
      return;
    }
    if (hasEvaluation) {
      router.replace(`../${id}`);
    }
  }, [id, relation, hasEvaluation]);

  const [ratings, setRatings] = useState<Record<PillarKey, PillarRating | null>>({
    trust: null,
    interactions: null,
    affinity: null,
    support: null,
    sharedNetwork: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);

  const completedCount = useMemo(
    () => Object.values(ratings).filter((v) => v !== null).length,
    [ratings],
  );
  const allRated = useMemo(
    () => Object.values(ratings).every((v) => v !== null),
    [ratings],
  );
  const progress = completedCount / PILLARS.length;
  const sourceLabel = relation?.source === 'scan' ? 'Added by scan' : 'Added manually';
  const sourceSubtext = relation?.source === 'scan' && relation.sourceHandle
    ? `Scanned from ${relation.sourceHandle}`
    : null;

  const setRating = useCallback((key: PillarKey, value: PillarRating) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    if (!allRated || !relation || isSubmitting) return;

    setIsSubmitting(true);

    const finalRatings = ratings as Record<PillarKey, PillarRating>;
    const score = computeScore(finalRatings);

    const evaluation: Evaluation = {
      id: `eval-${relation.id}-${Date.now()}`,
      relationId: relation.id,
      ratings: finalRatings,
      score,
      tier: getTier(score),
      createdAt: new Date().toISOString(),
    };

    addEvaluation(evaluation);
    router.replace(`../${relation.id}`);
  }, [allRated, relation, isSubmitting, ratings, addEvaluation]);

  if (!relation || hasEvaluation) {
    return <View style={styles.screen} />;
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Foundational reading</Text>
        <View style={styles.identityRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(relation.avatarSeed || relation.name.charAt(0) || '?').toUpperCase()}
            </Text>
          </View>
          <View style={styles.identityBody}>
            <Text style={styles.title}>{relation.name}</Text>
            {relation.handle ? <Text style={styles.handle}>{relation.handle}</Text> : null}
            <Text style={styles.sourceText}>
              {sourceLabel}
              {sourceSubtext ? ` · ${sourceSubtext}` : ''}
            </Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Rate each pillar from 1 to 5 to capture your foundational reading of
          this link.
        </Text>
        <View style={styles.progressWrap}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressValue}>
              {completedCount}/{PILLARS.length}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
      </View>

      <View style={styles.pillarsList}>
        {PILLARS.map(({ key, label, hint }, idx) => {
          const current = ratings[key];
          return (
            <View key={key} style={styles.pillarCard}>
              <Text style={styles.pillarStep}>Pillar {idx + 1}</Text>
              <Text style={styles.pillarLabel}>{label}</Text>
              <Text style={styles.pillarHint}>{hint}</Text>
              <View style={styles.ratingRow}>
                {RATING_OPTIONS.map((n) => {
                  const isSelected = current === n;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setRating(key, n)}
                      style={[
                        styles.ratingButton,
                        isSelected && styles.ratingButtonActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.ratingText,
                          isSelected && styles.ratingTextActive,
                        ]}
                      >
                        {n}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.ratingLegendRow}>
                <Text style={styles.ratingLegendText}>1 low</Text>
                <Text style={styles.ratingLegendText}>5 high</Text>
              </View>
            </View>
          );
        })}
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={!allRated || isSubmitting}
        style={[
          styles.submitButton,
          (!allRated || isSubmitting) && styles.submitButtonDisabled,
        ]}
      >
        <Text style={styles.submitButtonText}>
          {isSubmitting
            ? 'Saving...'
            : allRated
              ? 'Save foundational reading'
              : `Rate ${PILLARS.length - completedCount} more pillar${PILLARS.length - completedCount > 1 ? 's' : ''}`}
        </Text>
      </Pressable>
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
    gap: spacing.sm,
    paddingTop: spacing.sm,
  },
  identityRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
  },
  identityBody: {
    flex: 1,
    gap: 2,
  },
  kicker: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.text.muted,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  handle: {
    fontSize: 13,
    color: colors.accent.warmGold,
    fontWeight: '600',
  },
  sourceText: {
    fontSize: 11,
    color: colors.text.muted,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  progressWrap: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  progressHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.text.muted,
    fontWeight: '700',
  },
  progressValue: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background.tertiary,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.accent.deepTeal,
  },

  pillarsList: {
    gap: spacing.md,
  },
  pillarCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  pillarStep: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.text.muted,
    fontWeight: '700',
  },
  pillarLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  pillarHint: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },
  ratingRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  ratingButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  ratingButtonActive: {
    backgroundColor: colors.accent.deepTeal,
    borderColor: colors.accent.deepTeal,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.muted,
  },
  ratingTextActive: {
    color: colors.text.primary,
  },
  ratingLegendRow: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ratingLegendText: {
    fontSize: 11,
    color: colors.text.muted,
  },

  submitButton: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
