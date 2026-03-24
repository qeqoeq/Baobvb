import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function ArchivedRelationsScreen() {
  const { archivedRelations, restoreRelation } = useRelationsStore();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {archivedRelations.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No archived relationships</Text>
          <Text style={styles.emptyBody}>
            Relationships you archive will appear here.
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {archivedRelations.map((relation) => (
            <View key={relation.id} style={styles.row}>
              <Text style={styles.name}>{relation.name}</Text>
              <Pressable
                onPress={() => restoreRelation(relation.id)}
                style={styles.restoreButton}
              >
                <Text style={styles.restoreButtonText}>Restore</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
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
    paddingBottom: spacing.xxl,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
    flex: 1,
  },
  restoreButton: {
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.strong,
    backgroundColor: colors.background.tertiary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.xs + 2,
  },
  restoreButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  emptyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emptyBody: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
});
