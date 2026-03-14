import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { type Tier } from '../../lib/evaluation';
import {
  getRelationshipLexiconEntry,
  isRelationshipNameRevealed,
} from '../../lib/relationship-lexicon';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function RelationshipLexiconScreen() {
  const { evaluations, relations } = useRelationsStore();

  const revealedRelationIds = new Set(
    relations.filter((relation) => isRelationshipNameRevealed(relation)).map((relation) => relation.id),
  );

  const discoveredTiers = Array.from(
    new Set(
      evaluations
        .filter((evaluation) => revealedRelationIds.has(evaluation.relationId))
        .map((evaluation) => evaluation.tier)
        .filter((tier): tier is Tier => !!tier),
    ),
  );

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Your relationship lexicon</Text>
        <Text style={styles.subtitle}>
          Only discovered relationship names appear here.
        </Text>
      </View>

      {discoveredTiers.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No relationship names discovered yet</Text>
          <Text style={styles.emptyText}>
            Complete your first foundational reading to reveal a first name.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {discoveredTiers.map((tier) => {
            const entry = getRelationshipLexiconEntry(tier);
            return (
              <View key={tier} style={styles.card}>
                <Text style={styles.name}>{entry.canonicalName}</Text>
                <Text style={styles.colorLabel}>{entry.colorLabel}</Text>
                <Text style={styles.definition}>{entry.definition}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 28,
    color: colors.text.primary,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  emptyCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '700',
  },
  emptyText: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
  list: {
    gap: spacing.sm,
  },
  card: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    padding: spacing.md,
    gap: spacing.xs,
  },
  name: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '700',
  },
  colorLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: colors.text.muted,
    fontWeight: '700',
  },
  definition: {
    fontSize: 13,
    color: colors.text.secondary,
    lineHeight: 20,
  },
});
