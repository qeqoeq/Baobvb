import * as Haptics from 'expo-haptics';
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { devLogLinking, maskIdForLog } from '../../lib/dev-linking-log';
import { isLocalDraftId, newCanonicalRelationId } from '../../lib/identity';
import { radius, spacing } from '../../constants/spacing';
import { getTierAccent, type PillarKey } from '../../lib/evaluation';
import { getTierDisplayLabel } from '../../lib/tier-display';
import {
  getFoundationalReadingForRelation,
  getPillarLabel,
  getTierNarrative,
} from '../../lib/foundational-reading';
import { getRelationshipInviteMessage } from '../../lib/relationship-invite';
import {
  getRelationshipLexiconEntry,
  isRelationshipNameRevealed,
} from '../../lib/relationship-lexicon';
import {
  buildRelationshipRevealInput,
  getSafeRelationshipRevealSummary,
} from '../../lib/relationship-reveal';
import { applyEffectiveRevealToRelation } from '../../lib/relationship-reveal-precedence';
import {
  attachSharedPrivateReadingReferenceForCurrentUser,
  createRelationshipInviteForCurrentUser,
  getSharedRevealRecordForCurrentUser,
  markSharedRevealReadyIfUnlocked,
  openSharedReveal,
  startSharedCookingRevealIfReady,
  tryRegisterPhoneAnchorSilently,
} from '../../lib/reveal-shared-repo';
import {
  getDeeperSignal,
  getReadingCardVariant,
  getReadingNoteText,
  getRelationNextAction,
  getRelationSheetIdentity,
  getSharedRevealDisplayState,
} from '../../lib/relation-detail-helpers';
import { showPhoneInviteSheet } from '../../lib/phone-invite-sheet';
import { resyncSharedRelations } from '../../lib/resync-shared-relations';
import {
  findRelationByDeepLinkId,
  resolveDeepLinkPhase,
} from '../../lib/relation-deep-link-resolution';
import {
  getProgressiveCriteriaForPillar,
  type ProgressiveCriterionKey,
} from '../../lib/progressive-criteria';
import {
  canUsePrivateOpenWorlds,
  getRelationOpenWorldLabel,
  RELATION_OPEN_WORLD_OPTIONS,
} from '../../lib/relation-open-worlds';
import { getRelationSnapshotById, useRelationsStore } from '../../store/useRelationsStore';

function getHeaderTitle(
  privateLabel: string,
  ctaKind: 'evaluate' | 'invite' | 'reveal' | 'resend' | null,
): string {
  if (ctaKind === 'resend') return 'Invite';
  const trimmed = privateLabel.trim();
  if (trimmed.length < 3) return '';
  if (trimmed.startsWith('(')) return '';
  return trimmed;
}

// B25: how long the screen holds a loading state (forcing a re-sync) before it
// concludes a deep-link target is genuinely unavailable. Generous on purpose — a
// cold-start notification tap races bootstrap; the user must never see the hard
// error at the moment they answer the call.
const RESOLUTION_GRACE_MS = 8000;

const PILLAR_ORDER: PillarKey[] = [
  'trust',
  'interactions',
  'affinity',
  'support',
  'sharedNetwork',
];

