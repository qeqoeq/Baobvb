import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { colors } from '../../../constants/colors';
import { radius, spacing } from '../../../constants/spacing';
import {
  computePrivateLinkScore,
  getTier,
  type Evaluation,
  type PillarKey,
  type PillarRating,
} from '../../../lib/evaluation';
import { newCanonicalRelationId } from '../../../lib/identity';
import { showPhoneInviteSheet } from '../../../lib/phone-invite-sheet';
import {
  getMissingRequiredSignalsForPillar,
  getProgressiveUnlocks,
  type ProgressiveCriterionKey,
} from '../../../lib/progressive-criteria';
import { getRelationshipInviteMessage } from '../../../lib/relationship-invite';
import {
  attachSharedPrivateReadingReferenceForCurrentUser,
  createRelationshipInviteForCurrentUser,
  getSharedRevealRecordForCurrentUser,
  startSharedCookingRevealIfReady,
  tryRegisterPhoneAnchorSilently,
} from '../../../lib/reveal-shared-repo';
import type { RelationshipSideKey } from '../../../store/useRelationsStore';
import { useRelationsStore } from '../../../store/useRelationsStore';

const PILLARS: { key: PillarKey; label: string; hint: string }[] = [
  { key: 'trust', label: 'Trust', hint: 'Think of the last time you told them something that mattered.' },
  { key: 'interactions', label: 'Interactions', hint: 'Picture your last few exchanges — their texture, not just their frequency.' },
  { key: 'affinity', label: 'Affinity', hint: 'Is there ease between you, or do you always have to work at it?' },
  { key: 'support', label: 'Support', hint: 'When something goes wrong for you, do they come to mind?' },
  { key: 'sharedNetwork', label: 'Shared Network', hint: 'How much of your world do they already know?' },
];

const RATING_OPTIONS: PillarRating[] = [1, 2, 3, 4, 5];

// Warm bronze→gold intensity for SELECTED child signal buttons only.
// One warm family (no traffic-light, no red/green/violet). Higher values
// glow slightly brighter; lower values stay deeper. Unselected stays neutral.
const CHILD_RATING_TONES: Record<PillarRating, { bg: string; border: string; text: string }> = {
  1: { bg: '#2E2014', border: '#6B4A2A', text: '#C9A26E' },
  2: { bg: '#3B2918', border: '#8A5C30', text: '#D4B07A' },
  3: { bg: '#4A3320', border: '#A36D2E', text: '#DDBC85' },
  4: { bg: '#5A3F22', border: '#C28338', text: '#E8C68F' },
  5: { bg: '#6B4A24', border: '#E0A53A', text: '#F2D89A' },
};

const getChildRatingTone = (n: PillarRating) => CHILD_RATING_TONES[n];

