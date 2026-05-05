import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo } from 'react';
import { Alert, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import EgoGraph from '../../components/ui/EgoGraph';
import { getFoundationalReadings } from '../../lib/foundational-reading';
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
import { useRelationsStore } from '../../store/useRelationsStore';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function CircleScreen() {
  const { me, relations, evaluations } = useRelationsStore();
  const { width: screenWidth } = useWindowDimensions();
  const atlasSize = screenWidth - spacing.lg * 2;

  const readings = useMemo(
    () => getFoundationalReadings(relations, evaluations),
    [relations, evaluations],
  );

  const activeRelationsById = useMemo(
    () => new Map(
      readings
        .filter((r) => !r.relation.archived)
        .map((r) => [r.relation.id, r.relation.name]),
    ),
    [readings],
  );

  // All revealed relations — both direct canvas and primarily_via members.
  // primarily_via are excluded from the canvas but count toward Network.
  const graphMembers = useMemo<MapMember[]>(
    () => readings
      .filter((r) => r.relation.localState.revealSnapshot.status === 'revealed')
      .map((r) => {
        const gatewayPowerBand = deriveGatewayPowerBand(r);
        const viaState = deriveViaState(r, activeRelationsById);
        return {
          id: r.relation.id,
          name: r.relation.name,
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
  }, []);

  // Center (me) tap: open Profile — the self-as-center-of-control gesture.
  const handleCenterTap = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/me/profile');
  }, []);

  return (
    <View style={styles.screen}>

      {/* Header — world identity + network count + add person */}
      <View style={styles.header}>
        <View style={styles.headerTitleBlock}>
          <Text style={styles.headerKicker}>{'BAOBAB'}</Text>
          <Text style={styles.headerTitle}>World</Text>
        </View>
        <View style={styles.headerRight}>
          {networkCount > 0 && (
            <View style={styles.networkBadge}>
              <Text style={styles.networkLabel}>{'Network'}</Text>
              <Text style={styles.networkCount}>{networkCount}</Text>
            </View>
          )}
          <Pressable
            style={styles.addPersonBtn}
            onPress={() => {
              if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('../relation/add');
            }}
          >
            <Ionicons name="person-add-outline" size={20} color={colors.text.secondary} />
          </Pressable>
        </View>
      </View>

      {/* Atlas — fills the remaining space; graph floats vertically centered */}
      <View style={styles.atlasWrap}>
        <View style={styles.worldCard}>
          <View style={styles.worldCardCanvas}>
            <EgoGraph
              members={canvasMembers}
              me={me}
              size={atlasSize}
              onOverflowTap={handleOverflowTap}
              onNodeTap={handleNodeTap}
              onCenterTap={handleCenterTap}
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
                <Text style={styles.emptyPromptHeadline}>{'Your world begins with one person.'}</Text>
                <Text style={styles.emptyPromptSupport}>{'Add someone you trust to begin.'}</Text>
                <Text style={styles.emptyPromptAction}>{'Add someone →'}</Text>
              </Pressable>
            )}
            <Text style={styles.brandWatermark}>{'BAOBAB'}</Text>
          </View>
          {nonRevealedCount > 0 && (
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
              {readyCount > 0 && nonRevealedCount > readyCount && (
                <Text style={styles.worldCardHintDivider}>{'·'}</Text>
              )}
              {nonRevealedCount > readyCount && (
                <Pressable
                  style={styles.worldCardHintChunk}
                  onPress={() => router.push({ pathname: '/garden', params: { filter: 'forming' } })}
                >
                  <View style={styles.formingDot} />
                  <Text style={styles.worldCardHintText}>
                    {`${nonRevealedCount - readyCount} forming`}
                  </Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 48,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitleBlock: {
    gap: 1,
  },
  headerKicker: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.secondary,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 22,
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
  },
  networkBadge: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 5,
  },
  networkCount: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
  },
  networkLabel: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
    letterSpacing: 0.2,
  },

  // Atlas wrap — fills remaining height after header
  atlasWrap: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },

  // World card — the atlas container; graph floats centered within it
  worldCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    overflow: 'hidden',
  },
  worldCardCanvas: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandWatermark: {
    position: 'absolute',
    bottom: spacing.md,
    alignSelf: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    letterSpacing: 2.5,
    opacity: 0.60,
  },
  worldCardHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
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

  // Empty state — shown when zero relations and nothing forming
  // top: 65% keeps the block below the center node label (cy ≈ 50%, label bottom ≈ 57%)
  emptyPrompt: {
    position: 'absolute',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 6,
    top: '65%',
  },
  emptyPromptHeadline: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.secondary,
    textAlign: 'center',
  },
  emptyPromptSupport: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  emptyPromptAction: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent.warmGold,
    textAlign: 'center',
    marginTop: 2,
  },
});
