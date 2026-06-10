import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { devLogLinking } from '../../lib/dev-linking-log';
import { formatInviterPrompt } from '../../lib/format-inviter-identity';
import { isLocalDraftId } from '../../lib/identity';
import { shouldAutoContinueInvite } from '../../lib/invite-auto-continue';
import { previewRelationshipInviteForCurrentUser } from '../../lib/preview-relationship-invite';
import { claimRelationshipInviteForCurrentUser } from '../../lib/reveal-shared-repo';
import type { InvitePreviewResult, SharedInviteClaimResult } from '../../lib/reveal-shared-types';
import type { RelationshipSideKey, SharedRelationBootstrapInput } from '../../store/useRelationsStore';
import { useRelationsStore } from '../../store/useRelationsStore';

// ── Error normalization ────────────────────────────────────────────────────
// Supabase JS v2 throws PostgrestError objects (plain objects with
// { message, details, hint, code }) that do NOT inherit from Error. Naïve
// String(error) on these objects produces "[object Object]", which collapses
// every backend failure into the "unknown" bucket downstream.
// This helper drains any reasonable string field, then falls back to JSON.

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const candidates = [record.message, record.details, record.hint, record.code, record.error];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) return candidate;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return 'This invitation could not be claimed.';
}

// ── Claim error classification ─────────────────────────────────────────────
// Maps RPC error strings from claim_relationship_invite() to a small product
// vocabulary. The previous UI displayed a single generic message for every
// failure, which lied to the user (e.g. self-claim was framed as "expired").
// Source of truth for the RPC strings:
// supabase/migrations/20260523123000_claim_invite_bootstrap_shared_reveal.sql

export type ClaimErrorKind =
  | 'self_claim'
  | 'expired'
  | 'already_claimed'
  | 'invalid'
  | 'auth_required'
  | 'unknown';

export function getClaimErrorKind(message: string | null | undefined): ClaimErrorKind {
  if (!message) return 'unknown';
  const m = message.toLowerCase();
  if (m.includes('cannot claim both sides')) return 'self_claim';
  if (m.includes('already claimed') || m.includes('already been claimed')) return 'already_claimed';
  if (m.includes('expired')) return 'expired';
  if (m.includes('authenticated user required') || m.includes('sign in')) return 'auth_required';
  if (m.includes('invalid') || m.includes('token is required')) return 'invalid';
  return 'unknown';
}

type ClaimErrorCopy = {
  title: string;
  body: string;
  primaryLabel: string;
  showRetry: boolean;
};

function getClaimErrorCopy(kind: ClaimErrorKind): ClaimErrorCopy {
  switch (kind) {
    case 'self_claim':
      return {
        title: 'You opened your own invite',
        body: 'Share this link with the other person — Baobab needs both sides to be different.',
        primaryLabel: 'Done',
        showRetry: false,
      };
    case 'expired':
      return {
        title: 'This invitation expired',
        body: 'Ask your partner to share a fresh invite.',
        primaryLabel: 'Done',
        showRetry: true,
      };
    case 'already_claimed':
      return {
        title: 'This invitation has already been used',
        body: 'Each invite link works once. Ask your partner to share a new one.',
        primaryLabel: 'Done',
        showRetry: false,
      };
    case 'invalid':
      return {
        title: 'This invite link is invalid',
        body: 'The token is not recognized. Ask your partner to share a fresh invite.',
        primaryLabel: 'Done',
        showRetry: true,
      };
    case 'auth_required':
      return {
        title: 'Sign in required',
        body: 'Sign in with Apple to claim this invitation.',
        primaryLabel: 'Continue',
        showRetry: true,
      };
    case 'unknown':
    default:
      return {
        title: "Couldn't claim this invitation",
        body: 'Something went wrong while opening this private link. Try again or ask for a fresh invite.',
        primaryLabel: 'Done',
        showRetry: true,
      };
  }
}

