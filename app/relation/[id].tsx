import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { devLogLinking, maskIdForLog } from '../../lib/dev-linking-log';
import { isLocalDraftId, newCanonicalRelationId } from '../../lib/identity';
import { radius, spacing } from '../../constants/spacing';
import { getTierAccent, type PillarKey } from '../../lib/evaluation';
import {
  getFoundationalReadingForRelation,
  getGrowthSuggestion,
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
  createRelationshipInviteForCurrentUser,
  getSharedRevealRecordForCurrentUser,
  markSharedRevealReadyIfUnlocked,
  openSharedReveal,
} from '../../lib/reveal-shared-repo';
import { useRelationsStore } from '../../store/useRelationsStore';

const PILLAR_ORDER: PillarKey[] = [
  'trust',
  'interactions',
  'affinity',
  'support',
  'sharedNetwork',
];

export default function RelationDetailScreen() {
  const { id, justCreated } = useLocalSearchParams<{ id: string; justCreated?: string }>();
  const { relations, evaluations, syncRevealReadyState, revealMutualRelationship, setCanonicalRelationId, archiveRelation, getAssistedReconciliationSuggestionForRelation, getDraftResolutionSuggestionForRelation } = useRelationsStore();
  const [sharedReveal, setSharedReveal] = useState<Awaited<
    ReturnType<typeof getSharedRevealRecordForCurrentUser>
  > | null>(null);

  const relation = useMemo(
    () => relations.find((r) => r.id === id) ?? null,
    [relations, id],
  );

  const reading = useMemo(
    () => (relation ? getFoundationalReadingForRelation(relation, evaluations) : null),
    [relation, evaluations],
  );

  const refreshSharedReveal = useCallback(async () => {
    if (!relation) {
      setSharedReveal(null);
      return;
    }
    try {
      const record = await getSharedRevealRecordForCurrentUser(relation.id);
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
            await markSharedRevealReadyIfUnlocked(relation.id);
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

  if (!relation) {
    return (
      <View style={styles.screen}>
        <View style={styles.unavailableWrap}>
          <Text style={styles.unavailableTitle}>Relationship unavailable</Text>
          <Text style={styles.unavailableBody}>This relationship could not be opened.</Text>
          <Pressable onPress={navigateAway} style={styles.unavailableCTA}>
            <Text style={styles.unavailableCTAText}>Back to network</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const relationForDisplay = effectiveRelation ?? relation;
  const nameRevealed =
    relationForDisplay.localState.revealSnapshot.status === 'revealed' &&
    isRelationshipNameRevealed(relationForDisplay);
  const evaluation = reading?.foundationalEvaluation ?? null;
  const accent = nameRevealed && reading?.linkTier
    ? getTierAccent(reading.linkTier)
    : colors.text.muted;
  const badgeLabel = reading?.badgeLabel ?? 'Unread';
  const identityLabel = relation.identityStatus === 'verified' ? 'Verified by scan' : 'Added manually';
  const identitySubtext = relation.identityStatus === 'verified' && relation.sourceHandle
    ? `Scanned from ${relation.sourceHandle}`
    : null;

  const isSharedBacked =
    !!relation.canonicalRelationId ||
    relation.source === 'bootstrap' ||
    relation.source === 'claim';
  const relationContextCard: { title: string; body: string } | null = relation.archived
    ? {
        title: 'Archived relation',
        body: 'This relation is archived locally and no longer appears in your active trust network.',
      }
    : isSharedBacked
      ? {
          title: 'Shared-backed relation',
          body: 'This relation is backed by a shared record. Shared status does not imply a merged local history.',
        }
      : relation.source === 'scan'
        ? {
            title: 'Local scan draft',
            body: 'This is a local draft created from a scanned public profile. It is not a shared relation.',
          }
        : relation.source === 'manual'
          ? {
              title: 'Local draft',
              body: 'This relation currently exists only on this device and is not shared.',
            }
          : null;
  const shouldHighlightReadNext = justCreated === '1' && !evaluation;
  const strongestLabel = getPillarLabel(reading?.strongestPillar ?? null);
  const weakestLabel = getPillarLabel(reading?.weakestPillar ?? null);
  const tierNarrative = getTierNarrative(reading?.linkTier ?? null, reading?.weakestPillar ?? null);
  const growthSuggestion = getGrowthSuggestion(
    reading?.weakestPillar ?? null,
    reading?.linkTier ?? null,
  );
  const tierLexicon = nameRevealed && reading?.linkTier
    ? getRelationshipLexiconEntry(reading.linkTier)
    : null;
  const visibleTierLabel = nameRevealed && evaluation ? badgeLabel : evaluation ? 'Private reading' : 'Unread';
  const revealStatus = relationForDisplay.localState.revealSnapshot.status;
  const frozenMutualScore = relationForDisplay.localState.revealSnapshot.mutualScore;
  const frozenMutualTier = relationForDisplay.localState.revealSnapshot.tier;
  const visibleScore = nameRevealed
    ? (frozenMutualScore ?? evaluation?.score ?? null)
    : null;
  const visibleScoreTier = nameRevealed
    ? (frozenMutualTier ?? evaluation?.tier ?? 'Private reading')
    : 'Private reading';
  const safeRevealSummary = getSafeRelationshipRevealSummary(
    buildRelationshipRevealInput({
      relation: relationForDisplay,
      privateReadingA: evaluation,
    }),
  );

  const handleOpenReveal = async () => {
    if (sharedReveal) {
      try {
        const updated = await openSharedReveal(relation.id);
        setSharedReveal(updated);
        if (!updated || updated.status !== 'revealed') {
          Alert.alert('Reveal not ready', 'Baobab is still preparing this reveal.');
        }
        return;
      } catch {
        Alert.alert('Reveal unavailable', 'Shared reveal is not available right now.');
        return;
      }
    }

    const opened = revealMutualRelationship(relation.id);
    if (!opened) {
      Alert.alert('Reveal not ready', 'Baobab is still preparing this reveal.');
    }
  };

  const openTierInfo = () => {
    if (!tierLexicon) return;
    Alert.alert(
      tierLexicon.canonicalName,
      `Color: ${tierLexicon.colorLabel}\n\n${tierLexicon.definition}`,
    );
  };

  const handleInviteToReveal = async () => {
    try {
      // Ensure a canonical relation ID exists before promoting this relation to shared.
      // If absent, generate a new UUID and persist it — idempotent on subsequent invites.
      // This UUID replaces relation.id (localDraftId) as the backend relationship_id.
      const canonicalId = relation.canonicalRelationId ?? newCanonicalRelationId();
      if (!relation.canonicalRelationId) {
        setCanonicalRelationId(relation.id, canonicalId);
      }
      // Hard guard: never send a localDraftId to the backend as a relation join key.
      if (isLocalDraftId(canonicalId)) {
        throw new Error('[invite] canonicalRelationId must not be a localDraftId');
      }
      const invite = await createRelationshipInviteForCurrentUser(canonicalId, 'sideA');
      const { message, url } = getRelationshipInviteMessage({
        relationId: canonicalId,
        inviteToken: invite.invite_token,
      });
      await Share.share({ message: url ? `${message}\n${url}` : message });
    } catch (error) {
      const description = error instanceof Error ? error.message : '';
      if (description.includes('Authentication required')) {
        Alert.alert('Sign in required', 'Sign in with Apple to invite someone to reveal.');
        return;
      }
      Alert.alert('Invite to reveal', 'Sharing is not available right now.');
    }
  };

  const handleBackToGarden = () => {
    router.replace('/(tabs)');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: accent + '14', borderColor: accent + '44' }]}>
          <Text style={[styles.avatarText, { color: accent }]}>
            {(relation.avatarSeed || relation.name.charAt(0) || '?').toUpperCase()}
          </Text>
        </View>
        <Text style={styles.name}>{relation.name}</Text>
        {relation.handle ? <Text style={styles.handle}>{relation.handle}</Text> : null}
        <View style={styles.tierRow}>
          <View style={[styles.tierBadge, { backgroundColor: accent + '16' }]}>
            <Text style={[styles.tierBadgeText, { color: accent }]}>
              {evaluation && nameRevealed ? `${visibleTierLabel} · ${evaluation.score}` : visibleTierLabel}
            </Text>
          </View>
          {tierLexicon ? (
            <Pressable onPress={openTierInfo} style={styles.infoButton}>
              <Text style={styles.infoButtonText}>i</Text>
            </Pressable>
          ) : null}
        </View>
        <Pressable onPress={() => router.push(`./edit/${relation.id}`)} style={styles.editLink}>
          <Text style={styles.editLinkText}>Edit relation</Text>
        </Pressable>
      </View>

      <View style={styles.originCard}>
        <Text style={styles.originLabel}>{identityLabel}</Text>
        {identitySubtext ? (
          <Text style={styles.originSubtext}>{identitySubtext}</Text>
        ) : null}
      </View>

      {relationContextCard ? (
        <View style={styles.privateStateCard}>
          <Text style={styles.privateStateTitle}>{relationContextCard.title}</Text>
          <Text style={styles.privateStateText}>{relationContextCard.body}</Text>
        </View>
      ) : null}

      {evaluation ? (
        <View style={styles.readingSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>
              {nameRevealed ? 'Foundational reading' : 'Private reading'}
            </Text>
            <View style={styles.sectionLine} />
          </View>

          <View style={styles.readingCard}>
            {nameRevealed ? (
              <>
                <View style={styles.scoreRow}>
                  <Text style={[styles.scoreValue, { color: accent }]}>
                    {visibleScore ?? '--'}
                  </Text>
                  <View style={styles.scoreMeta}>
                    <Text style={[styles.scoreTier, { color: accent }]}>
                      {visibleScoreTier}
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
                        <Text style={styles.pillarLabel}>{getPillarLabel(key)}</Text>
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
                <View style={styles.narrativeCard}>
                  <Text style={styles.narrativeLine}>
                    <Text style={styles.narrativeKey}>Strength:</Text> {strongestLabel}
                  </Text>
                  <Text style={styles.narrativeLine}>
                    <Text style={styles.narrativeKey}>Watch:</Text> {weakestLabel}
                  </Text>
                  <Text style={styles.narrativeReading}>
                    <Text style={styles.narrativeKey}>Reading:</Text> {tierNarrative}
                  </Text>
                </View>
                <View style={styles.nextActionCard}>
                  <Text style={styles.nextActionLabel}>Next step</Text>
                  <Text style={styles.nextActionText}>{growthSuggestion}</Text>
                </View>
              </>
            ) : revealStatus === 'reveal_ready' ? (
              <View style={styles.revealReadyCard}>
                <Text style={styles.privateStateDate}>
                  Saved on {new Date(evaluation.createdAt).toLocaleDateString()}
                </Text>
                <Text style={styles.revealReadyTitle}>The reveal is ready</Text>
                <Text style={styles.revealReadyBody}>
                  Both readings are in. You can open the reveal now.
                </Text>
                <Pressable onPress={() => void handleOpenReveal()} style={styles.revealPrimaryButton}>
                  <Text style={styles.revealPrimaryButtonText}>Reveal now</Text>
                </Pressable>
                <Pressable onPress={handleBackToGarden} style={styles.secondaryInlineCTA}>
                  <Text style={styles.secondaryInlineCTALabel}>Back to network</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.privateStateCard}>
                <Text style={styles.privateStateDate}>
                  Saved on {new Date(evaluation.createdAt).toLocaleDateString()}
                </Text>
                {revealStatus === 'waiting_other_side' ? (
                  <>
                    <Text style={styles.privateStateTitle}>Your reading is saved</Text>
                    <Text style={styles.privateStateText}>
                      The reveal will be available once the other person adds their side.
                    </Text>
                    <Pressable onPress={() => void handleInviteToReveal()} style={styles.revealInviteCTA}>
                      <Text style={styles.revealInviteCTALabel}>Invite to reveal</Text>
                    </Pressable>
                  </>
                ) : revealStatus === 'cooking_reveal' ? (
                  <>
                    <Text style={styles.privateStateTitle}>Both sides are in</Text>
                    <Text style={styles.privateStateText}>
                      Both readings are in. The reveal is being prepared.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.privateStateTitle}>{safeRevealSummary?.stateLabel}</Text>
                    <Text style={styles.privateStateText}>{safeRevealSummary?.shortDescription}</Text>
                  </>
                )}
                <Pressable onPress={handleBackToGarden} style={styles.secondaryInlineCTA}>
                  <Text style={styles.secondaryInlineCTALabel}>Back to network</Text>
                </Pressable>
              </View>
            )}
          </View>

          <View style={styles.readingNote}>
            <Text style={styles.readingNoteText}>
              {nameRevealed
                ? 'This reading helps define how this connection is understood.'
                : revealStatus === 'reveal_ready'
                  ? 'Opening the reveal is a one-time action.'
                  : 'Your private side is saved and stays hidden until reveal.'}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.unreadSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Foundational reading</Text>
            <View style={styles.sectionLine} />
          </View>
          {shouldHighlightReadNext ? (
            <View style={styles.nextStepCard}>
              <Text style={styles.nextStepText}>
                This relationship was added. You can now read it.
              </Text>
            </View>
          ) : null}

          <View style={[styles.unreadCard, shouldHighlightReadNext && styles.unreadCardEmphasis]}>
            <Text style={styles.unreadTitle}>No trust reading yet</Text>
            <Text style={styles.unreadText}>
              Once read, this connection carries clearer trust context.
            </Text>
          </View>

          <Pressable
            onPress={() => router.push(`./evaluate/${relation.id}`)}
            style={[styles.ctaButton, shouldHighlightReadNext && styles.ctaButtonEmphasis]}
          >
            <Text style={styles.ctaButtonText}>Read this relationship</Text>
          </Pressable>
        </View>
      )}

      {assistedSuggestion ? (
        <View style={styles.reconciliationCard}>
          <Text style={styles.reconciliationTitle}>Possible local draft found</Text>
          <Text style={styles.reconciliationBody}>
            You also have a local draft tied to this same public profile. Review it before deciding what to keep.
          </Text>
          <Pressable
            onPress={() => router.push(`/relation/${assistedSuggestion.draftRelationId}`)}
            style={styles.reconciliationCTA}
          >
            <Text style={styles.reconciliationCTAText}>Open local draft</Text>
          </Pressable>
        </View>
      ) : null}

      {draftResolutionSuggestion ? (
        <View style={styles.reconciliationCard}>
          <Text style={styles.reconciliationTitle}>Possible shared relation found</Text>
          <Text style={styles.reconciliationBody}>
            This draft appears tied to a public profile already present in a shared-backed relation. If you no longer need this local draft, you can archive it.
          </Text>
          <Pressable
            onPress={() => router.push(`/relation/${draftResolutionSuggestion.sharedRelationId}`)}
            style={styles.reconciliationCTA}
          >
            <Text style={styles.reconciliationCTAText}>Open shared relation</Text>
          </Pressable>
          <Pressable
            onPress={() => { archiveRelation(draftResolutionSuggestion.draftRelationId); router.replace('/(tabs)'); }}
            style={styles.draftResolutionArchive}
          >
            <Text style={styles.draftResolutionArchiveText}>Archive this draft</Text>
          </Pressable>
        </View>
      ) : null}
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
  handle: {
    fontSize: 13,
    color: colors.text.secondary,
    fontWeight: '600',
  },
  tierBadge: {
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    paddingVertical: 5,
  },
  tierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  tierBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  infoButton: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoButtonText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '700',
    lineHeight: 14,
  },
  originCard: {
    alignSelf: 'flex-start',
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
  editLink: {
    paddingTop: spacing.xs,
  },
  editLinkText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
  narrativeCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    gap: spacing.xs,
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
  nextActionCard: {
    backgroundColor: colors.accent.deepTeal + '14',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.deepTeal + '44',
    padding: spacing.md,
    gap: spacing.xs,
  },
  nextActionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.accent.deepTeal,
    fontWeight: '700',
  },
  nextActionText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.primary,
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
  revealReadyBody: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 19,
  },
  revealPrimaryButton: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  revealPrimaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  revealInviteCTA: {
    marginTop: spacing.xs,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent.deepTeal + '55',
    backgroundColor: colors.accent.deepTeal + '14',
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  revealInviteCTALabel: {
    fontSize: 12,
    color: colors.accent.deepTeal,
    fontWeight: '700',
  },
  secondaryInlineCTA: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  secondaryInlineCTALabel: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
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
  nextStepCard: {
    backgroundColor: colors.accent.warmGold + '16',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '44',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  nextStepText: {
    fontSize: 13,
    color: colors.text.primary,
    lineHeight: 19,
    fontWeight: '500',
  },
  unreadCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  unreadCardEmphasis: {
    borderColor: colors.accent.warmGold + '55',
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
  ctaButtonEmphasis: {
    shadowColor: colors.accent.deepTeal,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  ctaButtonText: {
    color: colors.text.primary,
    fontSize: 16,
    fontWeight: '700',
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
});
