import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { useRelationsStore } from '../../store/useRelationsStore';

type FilterKey = 'all' | 'read' | 'unread' | 'nurture';
type SortKey = 'strongest' | 'recent' | 'az';

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'read', label: 'Read' },
  { key: 'unread', label: 'Unread' },
  { key: 'nurture', label: 'To nurture' },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'strongest', label: 'Strongest' },
  { key: 'recent', label: 'Recent' },
  { key: 'az', label: 'A\u2013Z' },
];

const SHOWCASE_ACCENTS = [
  colors.accent.deepTeal,
  colors.accent.dustyRose,
  colors.accent.mutedSage,
];

export default function GardenScreen() {
  const { activeRelations, archivedRelations, archiveRelation } = useRelationsStore();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('az');

  const showcase = useMemo(() => activeRelations.slice(0, 3), [activeRelations]);

  const displayed = useMemo(() => {
    let list = activeRelations;

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => r.name.toLowerCase().includes(q));
    }

    if (filter === 'read') {
      list = [];
    }

    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeRelations, query, filter]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <Text style={styles.kicker}>Garden</Text>
        <Text style={styles.title}>
          See what lives{'\n'}between you.
        </Text>
        <Text style={styles.subtitle}>
          Baobab maps the shape and pulse{'\n'}
          of the relationships that matter.
        </Text>
      </View>

      <View style={styles.todayCard}>
        <Text style={styles.todayTitle}>Today in your garden</Text>
        <View style={styles.todayItems}>
          <View style={styles.todayItem}>
            <View style={[styles.todayDot, { backgroundColor: colors.accent.deepTeal }]} />
            <Text style={styles.todayText}>
              {activeRelations.length} active link
              {activeRelations.length !== 1 ? 's' : ''}
            </Text>
          </View>
          {activeRelations.length > 0 && (
            <View style={styles.todayItem}>
              <View
                style={[styles.todayDot, { backgroundColor: colors.accent.warmGold }]}
              />
              <Text style={styles.todayText}>
                {activeRelations.length} still unread
              </Text>
            </View>
          )}
          {archivedRelations.length > 0 && (
            <View style={styles.todayItem}>
              <View style={[styles.todayDot, { backgroundColor: colors.text.muted }]} />
              <Text style={styles.todayText}>
                {archivedRelations.length} quietly archived
              </Text>
            </View>
          )}
        </View>
      </View>

      {showcase.length > 0 && (
        <View style={styles.showcaseSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>What Baobab sees</Text>
            <View style={styles.sectionLine} />
          </View>
          <View style={styles.showcaseCard}>
            {showcase.map((relation, idx) => {
              const accent = SHOWCASE_ACCENTS[idx % SHOWCASE_ACCENTS.length];
              return (
                <View key={relation.id}>
                  {idx > 0 && <View style={styles.showcaseDivider} />}
                  <View style={styles.showcaseRow}>
                    <View
                      style={[
                        styles.showcaseAvatar,
                        { backgroundColor: accent + '14', borderColor: accent + '44' },
                      ]}
                    >
                      <Text style={[styles.showcaseInitial, { color: accent }]}>
                        {relation.name.charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.showcaseName}>{relation.name}</Text>
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>Unread</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      <View style={styles.linksSection}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Links</Text>
          <View style={styles.sectionLine} />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtersRow}
        >
          {FILTERS.map((f) => (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[styles.filterPill, filter === f.key && styles.filterPillActive]}
            >
              <Text
                style={[
                  styles.filterPillText,
                  filter === f.key && styles.filterPillTextActive,
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sortsRow}>
          {SORTS.map((s) => (
            <Pressable key={s.key} onPress={() => setSort(s.key)}>
              <Text style={[styles.sortText, sort === s.key && styles.sortTextActive]}>
                {s.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search a link"
          placeholderTextColor={colors.text.muted}
          style={styles.searchInput}
        />

        <View style={styles.cardsList}>
          {displayed.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>
                {query.trim()
                  ? 'No results'
                  : filter !== 'all'
                    ? 'No links match this filter'
                    : 'Your garden is empty'}
              </Text>
              <Text style={styles.emptyText}>
                {query.trim()
                  ? 'Try a different search.'
                  : filter !== 'all'
                    ? 'Try another filter or add a new link.'
                    : 'Add your first relation to start growing.'}
              </Text>
            </View>
          ) : (
            displayed.map((relation) => (
              <View key={relation.id} style={styles.linkCard}>
                <View style={styles.linkAvatar}>
                  <Text style={styles.linkInitial}>
                    {relation.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.linkName}>{relation.name}</Text>
                <View style={styles.unreadBadgeSm}>
                  <Text style={styles.unreadBadgeSmText}>Unread</Text>
                </View>
                <Pressable onPress={() => archiveRelation(relation.id)} hitSlop={8}>
                  <Text style={styles.linkArchiveText}>archive</Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </View>

      <View style={styles.footer}>
        {archivedRelations.length > 0 && (
          <Pressable
            onPress={() => router.push('../relation/archived')}
            style={styles.archivedRow}
          >
            <Text style={styles.archivedRowText}>
              Archived ({archivedRelations.length})
            </Text>
          </Pressable>
        )}
        <Text style={styles.footerText}>
          Baobab — local-first, private by design.
        </Text>
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
    paddingTop: 48,
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },

  hero: {
    gap: spacing.sm,
  },
  kicker: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.text.muted,
    fontWeight: '600',
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text.primary,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text.secondary,
  },

  todayCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  todayTitle: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.text.secondary,
  },
  todayItems: {
    gap: spacing.sm + 2,
  },
  todayItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  todayText: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '500',
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

  showcaseSection: {
    gap: spacing.sm,
  },
  showcaseCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  showcaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  showcaseDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },
  showcaseAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  showcaseInitial: {
    fontSize: 17,
    fontWeight: '700',
  },
  showcaseName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  unreadBadge: {
    backgroundColor: colors.accent.warmGold + '18',
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent.warmGold,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  linksSection: {
    gap: spacing.sm,
  },
  filtersRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  filterPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  filterPillActive: {
    backgroundColor: colors.accent.warmGold,
    borderColor: colors.accent.warmGold,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  filterPillTextActive: {
    color: colors.background.primary,
  },
  sortsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  sortText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },
  sortTextActive: {
    color: colors.accent.warmGold,
  },
  searchInput: {
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text.primary,
    fontSize: 14,
  },

  cardsList: {
    gap: spacing.sm,
  },
  linkCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderLeftWidth: 3,
    borderLeftColor: colors.accent.warmGold + '44',
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  linkAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accent.warmGold + '10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkInitial: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent.warmGold,
  },
  linkName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  unreadBadgeSm: {
    backgroundColor: colors.accent.warmGold + '14',
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  unreadBadgeSmText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent.warmGold,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  linkArchiveText: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '500',
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
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },

  footer: {
    gap: spacing.md,
    alignItems: 'center',
  },
  archivedRow: {
    paddingVertical: spacing.sm,
  },
  archivedRowText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.muted,
  },
  footerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
});
