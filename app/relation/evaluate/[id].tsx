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

  const allRated = useMemo(
    () => Object.values(ratings).every((v) => v !== null),
    [ratings],
  );

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
        <Text style={styles.title}>{relation.name}</Text>
        <Text style={styles.subtitle}>
          Rate each pillar from 1 to 5 to capture your first deep impression of
          this link.
        </Text>
      </View>

      <View style={styles.pillarsList}>
        {PILLARS.map(({ key, label, hint }) => {
          const current = ratings[key];
          return (
            <View key={key} style={styles.pillarCard}>
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
          {isSubmitting ? 'Saving...' : 'Save reading'}
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
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
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
