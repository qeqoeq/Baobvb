import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Fragment, useCallback, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import EgoGraph from '../../components/ui/EgoGraph';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import { getPrimaryNavItems, type PrimaryNavKey } from '../../lib/primary-nav';
import { getRelationSheetIdentity } from '../../lib/relation-detail-helpers';
import { isRevealedNetworkMember } from '../../lib/relation-visibility';
import {
  deriveGatewayAccessState,
  deriveGatewayPowerBand,
  deriveLinkQualityBand,
  derivePresenceMode,
  deriveProximityBand,
  deriveViaState,
  getCircleNodeStatus,
  type MapMember,
} from '../../lib/circle-node-state';
import {
  deriveKeptPlaceWorldSignals,
  getRelationOpenWorldLabel,
} from '../../lib/relation-open-worlds';
import { useRelationsStore } from '../../store/useRelationsStore';
import { PlaceReceivedSheet } from '../../components/place/PlaceReceivedSheet';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CircleScreen() {
  const { me, relations, evaluations, places, receivedObjects, setReceivedObjectStatus } = useRelationsStore();
  const { width: screenWidth } = useWindowDimensions();
  const { bottom: bottomInset } = useSafeAreaInsets();
  const atlasSize = screenWidth;
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const [receivedSheetVisible, setReceivedSheetVisible] = useState(false);
  const [receivedConfirm, setReceivedConfirm] = useState<{
    status: 'kept' | 'not_for_me';
    nameSnapshot: string;
  } | null>(null);

  const readings = useMemo(
    () => getFoundationalReadings(relations, evaluations),
    [relations, evaluations],
  );

  const activeRelationsById = useMemo(
    () => new Map(
      readings
        .filter((r) => !r.relation.archived)
        .map((r) => [r.relation.id, getRelationSheetIdentity({ relation: r.relation }).primaryTitle]),
    ),
    [readings],
  );

  // All revealed relations — both direct canvas and primarily_via members.
  // primarily_via are excluded from the canvas but count toward Network.
  const graphMembers = useMemo<MapMember[]>(
    () => readings
      // B20: exclude archived — they must not appear on the canvas nor in the
      // "in your Bao" count (networkCount = graphMembers.length).
      .filter((r) => isRevealedNetworkMember(r.relation))
      .map((r) => {
        const gatewayPowerBand = deriveGatewayPowerBand(r);
        const relationIdentity = getRelationSheetIdentity({ relation: r.relation });
        const viaState = deriveViaState(r, activeRelationsById);
        return {
          id: r.relation.id,
          name: relationIdentity.primaryTitle,
          status: getCircleNodeStatus(r),
          avatarSeed: r.relation.avatarSeed,
          proximityBand: deriveProximityBand(r),
          gatewayPowerBand,
          gatewayAccessState: deriveGatewayAccessState(r, gatewayPowerBand),
          linkQualityBand: deriveLinkQualityBand(r),
          viaState,
          presenceMode: derivePresenceMode(r, viaState),
        };
      }),
    [readings, activeRelationsById],
  );

  // Canvas: direct presence only — primarily_via nodes live in Through X views.
  const canvasMembers = useMemo(
    () => graphMembers.filter((m) => m.presenceMode === 'direct'),
    [graphMembers],
  );

  // Network = all people you've completed a mutual reveal with, direct or via gateway.
  const networkCount = graphMembers.length;

  // Links still forming (non-archived, not yet mutually revealed).
  const nonRevealedCount = useMemo(
    () => readings.filter((r) =>
      !r.relation.archived &&
      r.relation.localState.revealSnapshot.status !== 'revealed',
    ).length,
    [readings],
  );

  // Subset of forming links that are reveal_ready — distinct urgency from cooking/waiting.
  const readyCount = useMemo(
    () => readings.filter((r) =>
      !r.relation.archived &&
      r.relation.localState.revealSnapshot.status === 'reveal_ready',
    ).length,
    [readings],
  );

  const trustedWorlds = useMemo(
    () => deriveKeptPlaceWorldSignals(places, relations, evaluations),
    [places, relations, evaluations],
  );

  // Active forming only: cooking_reveal or waiting_other_side WITH a private reading.
  // Excludes unread/private contacts (snap status waiting_other_side, no reading yet) —
  // those are not in an active Baobab flow and should not count as "forming".
  const formingCount = useMemo(
    () => readings.filter((r) =>
      !r.relation.archived && (
        r.relation.localState.revealSnapshot.status === 'cooking_reveal' ||
        (r.relation.localState.revealSnapshot.status === 'waiting_other_side' &&
          r.hasFoundationalReading)
      ),
    ).length,
    [readings],
  );

  // Oldest unresolved received object — one at a time, no counter.
  const pendingReceived = useMemo(
    () =>
      [...receivedObjects]
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .find((r) => r.status === 'new') ?? null,
    [receivedObjects],
  );

  const pendingFromName = useMemo(() => {
    if (!pendingReceived) return null;
    const rel = relations.find((r) => r.id === pendingReceived.fromRelationId);
    return rel ? getRelationSheetIdentity({ relation: rel }).primaryTitle : null;
  }, [pendingReceived, relations]);

  const handleOpenReceived = useCallback(() => {
    setReceivedConfirm(null);
    setReceivedSheetVisible(true);
  }, []);

  const handleKeep = useCallback(() => {
    if (!pendingReceived) return;
    const nameSnapshot = pendingReceived.nameSnapshot;
    setReceivedObjectStatus(pendingReceived.id, 'kept');
    setReceivedSheetVisible(false);
    setReceivedConfirm({ status: 'kept', nameSnapshot });
  }, [pendingReceived, setReceivedObjectStatus]);

  const handleNotForMe = useCallback(() => {
    if (!pendingReceived) return;
    const nameSnapshot = pendingReceived.nameSnapshot;
    setReceivedObjectStatus(pendingReceived.id, 'not_for_me');
    setReceivedSheetVisible(false);
    setReceivedConfirm({ status: 'not_for_me', nameSnapshot });
  }, [pendingReceived, setReceivedObjectStatus]);

  // Gateway tap → Through X. Locked gateway → alert. Regular node → relation screen.
  const handleNodeTap = useCallback((member: MapMember) => {
    if (member.gatewayAccessState === 'open') {
      if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`../through/${member.id}`);
    } else if (member.gatewayAccessState === 'locked') {
      if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      Alert.alert(
        'Not open yet',
        `Complete your reveal with ${member.name} to access their world.`,
      );
    } else {
      if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`../relation/${member.id}`);
    }
  }, []);

  const handleOverflowTap = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/garden' });
  }, [router]);

  // Center (me) tap: open Profile — the self-as-center-of-control gesture.
  const handleCenterTap = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/me/profile');
  }, []);

  const handleCenterLongPress = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/me/qr');
  }, []);

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.glowAccent} />

      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <View style={styles.headerBrand}>
            <View style={styles.baobabMark} />
            <Text style={styles.headerKicker}>{'BAOBAB'}</Text>
          </View>
          <Text style={styles.headerTitle}>Your Bao</Text>
        </View>
        <View style={styles.headerRight}>
          {networkCount > 0 && (
            <View style={styles.networkBadge}>
              <Text style={styles.networkCount}>{networkCount}</Text>
              <Text style={styles.networkLabel}>{'in your Bao'}</Text>
            </View>
          )}
          <Pressable
            style={styles.addPersonBtn}
            onPress={() => {
              if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActionMenuVisible(true);
            }}
          >
            <Ionicons name="person-add-outline" size={20} color={colors.text.secondary} />
          </Pressable>
        </View>
      </View>

      {/* Atlas — fills the remaining space; graph floats vertically centered */}
      <View style={[styles.atlasWrap, { paddingBottom: Math.max(spacing.md, bottomInset) }]}>
        <View style={styles.worldCard}>
          <View style={styles.worldCardCanvas}>
            <EgoGraph
              members={canvasMembers}
              me={me}
              size={atlasSize}
              onOverflowTap={handleOverflowTap}
              onNodeTap={handleNodeTap}
              onCenterTap={handleCenterTap}
              onCenterLongPress={handleCenterLongPress}
              allMembers={graphMembers}
              emptyText={null}
            />
            {canvasMembers.length === 0 && nonRevealedCount === 0 && (
              <Pressable
                style={styles.emptyPrompt}
                onPress={() => {
                  if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('../relation/add');
                }}
              >
                <Text style={styles.emptyPromptHeadline}>{'Start with someone who matters.'}</Text>
                <Text style={styles.emptyPromptSupport}>{'A private reading. Nothing opens until both sides are ready.'}</Text>
                <Text style={styles.emptyPromptAction}>{'Begin a reading'}</Text>
              </Pressable>
            )}

          </View>
          {(readyCount > 0 || formingCount > 0) && (
            <View style={styles.worldCardHint}>
              {readyCount > 0 && (
                <Pressable
                  style={styles.worldCardHintChunk}
                  onPress={() => router.push({ pathname: '/garden', params: { filter: 'ready' } })}
                >
                  <View style={[styles.formingDot, styles.formingDotReady]} />
                  <Text style={[styles.worldCardHintText, styles.worldCardHintTextReady]}>
                    {`${readyCount} ready`}
                  </Text>
                </Pressable>
              )}
              {readyCount > 0 && formingCount > 0 && (
                <Text style={styles.worldCardHintDivider}>{'·'}</Text>
              )}
              {formingCount > 0 && (
                <Pressable
                  style={styles.worldCardHintChunk}
                  onPress={() => router.push({ pathname: '/garden', params: { filter: 'forming' } })}
                >
                  <View style={styles.formingDot} />
                  <Text style={styles.worldCardHintText}>
                    {`${formingCount} forming`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
          {trustedWorlds.length > 0 && (
            <View style={styles.worldsStrip}>
              <Text style={styles.worldsStripEyebrow}>{'OPEN WORLDS'}</Text>
              <View style={styles.worldsStripWorldsRow}>
                {trustedWorlds.map((world, index) => (
                  <Fragment key={world}>
                    {index > 0 ? <Text style={styles.worldsStripWorlds}>{' · '}</Text> : null}
                    <Pressable
                      onPress={() => {
                        if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push(`/world/${world}`);
                      }}
                    >
                      <Text style={styles.worldsStripWorlds}>{getRelationOpenWorldLabel(world)}</Text>
                    </Pressable>
                  </Fragment>
                ))}
              </View>
              <Text style={styles.worldsStripCaption}>
                {'Private signals from your Bao.'}
              </Text>
              <Pressable
                onPress={() => {
                  if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push('../place');
                }}
              >
                <Text style={styles.worldsStripPlacesLink}>{'View your places →'}</Text>
              </Pressable>
              {receivedConfirm !== null ? (
                <Text style={styles.receivedConfirmText}>
                  {receivedConfirm.status === 'kept' ? 'Kept.' : 'Not for me.'}
                </Text>
              ) : pendingReceived !== null ? (
                <Pressable onPress={handleOpenReceived}>
                  <Text style={styles.receivedPrompt} numberOfLines={1}>
                    {`${pendingFromName ?? 'Someone'} thought of you · ${pendingReceived.nameSnapshot} →`}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>
      </View>

      <PlaceReceivedSheet
        visible={receivedSheetVisible}
        receivedObject={pendingReceived}
        fromRelationName={pendingFromName}
        onClose={() => setReceivedSheetVisible(false)}
        onKeep={handleKeep}
        onNotForMe={handleNotForMe}
      />

      <Modal
        visible={actionMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setActionMenuVisible(false)}
      >
        <Pressable
          style={styles.actionMenuBackdrop}
          onPress={() => setActionMenuVisible(false)}
        >
          <Pressable style={styles.actionMenuCard} onPress={() => {}}>
            <Pressable
              style={styles.actionMenuRow}
              onPress={() => {
                setActionMenuVisible(false);
                router.push('../relation/add');
              }}
            >
              <Text style={styles.actionMenuRowText}>{'Start a reading'}</Text>
              <Text style={styles.actionMenuRowSupport}>{'Understand a connection'}</Text>
            </Pressable>
            <View style={styles.actionMenuDivider} />
            <Pressable
              style={styles.actionMenuRow}
              onPress={() => {
                setActionMenuVisible(false);
                router.push('../place/add');
              }}
            >
              <Text style={styles.actionMenuRowText}>{'Keep a place'}</Text>
              <Text style={styles.actionMenuRowSupport}>{'Keep a real-world trace'}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* B23: permanent primary navigation. Always present — counts are only
          informational badges, never the condition for an entry to exist. */}
      <View style={[styles.primaryNav, { paddingBottom: bottomInset + spacing.xs }]}>
        {getPrimaryNavItems({ pendingReveals: readyCount + formingCount }).map((item) => {
          const routeByKey: Record<PrimaryNavKey, Href> = {
            garden: '/garden',
            places: '/place',
            reveals: '/reveals',
            profile: '/me/profile',
          };
          return (
            <Pressable
              key={item.key}
              style={styles.primaryNavItem}
              onPress={() => {
                if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                router.push(routeByKey[item.key]);
              }}
            >
              <Text style={styles.primaryNavLabel}>{item.label}</Text>
              {item.badge !== null ? (
                <View style={styles.primaryNavBadge}>
                  <Text style={styles.primaryNavBadgeText}>{item.badge}</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  primaryNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border.soft,
    backgroundColor: colors.background.primary,
  },
  primaryNavItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  primaryNavLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 0.2,
  },
  primaryNavBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.warmGold,
  },
  primaryNavBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: colors.background.primary,
  },
  glowAccent: {
    position: 'absolute',
    top: 24,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent.warmGold + '0C',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitleBlock: {
    gap: 2,
  },
  headerKicker: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.accent.warmGold,
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  addPersonBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 18,
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '1E',
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  networkCount: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text.primary,
  },
  networkLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.secondary,
    letterSpacing: 0.3,
  },
  actionMenuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  actionMenuCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.secondary,
    overflow: 'hidden',
  },
  actionMenuRow: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 2,
  },
  actionMenuRowText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  actionMenuRowSupport: {
    fontSize: 12,
    color: colors.text.muted,
  },
  actionMenuDivider: {
    height: 1,
    backgroundColor: colors.border.soft,
  },

  atlasWrap: {
    flex: 1,
    paddingTop: spacing.xs,
  },

  worldCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '20',
    overflow: 'hidden',
  },
  worldCardCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.lg,
  },
  worldCardHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs + 2,
    paddingBottom: spacing.xs + 2,
    borderTopWidth: 1,
    borderTopColor: colors.accent.warmGold + '12',
  },
  formingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent.warmGold,
    opacity: 0.8,
  },
  formingDotReady: {
    backgroundColor: colors.accent.deepTeal,
    opacity: 1,
  },
  worldCardHintText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent.warmGold,
    opacity: 0.8,
  },
  worldCardHintTextReady: {
    color: colors.accent.deepTeal,
    opacity: 1,
  },
  worldCardHintChunk: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  worldCardHintDivider: {
    fontSize: 10,
    color: colors.text.muted,
  },

  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  baobabMark: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent.warmGold,
    shadowColor: colors.accent.warmGold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 5,
  },

  worldsStrip: {
    borderTopWidth: 1,
    borderTopColor: colors.accent.warmGold + '12',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 2,
    gap: 4,
  },
  worldsStripWorldsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  worldsStripEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent.warmGold + 'AA',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  worldsStripWorlds: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    lineHeight: 18,
  },
  worldsStripCaption: {
    fontSize: 10,
    color: colors.text.muted,
    lineHeight: 15,
    opacity: 0.8,
  },
  worldsStripPlacesLink: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accent.warmGold,
    marginTop: 2,
  },
  receivedPrompt: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.accent.warmGold,
    opacity: 0.75,
    marginTop: 2,
  },
  receivedConfirmText: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
    marginTop: 2,
  },

  emptyPrompt: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    gap: spacing.xs,
    top: '58%',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.background.primary + 'B8',
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '18',
  },
  emptyPromptHeadline: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  emptyPromptSupport: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  emptyPromptAction: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.warmGold,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
