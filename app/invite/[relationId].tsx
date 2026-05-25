import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { devLogLinking } from '../../lib/dev-linking-log';
import { isLocalDraftId } from '../../lib/identity';
import { claimRelationshipInviteForCurrentUser } from '../../lib/reveal-shared-repo';
import type { SharedInviteClaimResult } from '../../lib/reveal-shared-types';
import type { RelationshipSideKey, SharedRelationBootstrapInput } from '../../store/useRelationsStore';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function InviteArrivalScreen() {
  const { relationId, token } = useLocalSearchParams<{ relationId: string; token?: string }>();
  const relationIdTrim = typeof relationId === 'string' ? relationId.trim() : '';
  const { me, relations, resolveInvitedSideB, addRelation } = useRelationsStore();
  const [showUnresolvedContinuation, setShowUnresolvedContinuation] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [brokenLink, setBrokenLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const relation = useMemo(
    () =>
      relations.find(
        (item) =>
          item.id === relationIdTrim || item.canonicalRelationId === relationIdTrim,
      ) ?? null,
    [relations, relationIdTrim],
  );

  const sideBHasPrivateReading = relation?.localState.sideB.hasPrivateReading === true;

  const hasLocalIdentity = Boolean(
    me?.displayName?.trim() &&
    me?.handle?.trim(),
  );

  const exitInviteFlow = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  useEffect(() => {
    if (!showUnresolvedContinuation || !relation) return;
    router.push({ pathname: '/relation/[id]', params: { id: relation.id } });
  }, [showUnresolvedContinuation, relation]);

  const handleAddMySide = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setShowUnresolvedContinuation(false);
    setClaimError(null);
    setBrokenLink(false);

    try {
      if (!hasLocalIdentity) {
        router.push({
          pathname: '/invite/identity/[relationId]',
          params: { relationId: relationIdTrim, token: token || '' },
        });
        return;
      }

      if (!token?.trim() && !relation) {
        setBrokenLink(true);
        return;
      }

      let claimedSide: RelationshipSideKey = 'sideB';
      let claimedCanonicalId: string | null = null;
      let claimResult: SharedInviteClaimResult | null = null;
      if (token?.trim()) {
        try {
          const claim = await claimRelationshipInviteForCurrentUser(token);
          claimedSide = claim.claimed_side;
          claimedCanonicalId = claim.relationship_id;
          claimResult = claim;
        } catch (error) {
          if (__DEV__) {
            devLogLinking('invite: claim failed', {
              error: error instanceof Error ? error.message : String(error),
            });
          }
          setClaimError(
            error instanceof Error ? error.message : 'This invitation could not be claimed.',
          );
          return;
        }
      }

      if (relation) {
        if (claimedSide === 'sideB') {
          resolveInvitedSideB(relation.id);
        }

        if (claimedSide === 'sideB' && !sideBHasPrivateReading) {
          router.push({
            pathname: '/relation/evaluate/[id]',
            params: { id: relation.id, side: claimedSide },
          });
          return;
        }

        if (claimedSide === 'sideA') {
          router.push({
            pathname: '/relation/evaluate/[id]',
            params: { id: relation.id, side: claimedSide },
          });
          return;
        }

        router.push({ pathname: '/relation/[id]', params: { id: relation.id } });
        return;
      }

      if (claimedCanonicalId && !isLocalDraftId(claimedCanonicalId)) {
        if (!claimResult) {
          setClaimError('This invitation could not be completed. Please try again.');
          return;
        }
        const existingByClaim = relations.find((r) => r.canonicalRelationId === claimedCanonicalId);
        if (existingByClaim) {
          router.replace({
            pathname: '/relation/evaluate/[id]',
            params: { id: existingByClaim.id, side: claimedSide },
          });
          return;
        }
        const claimSharedRecord: SharedRelationBootstrapInput = {
          relationship_id: claimedCanonicalId,
          status: claimResult.status,
          my_side: claimResult.claimed_side,
          side_a_present: claimResult.side_a_present,
          side_b_present: claimResult.side_b_present,
          side_a_reading_id: claimResult.side_a_reading_id,
          side_b_reading_id: claimResult.side_b_reading_id,
          cooking_started_at: claimResult.cooking_started_at,
          unlock_at: claimResult.unlock_at,
          ready_at: claimResult.ready_at,
          revealed_at: claimResult.revealed_at,
          relationship_name_revealed: claimResult.relationship_name_revealed,
          counterpart_public_profile_id: claimResult.counterpart_public_profile_id,
        };
        const created = addRelation('Private connection', {
          source: 'claim',
          privateLabel: 'Private connection',
          anchorMode: 'claim',
          avatarSeed: '?',
          canonicalRelationId: claimedCanonicalId,
          claimSharedRecord,
          anchorValue: null,
          relationDepth: 'known',
        });
        if (!created) {
          setClaimError('This invitation could not be completed. Please try again.');
          return;
        }
        resolveInvitedSideB(created.id);
        router.replace({
          pathname: '/relation/evaluate/[id]',
          params: { id: created.id, side: claimedSide },
        });
        return;
      }

      setShowUnresolvedContinuation(true);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!relationIdTrim) {
    if (__DEV__) {
      devLogLinking('invite: missing relationId in URL', {});
    }
    return (
      <View style={styles.screen}>
        <View style={styles.stage}>
          <View style={styles.textZone}>
            <Text style={styles.title}>{'Invalid invite link'}</Text>
            <Text style={styles.body}>
              {'This link does not include a relationship id. Ask your partner to share the invite again.'}
            </Text>
            {__DEV__ ? (
              <Text style={styles.devHint}>
                {'Dev: baobab://invite/RELATION_ID?token=… (replace RELATION_ID)'}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.actionZone}>
          <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>{'Go back'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Atmospheric background warmth — non-interactive */}
      <View pointerEvents="none" style={styles.atmosphereTop} />
      <View pointerEvents="none" style={styles.atmosphereBottom} />

      {/* Central composition: orb + identity text */}
      <View style={styles.stage}>
        {/* Organic orb — layered concentric rings */}
        <View style={styles.orbZone}>
          <View style={styles.orbRing3} />
          <View style={styles.orbRing2} />
          <View style={styles.orbRing1} />
          <View style={styles.orbCore} />
        </View>

        {/* Text zone */}
        <View style={styles.textZone}>
          <Text style={styles.kicker}>{'BAOBAB'}</Text>
          <Text style={styles.title}>{'A private link\nis waiting'}</Text>
          <Text style={styles.body}>
            {'Someone opened a private space with you.\nNothing is public. Nothing is ranked.'}
          </Text>
        </View>
      </View>

      {/* Action zone — anchored at bottom */}
      <View style={styles.actionZone}>
        {brokenLink ? (
          <>
            <Text style={styles.stateTitle}>{'This invite link is incomplete'}</Text>
            <Text style={styles.stateBody}>
              {'The link is missing information needed to continue. Ask for a fresh invite link.'}
            </Text>
            <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{'Done'}</Text>
            </Pressable>
          </>
        ) : claimError ? (
          <>
            <Text style={styles.stateTitle}>{"Couldn't claim this invitation"}</Text>
            <Text style={styles.stateBody}>
              {'This invitation may have expired or already been used. Ask your partner to share a new one.'}
            </Text>
            <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{'Done'}</Text>
            </Pressable>
            <Pressable onPress={() => setClaimError(null)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{'Try again'}</Text>
            </Pressable>
          </>
        ) : showUnresolvedContinuation ? (
          <>
            <Text style={styles.stateTitle}>{"You've joined this invite"}</Text>
            <Text style={styles.stateBody}>
              {'Your participation has been recorded. This relationship is not available in your Garden yet.'}
            </Text>
            <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>{'Done'}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable
              onPress={() => void handleAddMySide()}
              style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? 'Continuing…' : 'Continue privately'}
              </Text>
            </Pressable>
            <Pressable onPress={exitInviteFlow} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{'Maybe later'}</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#111A15',
  },

  // ── Atmospheric background glows ─────────────────────────────────────────────
  atmosphereTop: {
    position: 'absolute',
    top: -60,
    left: -80,
    right: -80,
    height: 360,
    borderRadius: 180,
    backgroundColor: colors.accent.dustyRose + '18',
  },
  atmosphereBottom: {
    position: 'absolute',
    bottom: 0,
    left: -60,
    right: -60,
    height: 280,
    borderRadius: 140,
    backgroundColor: colors.accent.warmGold + '18',
  },

  // ── Stage — orb + text, vertically centered ──────────────────────────────────
  stage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.xl + spacing.sm,
  },

  // ── Organic orb ──────────────────────────────────────────────────────────────
  orbZone: {
    width: 164,
    height: 164,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orbRing3: {
    position: 'absolute',
    width: 164,
    height: 164,
    borderRadius: 82,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '2C',
    backgroundColor: colors.accent.dustyRose + '07',
  },
  orbRing2: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1,
    borderColor: colors.accent.dustyRose + '70',
  },
  orbRing1: {
    position: 'absolute',
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '80',
    backgroundColor: colors.accent.warmGold + '18',
  },
  orbCore: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent.warmGold + '60',
    borderWidth: 1,
    borderColor: colors.accent.warmGold + 'AA',
    shadowColor: colors.accent.warmGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
  },

  // ── Text zone ─────────────────────────────────────────────────────────────────
  textZone: {
    alignItems: 'center',
    gap: spacing.md,
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 3,
    color: colors.accent.warmGold,
    textAlign: 'center',
  },
  title: {
    fontSize: 30,
    lineHeight: 38,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: 'center',
  },

  // ── Action zone — bottom anchored ────────────────────────────────────────────
  actionZone: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  primaryButton: {
    borderRadius: radius.pill,
    backgroundColor: '#B8796A',
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '50',
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    shadowColor: '#C4704A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 7,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: 0.2,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.muted,
  },

  // ── State messages (error / unresolved) ───────────────────────────────────────
  stateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  stateBody: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.secondary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },

  devHint: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.text.muted,
    textAlign: 'center',
  },
});