export default function EvaluateScreen() {
  const { id, side, fromClaim } = useLocalSearchParams<{ id: string; side?: string; fromClaim?: string }>();
  const {
    me,
    relations,
    attachPrivateReadingToRelationshipSide,
    setCanonicalRelationId,
    markInviteDeliveryOpened,
    progressivePrivateSignals,
    setProgressivePrivateSignal,
  } = useRelationsStore();
  const targetSide: RelationshipSideKey = side === 'sideB' ? 'sideB' : 'sideA';
  const isFromClaim = fromClaim === '1';

  const relation = useMemo(
    () => relations.find((r) => r.id === id) ?? null,
    [relations, id],
  );

  const sideAlreadyHasReading = useMemo(() => {
    if (!relation) return false;
    return targetSide === 'sideB'
      ? relation.localState.sideB.hasPrivateReading
      : relation.localState.sideA.hasPrivateReading;
  }, [relation, targetSide]);

  const canEvaluateSideB = useMemo(() => {
    if (!relation || targetSide !== 'sideB') return true;
    return relation.localState.sideB.exists;
  }, [relation, targetSide]);

  useEffect(() => {
    // Do not redirect if handleSubmit just saved — it owns the navigation.
    if (hasSavedReadingRef.current) return;
    if (!id || !relation) {
      router.back();
      return;
    }
    if (!canEvaluateSideB) {
      router.back();
      return;
    }
    if (sideAlreadyHasReading) {
      router.back();
    }
  }, [id, relation, canEvaluateSideB, sideAlreadyHasReading]);

  const [ratings, setRatings] = useState<Record<PillarKey, PillarRating | null>>({
    trust: null,
    interactions: null,
    affinity: null,
    support: null,
    sharedNetwork: null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  // Progressive private signals add texture to a strong parent pillar.
  // They must not be averaged into the parent score or shared payload yet.
  // Persisted device-only via the store, keyed by relation.id.
  // - NEVER sent to the server (finalRatings is the 5-pillar Record).
  // - NEVER mixed into computePrivateLinkScore.
  // - NEVER computed as average(parentRating, childRatings) — the doctrine
  //   is that child signals qualify the parent (e.g. "deep but uneven"),
  //   they do not replace its level.
  const progressiveChildRatings = useMemo(
    () => (relation ? (progressivePrivateSignals[relation.id] ?? {}) : {}),
    [progressivePrivateSignals, relation],
  );
  const setProgressiveChildRating = useCallback(
    (parentPillar: PillarKey, criterionKey: ProgressiveCriterionKey, rating: 1 | 2 | 3 | 4 | 5) => {
      if (!relation) return;
      void Haptics.selectionAsync().catch(() => undefined);
      setProgressivePrivateSignal(relation.id, parentPillar, criterionKey, rating);
    },
    [relation, setProgressivePrivateSignal],
  );
  // Prevents the sideAlreadyHasReading guard from calling router.back() after a successful save.
  const hasSavedReadingRef = useRef(false);

  const completedCount = useMemo(
    () => Object.values(ratings).filter((v) => v !== null).length,
    [ratings],
  );
  const allRated = useMemo(
    () => Object.values(ratings).every((v) => v !== null),
    [ratings],
  );
  // Progressive criteria — derived from current ratings.
  // Local-only, never stored, never sent to the server. The criteria pills
  // are visual hints that a private deeper layer is available; v0.2 does
  // not capture answers for these criteria.
  const progressiveUnlocks = useMemo(() => getProgressiveUnlocks(ratings), [ratings]);
  const progress = completedCount / PILLARS.length;

  // Baobab requires private signals on any pillar with a strong parent rating:
  //   - parent 5 → all deep private signals required
  //   - parent 4 → all light private signals required
  //   - parent <= 3 → no obligation
  // The check is pure: reads only local state (ratings + progressiveChildRatings).
  const pillarsRequiringPrivateSignals = useMemo(() => {
    const incomplete: { pillarKey: PillarKey; pillarLabel: string }[] = [];
    for (const { key, label } of PILLARS) {
      const missing = getMissingRequiredSignalsForPillar(key, ratings[key], progressiveChildRatings[key]);
      if (missing.length > 0) {
        incomplete.push({ pillarKey: key, pillarLabel: label });
      }
    }
    return incomplete;
  }, [ratings, progressiveChildRatings]);
  const allPrivateSignalsRated = pillarsRequiringPrivateSignals.length === 0;
  const privateSignalsBlockingMessage = useMemo(() => {
    if (pillarsRequiringPrivateSignals.length === 0) return null;
    if (pillarsRequiringPrivateSignals.length === 1) {
      return `One more detail for ${pillarsRequiringPrivateSignals[0].pillarLabel} to save.`;
    }
    const labels = pillarsRequiringPrivateSignals.map((p) => p.pillarLabel);
    const last = labels[labels.length - 1];
    const head = labels.slice(0, -1).join(', ');
    return `A few more details for ${head} and ${last} to save.`;
  }, [pillarsRequiringPrivateSignals]);
  const progressLabel = useMemo(() => {
    const remaining = PILLARS.length - completedCount;
    if (remaining > 0) return `${remaining} more to go`;
    if (!allPrivateSignalsRated) return 'Add details to save';
    return 'Ready to save';
  }, [completedCount, allPrivateSignalsRated]);
  const isInviteNumberRelation = relation?.source === 'invite_number';
  const sourceLabel =
    relation?.source === 'scan'
      ? 'Added by scan'
      : relation?.source === 'invite_number'
        ? 'Invited by number'
      : relation?.source === 'claim'
        ? 'Joined by invite'
        : 'Added manually';
  const sourceSubtext = relation?.source === 'scan' && relation.sourceHandle
    ? `Scanned from ${relation.sourceHandle}`
    : null;

  const setRating = useCallback((key: PillarKey, value: PillarRating) => {
    void Haptics.selectionAsync().catch(() => undefined);
    setRatings((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!allRated || !relation || isSubmitting) return;

    setIsSubmitting(true);

    // Progressive private signals are stored local-only (store map keyed by relation.id).
    // They must not be included in shared payloads or score computation yet.
    const finalRatings = ratings as Record<PillarKey, PillarRating>;
    const score = computePrivateLinkScore(finalRatings);

    const evaluation: Evaluation = {
      id: `eval-${relation.id}-${Date.now()}`,
      relationId: relation.id,
      ratings: finalRatings,
      score,
      tier: getTier(score),
      createdAt: new Date().toISOString(),
    };

    hasSavedReadingRef.current = true;
    const saved = attachPrivateReadingToRelationshipSide(evaluation, targetSide);
    if (!saved) {
      Alert.alert('Could not save reading', 'This side is not ready for a private reading yet.');
      hasSavedReadingRef.current = false;
      setIsSubmitting(false);
      return;
    }

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);

    if (!relation.canonicalRelationId) {
      if (relation.source === 'invite_number' && relation.anchorValue) {
        try {
          const canonicalId = newCanonicalRelationId();
          setCanonicalRelationId(relation.id, canonicalId);
          const invite = await createRelationshipInviteForCurrentUser(canonicalId, 'sideA', undefined, {
            displayName: me.displayName,
            handle: me.handle,
            avatarSeed: me.avatarSeed,
          });
          try {
            await attachSharedPrivateReadingReferenceForCurrentUser(
              canonicalId,
              'sideA',
              evaluation.id,
              finalRatings,
            );
          } catch {
            // Additive — invite delivery is not blocked by a failed reading attach.
          }
          void tryRegisterPhoneAnchorSilently(canonicalId, relation.anchorValue);
          const { message, url } = getRelationshipInviteMessage({
            relationId: canonicalId,
            inviteToken: invite.invite_token,
            senderName: me.displayName,
          });
          showPhoneInviteSheet({
            rawPhone: relation.anchorValue,
            privateLabel: relation.name,
            fullMessage: url ? `${message}\n${url}` : message,
            onDeliveryChannelOpened: () => markInviteDeliveryOpened(relation.id),
            onDismiss: () => {
              if (isFromClaim) { router.replace('/(tabs)'); } else { router.replace({ pathname: '/relation/[id]', params: { id: relation.id } }); }
            },
          });
        } catch {
          // Invite creation failed — land on relation detail where retry is available.
          if (isFromClaim) { router.replace('/(tabs)'); } else { router.replace({ pathname: '/relation/[id]', params: { id: relation.id } }); }
        }
        return;
      }
      if (__DEV__) console.log('[evaluate:save] local-only → navigate to', relation.id);
      if (isFromClaim) { router.replace('/(tabs)'); } else { router.replace({ pathname: '/relation/[id]', params: { id: relation.id } }); }
      return;
    }
    if (__DEV__) console.log('[evaluate:save] shared-backed → canonical', relation.canonicalRelationId);

    try {
      // Shared attach only runs after the server has already bound this user to the
      // claimed side. The client must not bootstrap shared_relationship_reveals here.
      const canonicalId = relation.canonicalRelationId ?? relation.id;
      const sharedRecord = await getSharedRevealRecordForCurrentUser(canonicalId);
      const ownsTargetSide =
        targetSide === 'sideA'
          ? sharedRecord?.my_side === 'sideA'
          : sharedRecord?.my_side === 'sideB';

      if (sharedRecord === null) {
        throw new Error('shared reveal record missing on server');
      }
      if (!ownsTargetSide) {
        throw new Error(`server-side shared reveal is not bound to caller as ${targetSide}`);
      }

      await attachSharedPrivateReadingReferenceForCurrentUser(
        canonicalId,
        targetSide,
        evaluation.id,
        finalRatings,
      );
      await startSharedCookingRevealIfReady(canonicalId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown shared sync error';
      if (__DEV__) console.warn('[shared-reveal-sync] foundational reading saved locally but shared sync failed', {
        source: relation.source,
        side: targetSide,
        message,
      });
      Alert.alert(
        'Reading saved locally',
        'Shared sync did not complete. Mutual reveal stays locked until the server confirms your side.',
      );
    }

    if (isFromClaim) { router.replace('/(tabs)'); } else { router.replace({ pathname: '/relation/[id]', params: { id: relation.id } }); }
  }, [allRated, relation, isSubmitting, ratings, attachPrivateReadingToRelationshipSide, targetSide, me, setCanonicalRelationId, markInviteDeliveryOpened, isFromClaim]);

  if (!relation || !canEvaluateSideB || sideAlreadyHasReading) {
    return (
      <View style={styles.screen}>
        <View style={styles.fallbackWrap}>
          <Text style={styles.fallbackText}>Opening relationship...</Text>
        </View>
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.kicker}>Read this link</Text>
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
          How does this connection feel today?
        </Text>
        <View style={styles.progressWrap}>
          <View style={styles.progressHead}>
            <Text style={styles.progressLabel}>Progress</Text>
            <Text style={styles.progressValue}>{progressLabel}</Text>
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
              {(() => {
                const unlock = progressiveUnlocks[key];
                if (unlock.level === 'none') return null;
                const isDeep = unlock.level === 'deep';
                return (
                  <View style={styles.unlockBlock}>
                    <Text style={styles.unlockTitle}>
                      {isDeep ? 'This layer can go deeper' : 'A few private signals are available'}
                    </Text>
                    <Text style={styles.unlockBody}>
                      {isDeep
                        ? 'Optional private signals are available.'
                        : 'You can lightly refine this layer.'}
                    </Text>
                    <View style={styles.unlockDetailsList}>
                      {unlock.criteria.map((c, idx) => {
                        const currentChildRating = progressiveChildRatings[key]?.[c.key];
                        return (
                          <View
                            key={c.key}
                            style={[
                              styles.unlockDetailItem,
                              idx > 0 && styles.unlockDetailItemSpaced,
                            ]}
                          >
                            <Text style={styles.unlockDetailLabel}>{c.label}</Text>
                            <Text style={styles.unlockDetailHint}>{c.hint}</Text>
                            <View style={styles.unlockChildRatingRow}>
                              {RATING_OPTIONS.map((n) => {
                                const isSelected = currentChildRating === n;
                                const tone = isSelected ? getChildRatingTone(n) : null;
                                return (
                                  <Pressable
                                    key={n}
                                    onPress={() => setProgressiveChildRating(key, c.key, n)}
                                    accessibilityRole="button"
                                    style={[
                                      styles.unlockChildRatingButton,
                                      isSelected && styles.unlockChildRatingButtonActive,
                                      tone && { backgroundColor: tone.bg, borderColor: tone.border },
                                    ]}
                                    hitSlop={4}
                                  >
                                    <Text
                                      style={[
                                        styles.unlockChildRatingText,
                                        isSelected && styles.unlockChildRatingTextActive,
                                        tone && { color: tone.text },
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
                    <Text style={styles.unlockFooter}>Only for your private reading.</Text>
                  </View>
                );
              })()}
            </View>
          );
        })}
      </View>

      <View style={styles.submitSection}>
        <Pressable
          onPress={() => void handleSubmit()}
          disabled={!allRated || !allPrivateSignalsRated || isSubmitting}
          style={[
            styles.submitButton,
            (!allRated || !allPrivateSignalsRated || isSubmitting) && styles.submitButtonDisabled,
          ]}
        >
          <Text style={styles.submitButtonText}>
            {isSubmitting
              ? 'Saving...'
              : allRated
                ? (isInviteNumberRelation ? 'Save and send' : 'Save my reading')
                : `${PILLARS.length - completedCount} more to go`}
          </Text>
        </Pressable>
        {allRated && privateSignalsBlockingMessage ? (
          <Text style={styles.submitHelperText}>{privateSignalsBlockingMessage}</Text>
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
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },
  fallbackWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: colors.text.muted,
    fontSize: 13,
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
    color: colors.accent.softAmber,
    fontWeight: '800',
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

  // ── Unlocked private signal layer ────────────────────────────────────────
  // Visual treatment: dim amber chamber, warmGold-tinted border + subtle
  // outer glow. The intent is "a secret depth layer just opened" — not a
  // form panel, not a casino badge. Restricted to this block only; the
  // parent pillar card stays neutral.
  unlockBlock: {
    marginTop: spacing.md,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '40',
    backgroundColor: colors.accent.warmGold + '0F',
    shadowColor: colors.accent.warmGold,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  unlockTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.accent.warmGold,
  },
  unlockBody: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
  },
  unlockDetailsList: {
    marginTop: spacing.sm,
    paddingLeft: spacing.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.accent.warmGold + '66',
  },
  unlockDetailItem: {
    gap: 2,
  },
  unlockDetailItemSpaced: {
    marginTop: spacing.xs + 2,
  },
  unlockDetailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.primary,
  },
  unlockDetailHint: {
    fontSize: 12,
    lineHeight: 16,
    color: colors.text.muted,
  },
  unlockChildRatingRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  unlockChildRatingButton: {
    flex: 1,
    height: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '33',
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unlockChildRatingButtonActive: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold + '4D',
  },
  unlockChildRatingText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.muted,
    letterSpacing: 0.2,
  },
  unlockChildRatingTextActive: {
    color: colors.accent.warmGold,
  },
  unlockFooter: {
    fontSize: 10,
    fontStyle: 'italic',
    color: colors.text.muted,
    marginTop: 2,
  },

  submitSection: {
    gap: spacing.xs,
  },
  submitButton: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent.softAmber,
    shadowColor: colors.accent.softAmber,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  submitButtonDisabled: {
    opacity: 0.4,
  },
  submitButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
  submitHelperText: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.text.secondary,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
});
