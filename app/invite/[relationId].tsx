import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import {
  buildRelationshipRevealInput,
  getSafeRelationshipRevealSummary,
} from '../../lib/relationship-reveal';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function InviteArrivalScreen() {
  const { relationId } = useLocalSearchParams<{ relationId: string }>();
  const { me, relations, evaluations, resolveInvitedSideB } = useRelationsStore();
  const [showUnresolvedContinuation, setShowUnresolvedContinuation] = useState(false);

  const relation = useMemo(
    () => relations.find((item) => item.id === relationId) ?? null,
    [relations, relationId],
  );
  const privateReadingA = useMemo(
    () => (relation ? evaluations.find((evaluation) => evaluation.relationId === relation.id) ?? null : null),
    [evaluations, relation],
  );
  const safeRevealSummary = useMemo(
    () =>
      getSafeRelationshipRevealSummary(
        relation
          ? buildRelationshipRevealInput({
              relation,
              privateReadingA,
            })
          : buildRelationshipRevealInput({
              relation: null,
              privateReadingA: null,
              // Invite arrival remains unresolved while real side-B binding is unavailable.
              sideB: { exists: false },
            }),
      ),
    [relation, privateReadingA],
  );

  const hasLocalIdentity = Boolean(
    me?.displayName?.trim() &&
    me?.handle?.trim(),
  );

  const handleAddMySide = () => {
    setShowUnresolvedContinuation(false);

    if (!hasLocalIdentity) {
      // Keep invite context while collecting minimal local identity.
      router.push({
        pathname: '/invite/identity/[relationId]',
        params: { relationId: relationId || '' },
      });
      return;
    }

    if (relation) {
      resolveInvitedSideB(relation.id);

      if (!privateReadingA) {
        router.push({
          pathname: '/relation/evaluate/[id]',
          params: { id: relation.id },
        });
        return;
      }

      router.push({
        pathname: '/relation/[id]',
        params: { id: relation.id },
      });
      return;
    }

    // TODO: Bind invite relation IDs to real local relation records when backend invite resolution is ready.
    setShowUnresolvedContinuation(true);
  };

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

        {showUnresolvedContinuation ? (
          <View style={styles.unresolvedCard}>
            <Text style={styles.unresolvedTitle}>Your card is ready</Text>
            <Text style={styles.unresolvedBody}>
              {safeRevealSummary?.shortDescription}
            </Text>
            {safeRevealSummary?.waitingReason ? (
              <Text style={styles.unresolvedSupport}>{safeRevealSummary.waitingReason}</Text>
            ) : null}
            <Pressable onPress={() => router.back()} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Done</Text>
            </Pressable>
            <Pressable onPress={() => setShowUnresolvedContinuation(false)} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Not now</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <Pressable onPress={handleAddMySide} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Add my side</Text>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
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
  unresolvedCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    gap: spacing.xs,
  },
  unresolvedTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  unresolvedBody: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },
  unresolvedSupport: {
    fontSize: 11,
    lineHeight: 16,
    color: colors.text.muted,
  },
});