export default function InviteArrivalScreen() {
  const { relationId, token, continueAfterIdentity } = useLocalSearchParams<{
    relationId: string;
    token?: string;
    continueAfterIdentity?: string;
  }>();
  const relationIdTrim = typeof relationId === 'string' ? relationId.trim() : '';
  const { me, relations, resolveInvitedSideB, addRelation } = useRelationsStore();
  const [showUnresolvedContinuation, setShowUnresolvedContinuation] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [brokenLink, setBrokenLink] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [preview, setPreview] = useState<InvitePreviewResult | null>(null);
  const hasAutoContinuedRef = useRef(false);

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

  // Best-effort identity preview. UX-only: any failure leaves preview=null
  // and the screen falls back to "Someone opened...". Never blocks claim.
  useEffect(() => {
    if (!token?.trim()) return;
    let cancelled = false;
    void previewRelationshipInviteForCurrentUser(token).then((result) => {
      if (!cancelled) setPreview(result);
    });
    return () => {
      cancelled = true;
    };
  }, [token]);

  // Auto-continue only resumes an explicit intent after identity creation;
  // it must not claim without token or repeat after navigation.
  useEffect(() => {
    if (hasAutoContinuedRef.current) return;
    const ok = shouldAutoContinueInvite({
      continueAfterIdentity,
      hasLocalIdentity,
      token,
      isSubmitting,
      claimError,
      brokenLink,
      showUnresolvedContinuation,
    });
    if (!ok) return;
    hasAutoContinuedRef.current = true;
    // Strip the flag from the URL so a back-navigation from Evaluate sideB
    // does not re-trigger the claim on remount.
    router.setParams({ continueAfterIdentity: undefined });
    void handleAddMySide();
    // handleAddMySide is intentionally omitted from deps: it closes over the
    // current states and refs, and re-creating the effect on every render
    // would defeat the hasAutoContinuedRef guard. The guards above keep
    // the effect idempotent across re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    continueAfterIdentity,
    hasLocalIdentity,
    token,
    isSubmitting,
    claimError,
    brokenLink,
    showUnresolvedContinuation,
  ]);

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
          const errorMessage = getErrorMessage(error);
          if (__DEV__) {
            devLogLinking('invite: claim failed', { error: errorMessage });
          }
          setClaimError(errorMessage);
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
        // Materialize the relation with the inviter's identity snapshot when
        // present. Legacy invites (pre-snapshot migration) fall back to the
        // generic "Private link" / "?" defaults.
        const snapshotDisplayName = claimResult.inviter_display_name?.trim() || '';
        const snapshotHandle = claimResult.inviter_handle?.trim() || '';
        const snapshotAvatarSeed = claimResult.inviter_avatar_seed?.trim() || '';
        const displayName = snapshotDisplayName || 'Private link';
        const handle = snapshotHandle || undefined;
        const avatarSeed =
          snapshotAvatarSeed || displayName.charAt(0).toUpperCase() || '?';
        const created = addRelation(displayName, {
          source: 'claim',
          privateLabel: displayName,
          anchorMode: 'claim',
          handle,
          avatarSeed,
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
          <Text style={styles.title}>
            {preview?.inviter_display_name?.trim()
              ? `${preview.inviter_display_name.trim()} opened\na link with you`
              : 'Your private link\nis waiting'}
          </Text>
          <Text style={styles.body}>
            {formatInviterPrompt(preview)}
            {"\nYour side stays private. Reveal it together when you're both ready."}
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
          (() => {
            const claimErrorKind = getClaimErrorKind(claimError);
            const claimErrorCopy = getClaimErrorCopy(claimErrorKind);
            return (
              <>
                <Text style={styles.stateTitle}>{claimErrorCopy.title}</Text>
                <Text style={styles.stateBody}>{claimErrorCopy.body}</Text>
                {__DEV__ && claimErrorKind === 'unknown' ? (
                  <Text style={styles.devHint}>{claimError}</Text>
                ) : null}
                <Pressable onPress={exitInviteFlow} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{claimErrorCopy.primaryLabel}</Text>
                </Pressable>
                {claimErrorCopy.showRetry ? (
                  <Pressable onPress={() => setClaimError(null)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>{'Try again'}</Text>
                  </Pressable>
                ) : null}
              </>
            );
          })()
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
                {isSubmitting ? 'Continuing…' : 'Start your side'}
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