export default function RelationDetailScreen() {
  const { id, justCreated } = useLocalSearchParams<{ id: string; justCreated?: string }>();
  const { me, relations, evaluations, syncRevealReadyState, revealMutualRelationship, syncSharedRevealToReady, setCanonicalRelationId, markInviteDeliveryOpened, archiveRelation, getAssistedReconciliationSuggestionForRelation, getDraftResolutionSuggestionForRelation, progressivePrivateSignals, setRelationPrivateOpenWorlds } = useRelationsStore();
  const [sharedReveal, setSharedReveal] = useState<import('../../lib/reveal-shared-types').RevealSnapshotSource | null>(null);
  // Prevents refreshSharedReveal from fetching an incomplete backend record
  // during the invite creation window, which would override local state.
  const isInviteFlowActiveRef = useRef(false);
  const revealUnlockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTreeScale = useRef(new Animated.Value(0)).current;
  const revealOverlayOpacity = useRef(new Animated.Value(0)).current;
  const [isRevealing, setIsRevealing] = useState(false);
  // Local-only transition moment shown after a successful reveal. Not persisted.
  // It must never reappear on remount and must never expose any numeric score,
  // tier, or percentage — only a qualitative doctrine cue.
  const [showSharedReadingMoment, setShowSharedReadingMoment] = useState(false);
  // B25: true once the deep-link grace window elapsed with the target still absent.
  const [graceExhausted, setGraceExhausted] = useState(false);
  // Live countdown during cooking_reveal. Read-only from server's unlock_at;
  // never used to fake a ready state. null when cooking countdown is unknown.
  const [cookingRemainingSeconds, setCookingRemainingSeconds] = useState<number | null>(null);
  const cookingCountdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCountdownHapticSecondRef = useRef<number | null>(null);
  const isAppActiveRef = useRef(true);

  // B25: resolve by local id OR canonicalRelationId. A reveal-ready push deep-links
  // by the canonical UUID, which never equals the local `r-…` id — the old
  // `r.id === id` lookup could never match a notification target.
  const relation = useMemo(
    () => findRelationByDeepLinkId(relations, id),
    [relations, id],
  );

  const reading = useMemo(
    () => (relation ? getFoundationalReadingForRelation(relation, evaluations) : null),
    [relation, evaluations],
  );

  const refreshSharedReveal = useCallback(async () => {
    if (isInviteFlowActiveRef.current) return;
    if (!relation) {
      setSharedReveal(null);
      return;
    }
    try {
      const relationshipId = relation.canonicalRelationId ?? relation.id;
      const record = await getSharedRevealRecordForCurrentUser(relationshipId);
      setSharedReveal(record);
    } catch {
      setSharedReveal(null);
    }
  }, [relation]);

  const navigateAway = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  useEffect(() => {
    if (!id) {
      if (__DEV__) {
        devLogLinking('relation detail: missing id, navigating back', {});
      }
      navigateAway();
      return;
    }
    if (!relation) {
      if (__DEV__) {
        devLogLinking('relation detail: no local relation for id', { id: maskIdForLog(id) });
      }
    }
  }, [id, relation]);

  useEffect(() => {
    void refreshSharedReveal();
  }, [refreshSharedReveal]);

  // B26 — re-sync the shared-relations list on focus (throttled). refreshSharedReveal
  // above only re-fetches THIS relation's reveal record; the throttled list re-sync
  // also adopts server status advances (waiting → revealed) and counterpart name/
  // counter changes that happened while the app was backgrounded. Safe by
  // construction: never downgrades a local reveal, never archives.
  useFocusEffect(
    useCallback(() => {
      void resyncSharedRelations();
    }, []),
  );

  // B25 — deep-link resolution machine. When the target relation isn't in the store
  // yet (notification deep-links by canonical id before bootstrap re-ran), force a
  // re-sync and hold a loading state. Only after RESOLUTION_GRACE_MS with still no
  // match do we conclude "unavailable" — never an immediate hard error on tap.
  // Covers both hot-tap and cold-start (both route here via router.push).
  useEffect(() => {
    if (!id) return;
    if (relation) {
      // Found (possibly after the forced re-sync landed) — clear any pending verdict.
      if (graceExhausted) setGraceExhausted(false);
      return;
    }
    let cancelled = false;
    setGraceExhausted(false);
    void resyncSharedRelations({ force: true });
    const timer = setTimeout(() => {
      if (!cancelled) setGraceExhausted(true);
    }, RESOLUTION_GRACE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // graceExhausted is intentionally omitted: including it would restart the timer
    // when we clear the flag on a late resolve. Only id/relation drive this machine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, relation]);

  const effectiveRelation = useMemo(
    () => (relation ? applyEffectiveRevealToRelation(relation, sharedReveal) : null),
    [relation, sharedReveal],
  );

  const assistedSuggestion = id ? getAssistedReconciliationSuggestionForRelation(id) : null;
  const draftResolutionSuggestion = id ? getDraftResolutionSuggestionForRelation(id) : null;

  useEffect(() => {
    if (!relation || !effectiveRelation) return;
    if (effectiveRelation.localState.revealSnapshot.status === 'cooking_reveal') {
      if (sharedReveal) {
        const unlockAt = effectiveRelation.localState.revealSnapshot.unlockAt;
        const unlockAtMs = unlockAt ? Date.parse(unlockAt) : NaN;
        if (!Number.isFinite(unlockAtMs) || Date.now() < unlockAtMs) {
          return;
        }
        void (async () => {
          try {
            const relationshipId = relation.canonicalRelationId ?? relation.id;
            await markSharedRevealReadyIfUnlocked(relationshipId);
            await refreshSharedReveal();
          } catch {
            // Local fallback stays available when shared access is unavailable.
          }
        })();
        return;
      }
      syncRevealReadyState(relation.id);
    }
  }, [relation, effectiveRelation, sharedReveal, syncRevealReadyState, refreshSharedReveal]);

  useEffect(() => {
    if (revealUnlockTimeoutRef.current) {
      clearTimeout(revealUnlockTimeoutRef.current);
      revealUnlockTimeoutRef.current = null;
    }

    if (!relation || !sharedReveal || !effectiveRelation) return;
    if (sharedReveal.status !== 'cooking_reveal') return;

    const unlockAt = effectiveRelation.localState.revealSnapshot.unlockAt;
    if (!unlockAt) return;

    const unlockAtMs = Date.parse(unlockAt);
    if (!Number.isFinite(unlockAtMs)) return;

    const relationshipId = relation.canonicalRelationId ?? relation.id;
    const delayMs = Math.max(0, unlockAtMs - Date.now()) + 500;
    let cancelled = false;

    const markReadyAndRefresh = async () => {
      try {
        await markSharedRevealReadyIfUnlocked(relationshipId);
        if (!cancelled) {
          await refreshSharedReveal();
        }
      } catch {
        // Keep the last confirmed server state visible until a later refresh succeeds.
      }
    };

    if (Date.now() >= unlockAtMs) {
      void markReadyAndRefresh();
      return () => {
        cancelled = true;
      };
    }

    revealUnlockTimeoutRef.current = setTimeout(() => {
      revealUnlockTimeoutRef.current = null;
      void markReadyAndRefresh();
    }, delayMs);

    return () => {
      cancelled = true;
      if (revealUnlockTimeoutRef.current) {
        clearTimeout(revealUnlockTimeoutRef.current);
        revealUnlockTimeoutRef.current = null;
      }
    };
  }, [relation, sharedReveal, effectiveRelation, refreshSharedReveal]);

  // Track foreground/background to silence countdown haptics when inactive.
  useEffect(() => {
    isAppActiveRef.current = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', (next) => {
      isAppActiveRef.current = next === 'active';
    });
    return () => subscription.remove();
  }, []);

  // Cooking countdown ritual. Reads unlock_at strictly from the server snapshot
  // and computes remaining seconds locally. Never fakes a ready state — the
  // existing markReadyAndRefresh useEffect remains the only path to reveal_ready.
  useEffect(() => {
    const clear = () => {
      if (cookingCountdownIntervalRef.current) {
        clearInterval(cookingCountdownIntervalRef.current);
        cookingCountdownIntervalRef.current = null;
      }
    };

    if (!effectiveRelation || effectiveRelation.localState.revealSnapshot.status !== 'cooking_reveal') {
      clear();
      if (cookingRemainingSeconds !== null) setCookingRemainingSeconds(null);
      lastCountdownHapticSecondRef.current = null;
      return;
    }
    const unlockAt = effectiveRelation.localState.revealSnapshot.unlockAt;
    const unlockAtMs = unlockAt ? Date.parse(unlockAt) : NaN;
    if (!Number.isFinite(unlockAtMs)) {
      clear();
      if (cookingRemainingSeconds !== null) setCookingRemainingSeconds(null);
      return;
    }

    const tick = () => {
      const remainingMs = unlockAtMs - Date.now();
      const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
      setCookingRemainingSeconds(remainingSec);
      // 15-6 explains the wait; 5-1 is the opening ritual.
      // Phase 1 (>5): silent — give the user time to read and breathe.
      // Phase 2 (5→1): tactile crescendo (Light → Medium) — the link is about
      // to open. No haptic at 0: the existing handleOpenReveal success haptic
      // takes over once the server confirms reveal_ready.
      if (remainingSec > 0 && remainingSec <= 5
        && lastCountdownHapticSecondRef.current !== remainingSec
        && isAppActiveRef.current
        && process.env.EXPO_OS === 'ios'
      ) {
        lastCountdownHapticSecondRef.current = remainingSec;
        const style = remainingSec <= 2
          ? Haptics.ImpactFeedbackStyle.Medium
          : Haptics.ImpactFeedbackStyle.Light;
        void Haptics.impactAsync(style);
      }
      if (remainingSec === 0) clear();
    };
    tick();
    cookingCountdownIntervalRef.current = setInterval(tick, 250);

    return clear;
    // cookingRemainingSeconds is intentionally omitted: it changes every tick
    // and would re-create the interval. The tick reads it via setter only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveRelation]);

  if (!relation) {
    // B25: three-state resolution. While a target id is present and the grace
    // window is open, show a loading state (a forced re-sync is in flight) — never
    // the hard error at the moment the user taps the notification.
    const phase = resolveDeepLinkPhase({
      hasId: Boolean(id),
      relationFound: false,
      graceExhausted,
    });
    if (phase === 'resolving') {
      return (
        <View style={styles.screen}>
          <View style={styles.unavailableWrap}>
            <ActivityIndicator color={colors.accent.deepTeal} />
            <Text style={styles.unavailableTitle}>Ouverture…</Text>
            <Text style={styles.unavailableBody}>On amène cette relation.</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.screen}>
        <View style={styles.unavailableWrap}>
          <Text style={styles.unavailableTitle}>Relation indisponible</Text>
          <Text style={styles.unavailableBody}>Cette relation n’a pas pu être ouverte.</Text>
          <Pressable onPress={navigateAway} style={styles.unavailableCTA}>
            <Text style={styles.unavailableCTAText}>Retour au réseau</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const relationForDisplay = effectiveRelation ?? relation;
  // B5: gate on firstViewedAt so bootstrapped-revealed relations don't expose tier
  // until this side explicitly opens the reveal (cinematic, one-time, per side).
  const nameRevealed =
    relationForDisplay.localState.revealSnapshot.status === 'revealed' &&
    isRelationshipNameRevealed(relationForDisplay) &&
    relationForDisplay.localState.revealSnapshot.firstViewedAt !== undefined;
  const evaluation = reading?.foundationalEvaluation ?? null;
  // Frozen mutual values — set during cooking, preserved through reveal.
  const frozenMutualScore = relationForDisplay.localState.revealSnapshot.mutualScore;
  const frozenMutualTier  = relationForDisplay.localState.revealSnapshot.tier;
  // Single revealed source of truth: mutual when available, private as fallback.
  // Correction 3 (B10): when revealed, never fall back to private tier/score.
  // A missing mutualScore means the server didn't compute it (legacy Guard B case).
  // Fall back would silently display a unilateral score as "Shared reading" — misleading.
  // Instead, null flows through to getSharedRevealDisplayState → kind:'pending'.
  const revealedTier = nameRevealed
    ? (frozenMutualTier ?? null)
    : (reading?.linkTier ?? null);
  const revealedScore = nameRevealed
    ? (frozenMutualScore ?? null)
    : (evaluation?.score ?? null);
  const headerAccent = relation.archived ? colors.text.muted : colors.accent.deepTeal;
  const readingAccent = revealedTier ? getTierAccent(revealedTier) : colors.accent.deepTeal;
  const strongestLabel = getPillarLabel(reading?.strongestPillar ?? null);
  const weakestLabel = getPillarLabel(reading?.weakestPillar ?? null);
  const tierNarrative = getTierNarrative(revealedTier, reading?.weakestPillar ?? null);
  const tierLexicon = nameRevealed && revealedTier
    ? getRelationshipLexiconEntry(revealedTier)
    : null;
  const revealStatus = relationForDisplay.localState.revealSnapshot.status;
  const revealAwaitingLoad =
    Boolean(relation.canonicalRelationId) &&
    sharedReveal === null &&
    revealStatus === 'reveal_ready' &&
    relationForDisplay.localState.revealSnapshot.mutualScore === undefined;
  const readingVariant = getReadingCardVariant({ hasEvaluation: Boolean(evaluation), nameRevealed, revealStatus });
  const relationIdentity = getRelationSheetIdentity({
    relation,
  });
  const isSharedIdentity = relationIdentity.titleEyebrow === 'Identité partagée';
  const isScannedIdentity = relationIdentity.titleEyebrow === 'Contact scanné';
  const deliveryChannelOpened = Boolean(relation.inviteDeliveryOpenedAt);
  const nextAction = getRelationNextAction({
    relation,
    hasEvaluation: Boolean(evaluation),
    revealStatus,
    nameRevealed,
    deliveryChannelOpened,
  });
  const readingSectionLabel = nameRevealed ? 'Lecture partagée' : 'Lecture privée';
  // visibleScore is the revealed source of truth: mutual when available, private as fallback.
  const visibleScore = revealedScore;
  const sharedRevealDisplay = getSharedRevealDisplayState({ nameRevealed, visibleScore, revealedTier });
  // The primary action card stays as long as it carries a moment.
  // It is suppressed only once the real shared reading is on screen — at that point
  // the reading itself carries the meaning, and any "Next" banner becomes admin noise.
  // Intermediate states (waiting, cooking, reveal_ready, revealed-pending-score) keep the
  // card so the user always has either a CTA, an animation, or a clear message.
  const hasSharedReadingContent = sharedRevealDisplay.kind === 'score';
  const shouldShowPrimaryActionCard =
    !hasSharedReadingContent ||
    nextAction.ctaLabel !== null ||
    nextAction.ctaKind === 'resend' ||
    justCreated === '1';
  // Deeper Signal — derived from the local user's own Trust + Affinity ratings.
  // Only available when the user has a local evaluation. Bootstrap/claim relations
  // without a local reading do not render this layer (privacy by design).
  const deeperSignal = nameRevealed && evaluation
    ? getDeeperSignal({
        trust: evaluation.ratings.trust,
        affinity: evaluation.ratings.affinity,
      })
    : null;
  const safeRevealSummary = getSafeRelationshipRevealSummary(
    buildRelationshipRevealInput({
      relation: relationForDisplay,
      privateReadingA: evaluation,
    }),
  );

  const canUseOpenWorlds = canUsePrivateOpenWorlds({
    isRevealed: nameRevealed,
    trustRating: evaluation?.ratings.trust ?? null,
    isArchived: relation.archived,
  });

  // Private layer readback — locally-saved progressive private signals for THIS
  // relation, rendered without scoring, without average, without aggregation.
  // - Read only from the store map keyed by relation.id (never cross-relation).
  // - NEVER sent to the server (no derivation feeds finalRatings/score/reveal).
  // - Empty list when nothing has been noted → block not rendered.
  const privateLayerSections = useMemo(() => {
    if (!relation) return [];
    const relationSignals = progressivePrivateSignals[relation.id];
    if (!relationSignals) return [];

    type Section = {
      pillar: PillarKey;
      pillarLabel: string;
      items: Array<{ key: ProgressiveCriterionKey; label: string; rating: 1 | 2 | 3 | 4 | 5 }>;
    };
    const sections: Section[] = [];

    for (const pillar of PILLAR_ORDER) {
      const pillarSignals = relationSignals[pillar];
      if (!pillarSignals) continue;

      // Iterate the catalog in stable order, not Object.entries (which reflects
      // input order). This guarantees the readback layout matches the evaluate
      // screen and does not depend on the user's rating sequence.
      const items: Section['items'] = [];
      for (const criterion of getProgressiveCriteriaForPillar(pillar)) {
        const rating = pillarSignals[criterion.key];
        if (!rating) continue;
        items.push({
          key: criterion.key,
          label: criterion.label,
          rating: rating as 1 | 2 | 3 | 4 | 5,
        });
      }

      if (items.length > 0) {
        sections.push({ pillar, pillarLabel: getPillarLabel(pillar), items });
      }
    }

    return sections;
  }, [progressivePrivateSignals, relation]);

  const handleOpenReveal = async () => {
    if (isRevealing) return;
    setIsRevealing(true);
    revealTreeScale.setValue(0);
    revealOverlayOpacity.setValue(0);
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }

    // Grow animation acts as a minimum-duration floor — server call runs in parallel.
    const growPromise = new Promise<void>((resolve) => {
      Animated.parallel([
        Animated.timing(revealOverlayOpacity, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(revealTreeScale, { toValue: 1, duration: 820, useNativeDriver: true }),
      ]).start(() => resolve());
    });

    let updatedRecord: typeof sharedReveal = null;
    let revealError = false;
    let notReady = false;

    const serverCall = sharedReveal
      ? (async () => {
          try {
            const relationshipId = relation.canonicalRelationId ?? relation.id;
            updatedRecord = await openSharedReveal(relationshipId);
            if (!updatedRecord || updatedRecord.status !== 'revealed') {
              if (updatedRecord?.status === 'reveal_ready') {
                // Fix B (B10): Guard B fired — server reveal_ready with mutual_score IS NULL.
                // Sync local snapshot to reveal_ready (bootstrap never updates existing relations)
                // then open locally so the cinematic can play on both sides.
                syncSharedRevealToReady(relation.id, updatedRecord);
                revealMutualRelationship(relation.id);
                // Re-read from store post-mutation — never rely on openMutualRevealInState
                // return value (returns false for the already-revealed branch, line 1875).
                const snap = getRelationSnapshotById(relation.id)?.localState.revealSnapshot;
                if (snap?.status !== 'revealed' || !snap.firstViewedAt) notReady = true;
              } else {
                notReady = true;
              }
            }
          } catch {
            revealError = true;
          }
        })()
      : Promise.resolve().then(() => {
          const opened = revealMutualRelationship(relation.id);
          if (!opened) notReady = true;
        });

    await Promise.all([growPromise, serverCall]);

    // Fade overlay out before showing result.
    await new Promise<void>((resolve) => {
      Animated.timing(revealOverlayOpacity, {
        toValue: 0,
        duration: 320,
        useNativeDriver: true,
      }).start(() => resolve());
    });

    setIsRevealing(false);

    if (revealError) {
      Alert.alert('Révélation indisponible', 'La révélation partagée n’est pas disponible pour le moment.');
      return;
    }
    if (notReady) {
      Alert.alert('Révélation pas prête', 'Baobab prépare encore cette révélation.');
      return;
    }
    // Stamp firstViewedAt on every success path (server or local) so the B5 gate opens.
    // Modified openMutualRevealInState handles already-revealed relations without side effects.
    revealMutualRelationship(relation.id);
    if (sharedReveal) {
      setSharedReveal(updatedRecord);
      // Always re-fetch to ensure mutual_score is present (RPC may return it async).
      void refreshSharedReveal();
      // Recovery: if the reading payload was never uploaded during the invite flow,
      // re-attach it and re-trigger cooking. Both RPCs are idempotent — they exit early
      // when the payload is already present or the record is already beyond cooking state.
      const localEval = evaluation;
      if (localEval) {
        const relationshipId = relation.canonicalRelationId ?? relation.id;
        void (async () => {
          try {
            await attachSharedPrivateReadingReferenceForCurrentUser(
              relationshipId,
              'sideA',
              localEval.id,
              localEval.ratings,
            );
            await startSharedCookingRevealIfReady(relationshipId);
            void refreshSharedReveal();
          } catch {
            // Best-effort: pending state stays until a future load resolves it.
          }
        })();
      }
    } else if (relation.canonicalRelationId) {
      // Local reveal path can happen before the shared record finishes loading.
      // Refresh the backend record so the computed mutual score can hydrate the display.
      void refreshSharedReveal();
    }
    // Show the qualitative transition moment only after a confirmed success.
    // Both error branches above (revealError, notReady) have already returned.
    setShowSharedReadingMoment(true);
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const handleInviteToReveal = async () => {
    if (isInviteFlowActiveRef.current) return;
    isInviteFlowActiveRef.current = true;
    try {
      const canonicalId = relation.canonicalRelationId ?? newCanonicalRelationId();
      if (!relation.canonicalRelationId) {
        setCanonicalRelationId(relation.id, canonicalId);
      }
      if (isLocalDraftId(canonicalId)) {
        throw new Error('[invite] canonicalRelationId must not be a localDraftId');
      }
      const invite = await createRelationshipInviteForCurrentUser(canonicalId, 'sideA', undefined, {
        displayName: me.displayName,
        handle: me.handle,
        avatarSeed: me.avatarSeed,
      });

      // Attach local reading to the shared record so the backend state is consistent
      // before refreshSharedReveal can fire. Additive — failure does not block invite.
      if (reading?.foundationalEvaluation) {
        try {
          await attachSharedPrivateReadingReferenceForCurrentUser(
            canonicalId,
            'sideA',
            reading.foundationalEvaluation.id,
            reading.foundationalEvaluation.ratings,
          );
        } catch {
          // Best-effort: local reading stays primary.
        }
      }

      const { message, url } = getRelationshipInviteMessage({
        relationId: canonicalId,
        inviteToken: invite.invite_token,
        senderName: me.displayName,
      });
      const fullMessage = url ? `${message}\n${url}` : message;

      // For phone-anchored relations, offer targeted channels instead of the generic sheet.
      if (relation.source === 'invite_number' && relation.anchorValue) {
        void tryRegisterPhoneAnchorSilently(canonicalId, relation.anchorValue);
        showPhoneInviteSheet({
          rawPhone: relation.anchorValue,
          privateLabel: relationIdentity.privateLabel,
          fullMessage,
          onDeliveryChannelOpened: () => {
            markInviteDeliveryOpened(relation.id);
            if (process.env.EXPO_OS === 'ios') {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            }
          },
          onDismiss: () => {},
        });
        return;
      }

      // Non-phone relations: general share sheet.
      // Mark delivery channel opened only when iOS reports an activity was
      // launched. On dismissedAction (Cancel / drag-down) we stay in the
      // 'invite' state — doctrine: do not claim an invite is sent just
      // because the share sheet was opened.
      const result = await Share.share({ message: fullMessage });
      if (result.action === Share.sharedAction) {
        markInviteDeliveryOpened(relation.id);
      }
    } catch (error) {
      const description = error instanceof Error ? error.message : '';
      if (description.includes('Authentication required')) {
        Alert.alert('Connexion requise', 'Connecte-toi avec Apple pour inviter quelqu’un à révéler.');
        return;
      }
      Alert.alert('Inviter à révéler', 'Le partage n’est pas disponible pour le moment.');
    } finally {
      isInviteFlowActiveRef.current = false;
    }
  };

  const handlePrimaryAction = () => {
    if (nextAction.ctaKind === 'evaluate') {
      router.push(`./evaluate/${relation.id}`);
      return;
    }
    if (nextAction.ctaKind === 'invite' || nextAction.ctaKind === 'resend') {
      if (process.env.EXPO_OS === 'ios') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      void handleInviteToReveal();
      return;
    }
    if (nextAction.ctaKind === 'reveal') {
      void handleOpenReveal();
    }
  };

  const handleArchive = () => {
    Alert.alert(
      'Archiver la relation',
      'La retire de ton réseau actif.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Archiver',
          style: 'destructive',
          onPress: () => {
            archiveRelation(relation.id);
            navigateAway();
          },
        },
      ],
    );
  };

  return (
    <>
    <Stack.Screen
      options={{
        title: getHeaderTitle(relationIdentity.privateLabel, nextAction.ctaKind),
        headerShown: false,
      }}
    />
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Pressable onPress={navigateAway} style={styles.backRow} hitSlop={8}>
        <Text style={styles.backRowText}>‹ Retour</Text>
      </Pressable>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: headerAccent + '14', borderColor: headerAccent + '44' }]}>
          <Text style={[styles.avatarText, { color: headerAccent }]}>
            {(relation.avatarSeed || relationIdentity.privateLabel.charAt(0) || '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.identityBlock}>
          {!nameRevealed ? (
            <View
              style={[
                styles.identityEyebrowBadge,
                isSharedIdentity
                  ? styles.identityEyebrowBadgeShared
                  : isScannedIdentity
                    ? styles.identityEyebrowBadgeScanned
                    : styles.identityEyebrowBadgePrivate,
              ]}
            >
              <Text
                style={[
                  styles.identityEyebrow,
                  isSharedIdentity
                    ? styles.identityEyebrowShared
                    : isScannedIdentity
                      ? styles.identityEyebrowScanned
                      : styles.identityEyebrowPrivate,
                ]}
              >
                {relationIdentity.titleEyebrow}
              </Text>
            </View>
          ) : null}
          <Text style={styles.name}>{relationIdentity.primaryTitle}</Text>
          {relationIdentity.supportingText ? (
            <Text style={styles.identitySupport}>{relationIdentity.supportingText}</Text>
          ) : null}
        </View>
      </View>

      {!nameRevealed && (
        <View style={styles.metaZone}>
          <View style={styles.stateRow}>
            <View style={styles.statusChip}>
              <Text style={styles.statusChipText}>{relationIdentity.stateLabel}</Text>
            </View>
            <Pressable onPress={() => router.push(`./edit/${relation.id}`)} style={styles.editLink}>
              <Text style={styles.editLinkText}>Modifier la relation</Text>
            </Pressable>
          </View>

          {nextAction.ctaKind !== 'resend' && (
            <>
              {relation.source !== 'manual' && (
                <View style={styles.anchorCard}>
                  <Text style={styles.anchorCardLabel}>{relationIdentity.anchorLabel}</Text>
                  <Text style={styles.anchorCardValue}>{relationIdentity.anchorValue}</Text>
                  {relationIdentity.anchorHint ? (
                    <Text style={styles.anchorCardHint}>{relationIdentity.anchorHint}</Text>
                  ) : null}
                </View>
              )}

              <View style={styles.depthRow}>
                <Text style={styles.depthLabel}>Profondeur</Text>
                <Text style={styles.depthValue}>{relationIdentity.relationDepthLabel}</Text>
              </View>
            </>
          )}
        </View>
      )}

      {shouldShowPrimaryActionCard ? (
        <View style={[
          styles.primaryActionCard,
          nextAction.ctaKind === 'resend' && styles.primaryActionCardPending,
          justCreated === '1' && !evaluation && nextAction.ctaKind !== 'resend' && styles.primaryActionCardHighlight,
        ]}>
          {nextAction.ctaKind === 'resend' ? (
            <Text style={styles.pendingKicker}>Baobab</Text>
          ) : (
            <Text style={styles.primaryActionEyebrow}>À suivre</Text>
          )}
          <Text style={styles.primaryActionTitle}>{nextAction.title}</Text>
          <Text style={styles.primaryActionBody}>{nextAction.body}</Text>
          {nextAction.ctaKind === 'resend' ? (
            <Pressable onPress={handlePrimaryAction} style={styles.resendTreeBtn}>
              <View style={styles.baoTreeIcon}>
                <View style={styles.baoTreeCrown}>
                  <View style={styles.baoLeaf} />
                  <View style={[styles.baoLeaf, styles.baoLeafCenter]} />
                  <View style={styles.baoLeaf} />
                </View>
                <View style={styles.baoTrunk} />
              </View>
              <Text style={styles.resendTreeLabel}>Renvoyer</Text>
            </Pressable>
          ) : nextAction.ctaLabel ? (
            <Pressable onPress={handlePrimaryAction} style={styles.ctaButton} disabled={isRevealing || revealAwaitingLoad}>
              <Text style={styles.ctaButtonText}>{revealAwaitingLoad ? 'Préparation de la révélation…' : nextAction.ctaLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {nextAction.ctaKind !== 'resend' && (
        (evaluation || nameRevealed) ? (
          <View style={styles.readingSection}>
            {!nameRevealed ? (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionLabel}>{readingSectionLabel}</Text>
                <View style={styles.sectionLine} />
              </View>
            ) : null}

            <View style={styles.readingCard}>
              {readingVariant === 'revealed' ? (
                sharedRevealDisplay.kind === 'score' ? (
                  <>
                    {/* B18: the counterpart's name dominates the reveal card;
                        the tier is demoted to a subtitle under it. */}
                    <View style={styles.revealNameHeader}>
                      <Text style={styles.readingCardKicker}>{'BAOBAB · LECTURE PARTAGÉE'}</Text>
                      <Text style={styles.revealName}>{relationIdentity.primaryTitle}</Text>
                      <Text style={[styles.revealTierSubtitle, { color: readingAccent }]}>
                        {revealedTier ? getTierDisplayLabel(revealedTier) : sharedRevealDisplay.tier}
                      </Text>
                    </View>
                    <View style={styles.tierHeader}>
                      {tierLexicon ? (
                        <Text style={styles.tierDefinition}>{tierLexicon.definition}</Text>
                      ) : null}
                    </View>

                    {revealedTier ? (
                      <View style={styles.narrativeCard}>
                        {evaluation ? (
                          <>
                            {reading?.strongestPillar ? (
                              <Text style={styles.narrativeLine}>
                                <Text style={styles.narrativeKey}>Là où c’est fort :</Text> {strongestLabel}
                              </Text>
                            ) : null}
                            {reading?.weakestPillar ? (
                              <Text style={styles.narrativeLine}>
                                <Text style={styles.narrativeKey}>Là où ça peut grandir :</Text> {weakestLabel}
                              </Text>
                            ) : null}
                          </>
                        ) : null}
                        <Text style={styles.narrativeReading}>
                          {tierNarrative}
                        </Text>
                      </View>
                    ) : null}
                    {nameRevealed && revealedTier ? (
                      <View style={styles.doctrineCapsule}>
                        <Text style={styles.doctrineCapsuleText}>
                          {getReadingNoteText(nameRevealed, revealStatus)}
                        </Text>
                      </View>
                    ) : null}
                    {evaluation ? (
                      <View style={styles.pillarsSection}>
                        <Text style={styles.signalsEyebrow}>Ta lecture</Text>
                        {PILLAR_ORDER.map((key) => {
                          const dots = reading?.pillarDots?.[key] ?? [];
                          return (
                            <View key={key} style={styles.pillarRow}>
                              <Text style={styles.pillarLabel}>{getPillarLabel(key)}</Text>
                              <View style={styles.pillarDots}>
                                {dots.map((isFilled, idx) => (
                                  <View
                                    key={idx}
                                    style={[
                                      styles.pillarDot,
                                      isFilled
                                        ? { backgroundColor: readingAccent }
                                        : { backgroundColor: colors.border.soft },
                                    ]}
                                  />
                                ))}
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    ) : null}
                    {deeperSignal ? (
                      <View style={styles.deeperSignalBlock}>
                        <Text style={styles.deeperSignalEyebrow}>Une lecture plus profonde</Text>
                        {deeperSignal.lines.map((line, idx) => (
                          <Text key={idx} style={styles.deeperSignalLine}>{line}</Text>
                        ))}
                        <Text style={styles.deeperSignalAttribution}>D’après ta lecture privée.</Text>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <View style={styles.privateStateCard}>
                    <Text style={styles.privateStateTitle}>On amène ta lecture partagée…</Text>
                    <Text style={styles.privateStateText}>Un instant.</Text>
                  </View>
                )
              ) : readingVariant === 'reveal_ready' ? (
                <View style={styles.revealReadyCard}>
                  <Text style={styles.privateStateDate}>
                    Enregistrée le {evaluation?.createdAt ? new Date(evaluation.createdAt).toLocaleDateString() : null}
                  </Text>
                  <Text style={styles.revealReadyTitle}>Lecture partagée prête</Text>
                  <Text style={styles.privateStateText}>
                    Ouvre-la au-dessus.
                  </Text>
                </View>
              ) : (
                <View style={styles.privateStateCard}>
                  <Text style={styles.privateStateDate}>
                    Enregistrée le {evaluation?.createdAt ? new Date(evaluation.createdAt).toLocaleDateString() : null}
                  </Text>
                  {readingVariant === 'waiting_other_side' ? (
                    <>
                      <Text style={styles.privateStateTitle}>Lecture privée enregistrée</Text>
                      <Text style={styles.privateStateText}>En attente de son côté.</Text>
                    </>
                  ) : readingVariant === 'cooking' ? (
                    cookingRemainingSeconds !== null && cookingRemainingSeconds > 0 ? (
                      <>
                        <Text style={styles.privateStateTitle}>
                          {cookingRemainingSeconds <= 5 ? 'Presque ouvert' : 'Ouverture de ton lien…'}
                        </Text>
                        <Text style={styles.cookingCountdown}>
                          {cookingRemainingSeconds}s
                        </Text>
                      </>
                    ) : (
                      <>
                        <Text style={styles.privateStateTitle}>Lecture privée enregistrée</Text>
                        <Text style={styles.privateStateText}>
                          Verrouillée jusqu’à l’ouverture de la révélation.
                        </Text>
                      </>
                    )
                  ) : (
                    <>
                      <Text style={styles.privateStateTitle}>{safeRevealSummary?.stateLabel}</Text>
                      <Text style={styles.privateStateText}>{safeRevealSummary?.shortDescription}</Text>
                    </>
                  )}
                  {evaluation && reading?.pillarDots ? (
                    <View style={styles.privateReadbackBlock}>
                      <Text style={styles.privateReadbackEyebrow}>Ta lecture</Text>
                      {PILLAR_ORDER.map((key) => {
                        const dots = reading.pillarDots?.[key] ?? [];
                        return (
                          <View key={key} style={styles.privateReadbackRow}>
                            <Text style={styles.privateReadbackPillarLabel}>{getPillarLabel(key)}</Text>
                            <View style={styles.privateReadbackDots}>
                              {dots.map((isFilled, idx) => (
                                <View
                                  key={idx}
                                  style={[
                                    styles.privateReadbackDot,
                                    isFilled && styles.privateReadbackDotFilled,
                                  ]}
                                />
                              ))}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              )}
            </View>

            {nextAction.ctaKind === 'invite' && evaluation ? (
              <View style={styles.mutualRevealMomentBlock}>
                <Text style={styles.mutualRevealMomentEyebrow}>Révélation mutuelle</Text>
                <Text style={styles.mutualRevealMomentTitle}>
                  Prêt·e à comprendre cette relation ensemble ?
                </Text>
                <Text style={styles.mutualRevealMomentBody}>
                  Ta lecture reste privée. Invite-la seulement quand tu veux une révélation mutuelle.
                </Text>
              </View>
            ) : null}

            {privateLayerSections.length > 0 ? (
              <View style={styles.privateLayerBlock}>
                <Text style={styles.privateLayerEyebrow}>Couche privée</Text>
                <Text style={styles.privateLayerSubtitle}>Seulement sur cet appareil. Non partagé.</Text>
                {privateLayerSections.map((section) => (
                  <View key={section.pillar} style={styles.privateLayerSection}>
                    <Text style={styles.privateLayerPillarLabel}>{section.pillarLabel}</Text>
                    {section.items.map((item) => (
                      <View key={item.key} style={styles.privateLayerRow}>
                        <Text style={styles.privateLayerCriterionLabel}>{item.label}</Text>
                        <View style={styles.privateLayerDots}>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <View
                              key={n}
                              style={[
                                styles.privateLayerDot,
                                n <= item.rating && styles.privateLayerDotFilled,
                              ]}
                            />
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            ) : null}

            {nameRevealed || (nextAction.ctaKind === 'invite' && evaluation) ? null : (
              <View style={styles.readingNote}>
                <Text style={styles.readingNoteText}>
                  {getReadingNoteText(nameRevealed, revealStatus)}
                </Text>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.unreadSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{readingSectionLabel}</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.unreadCard}>
              <Text style={styles.unreadTitle}>Pas encore de lecture</Text>
              <Text style={styles.unreadText}>
                Reste privée jusqu’à ce que les deux côtés y soient.
              </Text>
            </View>
          </View>
        )
      )}

      {assistedSuggestion ? (
        <View style={styles.reconciliationCard}>
          <Text style={styles.reconciliationTitle}>Brouillon local possible trouvé</Text>
          <Text style={styles.reconciliationBody}>
            Tu as aussi un brouillon local lié à ce même profil public. Regarde-le avant de décider quoi garder.
          </Text>
          <Pressable
            onPress={() => router.push(`/relation/${assistedSuggestion.draftRelationId}`)}
            style={styles.reconciliationCTA}
          >
            <Text style={styles.reconciliationCTAText}>Ouvrir le brouillon local</Text>
          </Pressable>
        </View>
      ) : null}

      {draftResolutionSuggestion ? (
        <View style={styles.reconciliationCard}>
          <Text style={styles.reconciliationTitle}>Relation partagée possible trouvée</Text>
          <Text style={styles.reconciliationBody}>
            Ce brouillon semble lié à un profil public déjà présent dans une relation partagée. Si tu n’as plus besoin de ce brouillon local, tu peux l’archiver.
          </Text>
          <Pressable
            onPress={() => router.push(`/relation/${draftResolutionSuggestion.sharedRelationId}`)}
            style={styles.reconciliationCTA}
          >
            <Text style={styles.reconciliationCTAText}>Ouvrir la relation partagée</Text>
          </Pressable>
          <Pressable
            onPress={() => { archiveRelation(draftResolutionSuggestion.draftRelationId); router.replace('/(tabs)'); }}
            style={styles.draftResolutionArchive}
          >
            <Text style={styles.draftResolutionArchiveText}>Archiver ce brouillon</Text>
          </Pressable>
        </View>
      ) : null}

      {canUseOpenWorlds && (
        <View style={styles.openWorldsBlock}>
          <Text style={styles.openWorldsEyebrow}>{'MONDES PRIVÉS'}</Text>
          <Text style={styles.openWorldsCaption}>
            {'Seulement sur cet appareil — jusqu’à 3.'}
          </Text>
          <View style={styles.openWorldsChipRow}>
            {RELATION_OPEN_WORLD_OPTIONS.map((world) => {
              const selected = (relation.privateOpenWorlds ?? []).includes(world);
              const atMax = (relation.privateOpenWorlds?.length ?? 0) >= 3;
              const disabled = !selected && atMax;
              return (
                <Pressable
                  key={world}
                  onPress={() => {
                    const current = relation.privateOpenWorlds ?? [];
                    const next = selected
                      ? current.filter((w) => w !== world)
                      : [...current, world];
                    setRelationPrivateOpenWorlds(relation.id, next);
                  }}
                  disabled={disabled}
                  style={[
                    styles.openWorldChip,
                    selected && styles.openWorldChipSelected,
                    disabled && styles.openWorldChipDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.openWorldChipText,
                      selected && styles.openWorldChipTextSelected,
                    ]}
                  >
                    {getRelationOpenWorldLabel(world)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {!relation.archived && nextAction.ctaKind !== 'resend' && (
        <View style={styles.managementZone}>
          <Pressable onPress={handleArchive} style={styles.archiveAction}>
            <Text style={styles.archiveActionText}>Archiver la relation</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
    {/* B13: the reveal cinematic overlay is rendered at SCREEN scale (sibling of
        the ScrollView), not inside the action card. At card scale a ScrollView
        overscroll bounce exposed the content beneath it during the animation.
        Screen scale covers the whole viewport, including the bounce region. */}
    {isRevealing ? (
      <Animated.View
        style={[
          StyleSheet.absoluteFillObject,
          styles.revealOverlay,
          { opacity: revealOverlayOpacity },
        ]}
      >
        <Animated.View
          style={[
            styles.revealTree,
            {
              transform: [
                {
                  scale: revealTreeScale.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.05, 1],
                  }),
                },
              ],
            },
          ]}
        >
          <View style={styles.revealCanopy} />
          <View style={styles.revealTrunk} />
        </Animated.View>
      </Animated.View>
    ) : null}
    {showSharedReadingMoment ? (
      <View style={styles.sharedReadingMomentOverlay}>
        <View style={styles.sharedReadingMomentCard}>
          <View style={styles.sharedReadingMomentSeal}>
            <View style={styles.sharedReadingMomentSeed} />
          </View>
          <Text style={styles.sharedReadingMomentEyebrow}>Lecture partagée</Text>
          <Text style={styles.sharedReadingMomentTitle}>Lien ouvert</Text>
          <Text style={styles.sharedReadingMomentSubtitle}>Une direction, pas un verdict.</Text>
          <Pressable
            onPress={() => setShowSharedReadingMoment(false)}
            style={styles.sharedReadingMomentContinue}
            accessibilityRole="button"
          >
            <Text style={styles.sharedReadingMomentContinueText}>Continuer</Text>
          </Pressable>
        </View>
      </View>
    ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    padding: spacing.lg,
    paddingTop: 52,
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },
  backRow: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
    paddingRight: spacing.md,
    marginTop: -spacing.xs,
  },
  backRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
  },
  unavailableWrap: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.md,
  },
  unavailableTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  unavailableBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  unavailableCTA: {
    alignSelf: 'flex-start',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    backgroundColor: colors.background.secondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  unavailableCTAText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },

  header: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.md,
  },
  // Baobab brand block inside the reading card — the brand signs the
  // reading object, not the person. Mirrors the arrival kicker pair
  // (BAOBAB + sub-label) but lives inside the card so the hero above
  // can honor the relation (avatar + name + handle) without competing
  // signals. No seed here: the warm-gold border/glow of readingCard
  // already carries the visual signature.
  readingCardBrand: {
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  readingCardKicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 4,
    color: colors.accent.warmGold,
    textAlign: 'center',
  },
  readingCardSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.4,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  // B18: name-dominant reveal header.
  revealNameHeader: {
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.xs,
  },
  revealName: {
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '800',
    letterSpacing: -0.6,
    color: colors.text.primary,
    textAlign: 'center',
  },
  revealTierSubtitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.6,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  identityBlock: {
    alignItems: 'center',
    gap: spacing.xs,
    maxWidth: 320,
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
    textAlign: 'center',
  },
  identityEyebrow: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  identityEyebrowBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs - 1,
    borderWidth: 1,
  },
  identityEyebrowBadgePrivate: {
    backgroundColor: colors.background.secondary,
    borderColor: colors.border.soft,
  },
  identityEyebrowBadgeScanned: {
    backgroundColor: colors.accent.deepTeal + '10',
    borderColor: colors.accent.deepTeal + '22',
  },
  identityEyebrowBadgeShared: {
    backgroundColor: colors.accent.warmGold + '12',
    borderColor: colors.accent.warmGold + '33',
  },
  identityEyebrowPrivate: {
    color: colors.text.muted,
  },
  identityEyebrowScanned: {
    color: colors.accent.deepTeal,
  },
  identityEyebrowShared: {
    color: colors.accent.warmGold,
  },
  identitySupport: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  metaZone: {
    gap: spacing.xs,
  },
  stateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  statusChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  statusChipText: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: colors.text.secondary,
    fontWeight: '700',
  },
  anchorCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  anchorCardLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.text.muted,
    fontWeight: '700',
  },
  anchorCardValue: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  anchorCardHint: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  editLink: {
    alignSelf: 'auto',
    paddingVertical: spacing.xs,
  },
  editLinkText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  depthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  depthLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.text.muted,
  },
  depthValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent.deepTeal,
  },
  primaryActionCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent.deepTeal + '44',
    padding: spacing.lg,
    gap: spacing.sm,
    overflow: 'hidden',
  },
  revealOverlay: {
    // Screen-scale (B13): no borderRadius — this now fills the viewport.
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  revealTree: {
    alignItems: 'center',
    gap: 6,
  },
  revealCanopy: {
    width: 76,
    height: 56,
    borderRadius: 38,
    backgroundColor: colors.accent.leafGreen + '66',
    borderWidth: 2,
    borderColor: colors.accent.leafGreen + 'BB',
    shadowColor: colors.accent.leafGreen,
    shadowOpacity: 0.75,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 0 },
  },
  revealTrunk: {
    width: 10,
    height: 26,
    borderRadius: 5,
    backgroundColor: colors.accent.warmGold + 'CC',
  },
  primaryActionCardHighlight: {
    borderColor: colors.accent.warmGold + '55',
    backgroundColor: colors.accent.warmGold + '10',
  },
  primaryActionEyebrow: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    color: colors.accent.deepTeal,
    fontWeight: '700',
  },
  primaryActionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text.primary,
  },
  primaryActionBody: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
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
    marginTop: spacing.md,
  },
  readingCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '33',
    padding: spacing.lg + 2,
    gap: spacing.md,
    shadowColor: colors.accent.warmGold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 2,
  },
  tierHeader: {
    gap: spacing.sm,
  },
  tierTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  tierName: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  tierDefinition: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  tierDate: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  signalsEyebrow: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: spacing.xs,
  },
  pillarsSection: {
    gap: spacing.sm,
  },
  pillarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pillarLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  pillarDots: {
    flexDirection: 'row',
    gap: 5,
  },
  pillarDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  narrativeCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  // Doctrine capsule — a small warm-gold tinted note that carries the
  // doctrinal cue ("A shared reading is a direction, not a verdict.")
  // directly inside the revealed reading card, right after the narrative.
  // The string is sourced from getReadingNoteText so it never duplicates.
  // The bottom readingNote is hidden when nameRevealed to avoid double rendering.
  doctrineCapsule: {
    backgroundColor: colors.accent.warmGold + '10',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '38',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  doctrineCapsuleText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.primary,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  narrativeLine: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },
  narrativeReading: {
    fontSize: 13,
    color: colors.text.primary,
    lineHeight: 20,
  },
  narrativeKey: {
    fontWeight: '700',
    color: colors.text.primary,
  },
  deeperSignalBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  deeperSignalEyebrow: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
    marginBottom: spacing.xs,
  },
  deeperSignalLine: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.primary,
  },
  deeperSignalAttribution: {
    fontSize: 11,
    color: colors.text.muted,
    fontStyle: 'italic',
    marginTop: spacing.xs,
  },
  privateStateCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  privateStateTitle: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '700',
  },
  privateStateText: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  cookingCountdown: {
    fontSize: 28,
    color: colors.accent.warmGold,
    fontWeight: '700',
    letterSpacing: -0.5,
    marginTop: spacing.xs,
  },
  privateStateDate: {
    fontSize: 11,
    color: colors.text.muted,
  },
  revealReadyCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.deepTeal + '55',
    padding: spacing.md,
    gap: spacing.xs,
  },
  revealReadyTitle: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '700',
    marginTop: spacing.xs,
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

  privateLayerBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
    gap: spacing.sm,
  },
  privateLayerEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.text.muted,
  },
  privateLayerSubtitle: {
    fontSize: 11,
    fontStyle: 'italic',
    color: colors.text.muted,
  },
  privateLayerSection: {
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  privateLayerPillarLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 0.2,
  },
  privateLayerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingLeft: spacing.sm,
  },
  privateLayerCriterionLabel: {
    fontSize: 12,
    color: colors.text.primary,
    flex: 1,
  },
  privateLayerDots: {
    flexDirection: 'row',
    gap: 4,
  },
  privateLayerDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border.soft + '88',
    backgroundColor: 'transparent',
  },
  privateLayerDotFilled: {
    borderColor: colors.accent.warmGold + 'AA',
    backgroundColor: colors.accent.warmGold + '55',
  },

  // Pre-reveal private pillar readback. Deep-teal so it does not compete with
  // the warmGold progressive private layer block — two visual tones, two
  // semantic layers: cool = your read of the link, warm = deeper signals.
  privateReadbackBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
    gap: 2,
  },
  privateReadbackEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.text.muted,
    marginBottom: spacing.xs,
  },
  privateReadbackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  privateReadbackPillarLabel: {
    fontSize: 12,
    color: colors.text.secondary,
    letterSpacing: 0.2,
  },
  privateReadbackDots: {
    flexDirection: 'row',
    gap: 4,
  },
  privateReadbackDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border.soft + '88',
    backgroundColor: 'transparent',
  },
  privateReadbackDotFilled: {
    borderColor: colors.accent.deepTeal + 'AA',
    backgroundColor: colors.accent.deepTeal + '55',
  },

  // Post-save invite moment. Calm microcopy block — no button, no accent
  // color, no fill. The actual invite CTA lives in primaryActionCard above;
  // this block exists to give the action emotional context, not to duplicate.
  mutualRevealMomentBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border.soft,
  },
  mutualRevealMomentEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.text.muted,
  },
  mutualRevealMomentTitle: {
    fontSize: 15,
    lineHeight: 21,
    color: colors.text.primary,
    fontWeight: '500',
  },
  mutualRevealMomentBody: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },

  unreadSection: {
    gap: spacing.md,
    marginTop: spacing.md,
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
  primaryActionCardPending: {
    borderColor: colors.accent.warmGold + '33',
    backgroundColor: colors.background.secondary,
  },
  pendingKicker: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
    color: colors.accent.warmGold,
  },
  resendTreeBtn: {
    alignSelf: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  baoTreeIcon: {
    alignItems: 'center',
    gap: 2,
  },
  baoTreeCrown: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  baoLeaf: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.accent.leafGreen,
  },
  baoLeafCenter: {
    marginBottom: 4,
  },
  baoTrunk: {
    width: 4,
    height: 10,
    borderRadius: 2,
    backgroundColor: colors.accent.warmGold,
  },
  resendTreeLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.text.muted,
  },

  reconciliationCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  reconciliationTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  reconciliationBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  reconciliationCTA: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    backgroundColor: colors.background.tertiary,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  reconciliationCTAText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.primary,
  },
  draftResolutionArchive: {
    alignItems: 'center',
    paddingVertical: spacing.xs + 2,
  },
  draftResolutionArchiveText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
    textDecorationLine: 'underline',
  },
  managementZone: {
    alignItems: 'center',
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  archiveAction: {
    paddingVertical: spacing.xs,
  },
  archiveActionText: {
    fontSize: 12,
    color: colors.text.muted,
    textDecorationLine: 'underline',
  },

  // ── Private Worlds ──────────────────────────────────────────────────────────

  openWorldsBlock: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border.soft,
    padding: spacing.md,
    gap: spacing.sm,
  },
  openWorldsEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2.5,
    color: colors.text.muted,
  },
  openWorldsCaption: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 18,
  },
  openWorldsChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  openWorldChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
  },
  openWorldChipSelected: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold + '18',
  },
  openWorldChipDisabled: {
    opacity: 0.4,
  },
  openWorldChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  openWorldChipTextSelected: {
    color: colors.accent.warmGold,
  },

  // ── Shared reading transition moment (local-only) ───────────────────────────
  // Sober overlay shown once after a successful reveal. No score, no tier,
  // no percentage. Just a doctrine cue ("direction, not a verdict") and a
  // Continue button. Dismissing it does not persist anything.
  sharedReadingMomentOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background.primary + 'F2',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  sharedReadingMomentCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '55',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg + 4,
    gap: spacing.sm,
    shadowColor: colors.accent.warmGold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 3,
  },
  sharedReadingMomentSeal: {
    alignItems: 'center',
    marginBottom: 2,
  },
  sharedReadingMomentSeed: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.accent.warmGold + '38',
    borderWidth: 1,
    borderColor: colors.accent.warmGold + 'BB',
    shadowColor: colors.accent.warmGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  sharedReadingMomentEyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    color: colors.accent.warmGold,
    textAlign: 'center',
  },
  sharedReadingMomentTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  sharedReadingMomentSubtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
    fontStyle: 'italic',
    marginBottom: spacing.sm,
  },
  sharedReadingMomentContinue: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent.softAmber,
    shadowColor: colors.accent.softAmber,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 2,
  },
  sharedReadingMomentContinueText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
  },
});
