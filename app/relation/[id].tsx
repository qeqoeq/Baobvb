import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { devLogLinking, maskIdForLog } from '../../lib/dev-linking-log';
import { isLocalDraftId, newCanonicalRelationId } from '../../lib/identity';
import { radius, spacing } from '../../constants/spacing';
import { getTierAccent, type PillarKey } from '../../lib/evaluation';
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
  tryRegisterPhoneAnchorSilently,
} from '../../lib/reveal-shared-repo';
import {
  getReadingCardVariant,
  getReadingNoteText,
  getRelationNextAction,
  getRelationSheetIdentity,
} from '../../lib/relation-detail-helpers';
import { showPhoneInviteSheet } from '../../lib/phone-invite-sheet';
import { useRelationsStore } from '../../store/useRelationsStore';

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

const PILLAR_ORDER: PillarKey[] = [
  'trust',
  'interactions',
  'affinity',
  'support',
  'sharedNetwork',
];

export default function RelationDetailScreen() {
  const { id, justCreated } = useLocalSearchParams<{ id: string; justCreated?: string }>();
  const { me, relations, evaluations, syncRevealReadyState, revealMutualRelationship, setCanonicalRelationId, markInviteDeliveryOpened, archiveRelation, getAssistedReconciliationSuggestionForRelation, getDraftResolutionSuggestionForRelation } = useRelationsStore();
  const [sharedReveal, setSharedReveal] = useState<Awaited<
    ReturnType<typeof getSharedRevealRecordForCurrentUser>
  > | null>(null);
  // Prevents refreshSharedReveal from fetching an incomplete backend record
  // during the invite creation window, which would override local state.
  const isInviteFlowActiveRef = useRef(false);

  const relation = useMemo(
    () => relations.find((r) => r.id === id) ?? null,
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
  // Frozen mutual values — set during cooking, preserved through reveal.
  const frozenMutualScore = relationForDisplay.localState.revealSnapshot.mutualScore;
  const frozenMutualTier  = relationForDisplay.localState.revealSnapshot.tier;
  // Single revealed source of truth: mutual when available, private as fallback.
  const revealedTier = nameRevealed
    ? (frozenMutualTier ?? reading?.linkTier ?? null)
    : (reading?.linkTier ?? null);
  const revealedScore = nameRevealed
    ? (frozenMutualScore ?? evaluation?.score ?? null)
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
  const readingVariant = getReadingCardVariant({ hasEvaluation: Boolean(evaluation), nameRevealed, revealStatus });
  const relationIdentity = getRelationSheetIdentity({
    relation,
  });
  const isSharedIdentity = relationIdentity.titleEyebrow === 'Shared identity';
  const isScannedIdentity = relationIdentity.titleEyebrow === 'Scanned contact';
  const deliveryChannelOpened = Boolean(relation.inviteDeliveryOpenedAt);
  const nextAction = getRelationNextAction({
    relation,
    hasEvaluation: Boolean(evaluation),
    revealStatus,
    nameRevealed,
    deliveryChannelOpened,
  });
  const readingSectionLabel = nameRevealed ? 'Shared reading' : 'Private reading';
  // visibleScore / visibleScoreTier are derived from the revealed source of truth.
  const visibleScore = revealedScore;
  const visibleScoreTier = nameRevealed
    ? (revealedTier ?? 'Private reading')
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
        const relationshipId = relation.canonicalRelationId ?? relation.id;
        const updated = await openSharedReveal(relationshipId);
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
      const invite = await createRelationshipInviteForCurrentUser(canonicalId, 'sideA');

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
      await Share.share({ message: fullMessage });
    } catch (error) {
      const description = error instanceof Error ? error.message : '';
      if (description.includes('Authentication required')) {
        Alert.alert('Sign in required', 'Sign in with Apple to invite someone to reveal.');
        return;
      }
      Alert.alert('Invite to reveal', 'Sharing is not available right now.');
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
      'Archive relationship',
      'Removes this from your active network.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Archive',
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
    <Stack.Screen options={{ title: getHeaderTitle(relationIdentity.privateLabel, nextAction.ctaKind), headerBackTitle: '' }} />
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={[styles.avatar, { backgroundColor: headerAccent + '14', borderColor: headerAccent + '44' }]}>
          <Text style={[styles.avatarText, { color: headerAccent }]}>
            {(relation.avatarSeed || relationIdentity.privateLabel.charAt(0) || '?').toUpperCase()}
          </Text>
        </View>
        <View style={styles.identityBlock}>
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
          <Text style={styles.name}>{relationIdentity.primaryTitle}</Text>
          {relationIdentity.supportingText ? (
            <Text style={styles.identitySupport}>{relationIdentity.supportingText}</Text>
          ) : null}
        </View>
      </View>

      <View style={styles.metaZone}>
        <View style={styles.stateRow}>
          <View style={styles.statusChip}>
            <Text style={styles.statusChipText}>{relationIdentity.stateLabel}</Text>
          </View>
          <Pressable onPress={() => router.push(`./edit/${relation.id}`)} style={styles.editLink}>
            <Text style={styles.editLinkText}>Edit relation</Text>
          </Pressable>
        </View>

        {nextAction.ctaKind !== 'resend' && (
          <>
            <View style={styles.anchorCard}>
              <Text style={styles.anchorCardLabel}>{relationIdentity.anchorLabel}</Text>
              <Text style={styles.anchorCardValue}>{relationIdentity.anchorValue}</Text>
              {relationIdentity.anchorHint ? (
                <Text style={styles.anchorCardHint}>{relationIdentity.anchorHint}</Text>
              ) : null}
            </View>

            <View style={styles.depthRow}>
              <Text style={styles.depthLabel}>Depth</Text>
              <Text style={styles.depthValue}>{relationIdentity.relationDepthLabel}</Text>
            </View>
          </>
        )}
      </View>

      <View style={[
        styles.primaryActionCard,
        nextAction.ctaKind === 'resend' && styles.primaryActionCardPending,
        justCreated === '1' && !evaluation && nextAction.ctaKind !== 'resend' && styles.primaryActionCardHighlight,
      ]}>
        {nextAction.ctaKind === 'resend' ? (
          <Text style={styles.pendingKicker}>Baobab</Text>
        ) : (
          <Text style={styles.primaryActionEyebrow}>Next</Text>
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
            <Text style={styles.resendTreeLabel}>Send again</Text>
          </Pressable>
        ) : nextAction.ctaLabel ? (
          <Pressable onPress={handlePrimaryAction} style={styles.ctaButton}>
            <Text style={styles.ctaButtonText}>{nextAction.ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>

      {nextAction.ctaKind !== 'resend' && (
        evaluation ? (
          <View style={styles.readingSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{readingSectionLabel}</Text>
              <View style={styles.sectionLine} />
            </View>

            <View style={styles.readingCard}>
              {readingVariant === 'revealed' ? (
                <>
                  <View style={styles.scoreRow}>
                    <Text style={[styles.scoreValue, { color: readingAccent }]}>
                      {visibleScore ?? '--'}
                    </Text>
                    <View style={styles.scoreMeta}>
                      <View style={styles.scoreMetaRow}>
                        <Text style={[styles.scoreTier, { color: readingAccent }]}>
                          {visibleScoreTier}
                        </Text>
                        {tierLexicon ? (
                          <Pressable onPress={openTierInfo} style={styles.infoButton}>
                            <Text style={styles.infoButtonText}>i</Text>
                          </Pressable>
                        ) : null}
                      </View>
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
                  <View style={styles.narrativeCard}>
                    <Text style={styles.narrativeLine}>
                      <Text style={styles.narrativeKey}>Where it's strong:</Text> {strongestLabel}
                    </Text>
                    <Text style={styles.narrativeLine}>
                      <Text style={styles.narrativeKey}>Where it can grow:</Text> {weakestLabel}
                    </Text>
                    <Text style={styles.narrativeReading}>
                      {tierNarrative}
                    </Text>
                  </View>
                </>
              ) : readingVariant === 'reveal_ready' ? (
                <View style={styles.revealReadyCard}>
                  <Text style={styles.privateStateDate}>
                    Saved on {new Date(evaluation.createdAt).toLocaleDateString()}
                  </Text>
                  <Text style={styles.revealReadyTitle}>Shared reading ready</Text>
                  <Text style={styles.privateStateText}>
                    Open it above.
                  </Text>
                </View>
              ) : (
                <View style={styles.privateStateCard}>
                  <Text style={styles.privateStateDate}>
                    Saved on {new Date(evaluation.createdAt).toLocaleDateString()}
                  </Text>
                  {readingVariant === 'waiting_other_side' ? (
                    <>
                      <Text style={styles.privateStateTitle}>Private reading saved</Text>
                      <Text style={styles.privateStateText}>Waiting on their side.</Text>
                    </>
                  ) : readingVariant === 'cooking' ? (
                    <>
                      <Text style={styles.privateStateTitle}>Private reading saved</Text>
                      <Text style={styles.privateStateText}>
                        Locked until the reveal opens.
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.privateStateTitle}>{safeRevealSummary?.stateLabel}</Text>
                      <Text style={styles.privateStateText}>{safeRevealSummary?.shortDescription}</Text>
                    </>
                  )}
                </View>
              )}
            </View>

            <View style={styles.readingNote}>
              <Text style={styles.readingNoteText}>
                {getReadingNoteText(nameRevealed, revealStatus)}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.unreadSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionLabel}>{readingSectionLabel}</Text>
              <View style={styles.sectionLine} />
            </View>
            <View style={styles.unreadCard}>
              <Text style={styles.unreadTitle}>No reading yet</Text>
              <Text style={styles.unreadText}>
                Stays private until both sides are in.
              </Text>
            </View>
          </View>
        )
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

      {!relation.archived && nextAction.ctaKind !== 'resend' && (
        <View style={styles.managementZone}>
          <Pressable onPress={handleArchive} style={styles.archiveAction}>
            <Text style={styles.archiveActionText}>Archive relationship</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
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
  scoreMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
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
});
