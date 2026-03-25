import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { devLogLinking } from '../../lib/dev-linking-log';
import { isLocalDraftId } from '../../lib/identity';
import { putClaimRecord } from '../../lib/claim-shared-record-handoff';
import { claimRelationshipInviteForCurrentUser } from '../../lib/reveal-shared-repo';
import type { SharedInviteClaimResult } from '../../lib/reveal-shared-types';
import type { RelationshipSideKey } from '../../store/useRelationsStore';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function InviteArrivalScreen() {
  const { relationId, token } = useLocalSearchParams<{ relationId: string; token?: string }>();
  const relationIdTrim = typeof relationId === 'string' ? relationId.trim() : '';
  const { me, relations, resolveInvitedSideB } = useRelationsStore();
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

  // Stable exit: back if there's a stack to return to, otherwise Garden.
  // Covers cold opens (deep link, post-auth redirect) where back() would be a no-op.
  const exitInviteFlow = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)');
    }
  };

  // If the relation appears in the store while the unresolved card is visible,
  // navigate automatically — no retry needed, no false success.
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

      // No token and no local relation: the link is structurally broken.
      // Nothing can be claimed or resolved.
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

        router.push({
          pathname: '/relation/[id]',
          params: { id: relation.id },
        });
        return;
      }

      // Cold invite: claim succeeded but no local relation exists yet.
      // If we have a canonical relation ID (UUID, not a legacy localDraftId),
      // navigate to the add flow so the user can name the person and materialize
      // a proper local relation anchored on this canonicalRelationId.
      if (claimedCanonicalId && !isLocalDraftId(claimedCanonicalId)) {
        if (claimResult) {
          putClaimRecord(claimedCanonicalId, claimResult);
        }
        router.push({
          pathname: '/relation/add',
          params: {
            fromClaim: '1',
            claimedSide,
            canonicalRelationId: claimedCanonicalId,
          },
        });
        return;
      }
      // Legacy or broken claim: canonical ID absent or non-UUID.
      // Fall back to the unresolved continuation message.
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
        <View style={styles.card}>
          <Text style={styles.title}>Invalid invite link</Text>
          <Text style={styles.body}>
            This link does not include a relationship id. Ask your partner to share the invite again.
          </Text>
          {__DEV__ ? (
            <Text style={styles.devHint}>
              Dev: baobab://invite/RELATION_ID?token=… (replace RELATION_ID)
            </Text>
          ) : null}
          <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Go back</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>Reveal your relationship together</Text>
        <Text style={styles.body}>
          Someone saved one side of this relationship on Baobab. Add your side to reveal it together.
        </Text>

        <View style={styles.reassuranceBlock}>
          <Text style={styles.reassuranceText}>Your reading stays private until both sides are complete.</Text>
          <Text style={styles.reassuranceText}>There is no public score.</Text>
          <Text style={styles.reassuranceText}>You can answer in under a minute.</Text>
        </View>

        {brokenLink ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>This invite link is incomplete</Text>
            <Text style={styles.stateBody}>
              The link is missing information needed to continue. Ask for a fresh invite link.
            </Text>
            <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        ) : claimError ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>Couldn't claim this invitation</Text>
            <Text style={styles.stateBody}>
              This invitation may have expired or already been used. Ask your partner to share a new one.
            </Text>
            <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
            <Pressable
              onPress={() => setClaimError(null)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Try again</Text>
            </Pressable>
          </View>
        ) : showUnresolvedContinuation ? (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>You've joined this invite</Text>
            <Text style={styles.stateBody}>
              Your participation has been recorded. This relationship is not available in your Garden yet.
            </Text>
            <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable
              onPress={() => void handleAddMySide()}
              style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {isSubmitting ? 'Claiming…' : 'Add my side'}
              </Text>
            </Pressable>
            <Pressable onPress={exitInviteFlow} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Not now</Text>
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
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: colors.text.primary,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  reassuranceBlock: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  reassuranceText: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  primaryButton: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  stateCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  stateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  stateBody: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  devHint: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.text.muted,
    fontFamily: 'System',
  },
});
