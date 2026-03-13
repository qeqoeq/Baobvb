import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { getTierAccent } from '../../lib/evaluation';
import { getFoundationalReadings, getGardenMicroSignal } from '../../lib/foundational-reading';
import {
  getPlaceCategoryLabel,
  getPlaceReading,
  getPlaceRatingSignature,
  getPlaceTone,
  sanitizeRating,
} from '../../lib/places';
import { useRelationsStore } from '../../store/useRelationsStore';

const QUICK_ACTIONS = [
  {
    key: 'add-person',
    title: 'Add a person',
    subtitle: 'Start mapping a new link',
    accent: colors.accent.deepTeal,
  },
  {
    key: 'scan-code',
    title: 'Scan a code',
    subtitle: 'Connect instantly nearby',
    accent: colors.accent.softAmber,
  },
  {
    key: 'share-card',
    title: 'Share my card',
    subtitle: 'Let others discover you',
    accent: colors.accent.mutedSage,
  },
  {
    key: 'rate-place',
    title: 'Rate a place',
    subtitle: 'Add one place memory',
    accent: colors.accent.dustyRose,
  },
] as const;

export default function GardenScreen() {
  const { me, activeRelations, archivedRelations, evaluations, places } = useRelationsStore();

  const entries = useMemo(
    () => getFoundationalReadings(activeRelations, evaluations),
    [activeRelations, evaluations],
  );

  const readCount = useMemo(
    () => entries.filter((entry) => entry.readingStatus === 'Read').length,
    [entries],
  );
  const unreadCount = useMemo(
    () => entries.filter((entry) => entry.readingStatus === 'Unread').length,
    [entries],
  );
  const toNurtureCount = useMemo(
    () => entries.filter((entry) => entry.toNurture).length,
    [entries],
  );

  const continueMapping = useMemo(
    () => [...entries].sort((a, b) => b.recentDate.localeCompare(a.recentDate)).slice(0, 4),
    [entries],
  );

  const trustStatus = useMemo(() => {
    if (me.trustPassportStatus === 'new') return 'Passport not mapped yet';
    if (me.trustPassportStatus === 'steady') return 'Trust well rooted';
    return toNurtureCount > 0 ? 'Trust in motion' : 'Trust growing';
  }, [me.trustPassportStatus, toNurtureCount]);

  const recentPlaces = useMemo(
    () => [...places].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3),
    [places],
  );

  const openQrCard = () => {
    router.push('../me/qr');
  };
  const openScan = () => {
    router.push('../me/scan');
  };

  const shareMyCard = async () => {
    try {
      await Share.share({
        title: 'My Baobab card',
        message: `Connect with ${me.displayName} on Baobab (${me.handle}).`,
      });
    } catch {
      Alert.alert('Share my card', 'Sharing is not available on this device.');
    }
  };

  const openAddPersonSheet = () => {
    Alert.alert('Add a person', 'Choose how to create a new connection.', [
      { text: 'Scan a code', onPress: openScan },
      { text: 'Show my code', onPress: openQrCard },
      { text: 'Add manually', onPress: () => router.push('../relation/add') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const onQuickAction = (key: (typeof QUICK_ACTIONS)[number]['key']) => {
    if (key === 'add-person') return openAddPersonSheet();
    if (key === 'scan-code') return openScan();
    if (key === 'share-card') return void shareMyCard();
    router.push('../place/add');
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.passportCard}>
        <Text style={styles.passportKicker}>Passport Garden Home</Text>
        <View style={styles.passportTopRow}>
          <View style={styles.avatarWrap}>
            <View style={styles.avatarRing}>
              <View style={styles.avatarInner}>
                <Text style={styles.avatarText}>
                  {(me.avatarSeed || me.displayName.charAt(0) || '?').toUpperCase()}
                </Text>
              </View>
            </View>
          </View>
          <View style={styles.passportTextBlock}>
            <Text style={styles.passportName}>{me.displayName}</Text>
            <Text style={styles.passportHandle}>{me.handle}</Text>
            <View style={styles.trustBadge}>
              <View style={styles.trustDot} />
              <Text style={styles.trustBadgeText}>{trustStatus}</Text>
            </View>
          </View>
        </View>
        <View style={styles.heroActionsRow}>
          <Pressable
            onPress={() => void shareMyCard()}
            style={[styles.heroActionButton, styles.heroActionPrimary]}
          >
            <Text style={styles.heroActionPrimaryText}>Share my card</Text>
          </Pressable>
          <Pressable
            onPress={openQrCard}
            style={styles.heroActionButton}
          >
            <Text style={styles.heroActionText}>Show QR</Text>
          </Pressable>
          <Pressable
            onPress={openScan}
            style={styles.heroActionButton}
          >
            <Text style={styles.heroActionText}>Scan</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => router.push('../me/edit')} style={styles.editCardButton}>
          <Text style={styles.editCardButtonText}>Edit my card</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Quick actions</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.quickGrid}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              onPress={() => onQuickAction(action.key)}
              style={[styles.quickCard, { borderColor: action.accent + '44' }]}
            >
              <View style={[styles.quickAccent, { backgroundColor: action.accent }]} />
              <Text style={styles.quickTitle}>{action.title}</Text>
              <Text style={styles.quickSubtitle}>{action.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Nearby right now</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.nearbyCard}>
          <Text style={styles.nearbyTitle}>Ready for an in-person moment</Text>
          <Text style={styles.nearbyText}>
            Let someone scan you, scan their code, or open your card full-screen.
          </Text>
          <View style={styles.nearbyRow}>
            <Pressable onPress={openQrCard}>
              <Text style={styles.nearbyLink}>Let someone scan me</Text>
            </Pressable>
            <Pressable onPress={openScan}>
              <Text style={styles.nearbyLink}>Scan someone else</Text>
            </Pressable>
            <Pressable onPress={openQrCard}>
              <Text style={styles.nearbyLink}>Open my card</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Continue mapping</Text>
          <View style={styles.sectionLine} />
        </View>

        {continueMapping.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No people mapped yet</Text>
            <Text style={styles.emptyText}>
              Add your first person to start building your trust garden.
            </Text>
          </View>
        ) : (
          <View style={styles.mappingList}>
            {continueMapping.map((entry) => {
              const accent = entry.linkTier
                ? getTierAccent(entry.linkTier)
                : colors.accent.warmGold;
              const signal = getGardenMicroSignal(entry);

              return (
                <Pressable
                  key={entry.relation.id}
                  onPress={() => router.push(`../relation/${entry.relation.id}`)}
                  style={[styles.mappingCard, { borderLeftColor: accent + '66' }]}
                >
                  <View style={[styles.mappingAvatar, { backgroundColor: accent + '16' }]}>
                    <Text style={[styles.mappingInitial, { color: accent }]}>
                      {(entry.relation.avatarSeed || entry.relation.name.charAt(0) || '?').toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.mappingBody}>
                    <Text style={styles.mappingName}>{entry.relation.name}</Text>
                    <Text style={styles.mappingMeta}>
                      {entry.relation.handle
                        ? `${entry.relation.handle} · `
                        : ''}
                      {entry.readingStatus === 'Read'
                        ? `${entry.badgeLabel} · ${entry.foundationalScore}`
                        : 'Unread'}
                    </Text>
                    <Text
                      style={[
                        styles.mappingSignal,
                        signal.tone === 'nurture'
                          ? styles.mappingSignalNurture
                          : signal.tone === 'stable'
                            ? styles.mappingSignalStable
                            : styles.mappingSignalUnread,
                      ]}
                    >
                      {signal.text}
                    </Text>
                  </View>
                  <Text style={styles.mappingCTA}>Resume</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Places & tastes</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.placesCard}>
          <Text style={styles.placesTitle}>Your places memory is now live</Text>
          <Text style={styles.placesText}>
            Keep simple taste signals around cafes, restaurants and social spots.
          </Text>
          {recentPlaces.length === 0 ? (
            <View style={styles.placesEmptyCard}>
              <Text style={styles.placesEmptyTitle}>No place rated yet</Text>
              <Text style={styles.placesEmptyText}>
                Start with one place and one clean impression.
              </Text>
            </View>
          ) : (
            <View style={styles.placesList}>
              {recentPlaces.map((place) => {
                const safeRating = sanitizeRating(place.rating);
                const tone = getPlaceTone(safeRating);
                return (
                  <View
                    key={place.id}
                    style={[
                      styles.placeRow,
                      {
                        borderColor: tone.border,
                        backgroundColor: tone.tint,
                      },
                    ]}
                  >
                    <View style={styles.placeRowBody}>
                      <Text style={styles.placeRowName}>{place.name}</Text>
                      <Text style={styles.placeRowMeta}>
                        {getPlaceCategoryLabel(place.category)} · {getPlaceRatingSignature(safeRating)}
                      </Text>
                      <Text style={styles.placeRowReading} numberOfLines={1}>
                        {getPlaceReading(place)}
                      </Text>
                    </View>
                    <Text style={[styles.placeRowRating, { color: tone.accent }]}>
                      {safeRating}/5
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          <View style={styles.placesActions}>
            <Pressable onPress={() => router.push('../place/add')}>
              <Text style={styles.placesLink}>Rate a place</Text>
            </Pressable>
            <Pressable onPress={() => router.push('../place')}>
              <Text style={styles.placesLinkSecondary}>Open places</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Garden pulse</Text>
          <View style={styles.sectionLine} />
        </View>
        <View style={styles.pulseGrid}>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{activeRelations.length}</Text>
            <Text style={styles.pulseLabel}>Active</Text>
          </View>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{archivedRelations.length}</Text>
            <Text style={styles.pulseLabel}>Archived</Text>
          </View>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{readCount}</Text>
            <Text style={styles.pulseLabel}>Read</Text>
          </View>
          <View style={styles.pulseCard}>
            <Text style={styles.pulseValue}>{unreadCount}</Text>
            <Text style={styles.pulseLabel}>Unread</Text>
          </View>
          <View style={styles.pulseCardWide}>
            <Text style={styles.pulseValue}>{toNurtureCount}</Text>
            <Text style={styles.pulseLabel}>To nurture</Text>
          </View>
        </View>

        {archivedRelations.length > 0 && (
          <Pressable onPress={() => router.push('../relation/archived')} style={styles.archivedRow}>
            <Text style={styles.archivedRowText}>Open archived people</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Baobab — local-first, private by design.</Text>
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
    paddingTop: 44,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },

  section: {
    gap: spacing.sm,
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

  passportCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.strong,
    padding: spacing.lg,
    gap: spacing.md,
  },
  passportKicker: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    color: colors.text.muted,
    fontWeight: '600',
  },
  passportTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatarWrap: {
    padding: 2,
  },
  avatarRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 2,
    borderColor: colors.accent.softAmber + '55',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
  },
  avatarText: {
    fontSize: 28,
    color: colors.text.primary,
    fontWeight: '700',
  },
  passportTextBlock: {
    flex: 1,
    gap: 4,
  },
  passportName: {
    fontSize: 26,
    lineHeight: 30,
    color: colors.text.primary,
    fontWeight: '700',
  },
  passportHandle: {
    fontSize: 14,
    color: colors.accent.warmGold,
    fontWeight: '600',
  },
  trustBadge: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  trustDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.mutedSage,
  },
  trustBadgeText: {
    fontSize: 11,
    color: colors.text.secondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  heroActionsRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  heroActionButton: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  heroActionPrimary: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold + '15',
  },
  heroActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  heroActionPrimaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.warmGold,
  },
  editCardButton: {
    alignSelf: 'flex-start',
    paddingTop: spacing.xs,
  },
  editCardButtonText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  quickGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickCard: {
    width: '48.5%',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.xs,
  },
  quickAccent: {
    width: 18,
    height: 3,
    borderRadius: 2,
    marginBottom: spacing.xs,
  },
  quickTitle: {
    fontSize: 14,
    color: colors.text.primary,
    fontWeight: '600',
  },
  quickSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.secondary,
  },

  nearbyCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  nearbyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text.primary,
  },
  nearbyText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  nearbyRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  nearbyLink: {
    fontSize: 12,
    color: colors.accent.softAmber,
    fontWeight: '600',
  },

  mappingList: {
    gap: spacing.sm,
  },
  mappingCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderLeftWidth: 3,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  mappingAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mappingInitial: {
    fontSize: 14,
    fontWeight: '700',
  },
  mappingBody: {
    flex: 1,
    gap: 2,
  },
  mappingName: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '600',
  },
  mappingMeta: {
    fontSize: 12,
    color: colors.text.muted,
  },
  mappingSignal: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  mappingSignalUnread: {
    color: colors.text.muted,
  },
  mappingSignalNurture: {
    color: colors.accent.softCoral,
  },
  mappingSignalStable: {
    color: colors.accent.mutedSage,
  },
  mappingCTA: {
    fontSize: 12,
    color: colors.accent.warmGold,
    fontWeight: '700',
  },

  placesCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accent.dustyRose + '33',
    padding: spacing.lg,
    gap: spacing.sm,
  },
  placesTitle: {
    fontSize: 16,
    color: colors.text.primary,
    fontWeight: '600',
  },
  placesText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  placesLink: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.dustyRose,
  },
  placesLinkSecondary: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  placesActions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  placesEmptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.sm,
    gap: 2,
  },
  placesEmptyTitle: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '600',
  },
  placesEmptyText: {
    fontSize: 12,
    color: colors.text.secondary,
    lineHeight: 18,
  },
  placesList: {
    gap: spacing.xs,
  },
  placeRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  placeRowBody: {
    flex: 1,
    gap: 2,
  },
  placeRowName: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '600',
  },
  placeRowMeta: {
    fontSize: 11,
    color: colors.text.muted,
  },
  placeRowReading: {
    fontSize: 12,
    color: '#CAC2B8',
  },
  placeRowRating: {
    fontSize: 12,
    fontWeight: '700',
  },

  pulseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  pulseCard: {
    width: '48.5%',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  pulseCardWide: {
    width: '100%',
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 2,
  },
  pulseValue: {
    fontSize: 26,
    color: colors.text.primary,
    fontWeight: '700',
  },
  pulseLabel: {
    fontSize: 11,
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontWeight: '600',
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
    color: colors.text.primary,
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },

  archivedRow: {
    alignSelf: 'center',
    paddingVertical: spacing.xs,
  },
  archivedRowText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },

  footer: {
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  footerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
});
