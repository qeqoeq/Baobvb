import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCallback, useMemo } from 'react';
import { Alert, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '../../constants/colors';
import { spacing } from '../../constants/spacing';
import EgoGraph from '../../components/ui/EgoGraph';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import { getRelationSheetIdentity } from '../../lib/relation-detail-helpers';
import { isRevealedNetworkMember } from '../../lib/relation-visibility';
import {
  deriveGatewayAccessState,
  deriveGatewayPowerBand,
  deriveLinkQualityBand,
  derivePresenceMode,
  deriveViaState,
  getCircleNodeStatus,
  type MapMember,
} from '../../lib/circle-node-state';
import { useRelationsStore } from '../../store/useRelationsStore';

// ─── Screen ───────────────────────────────────────────────────────────────────

export default function ThroughScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { relations, evaluations } = useRelationsStore();
  const { width: screenWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const atlasSize = screenWidth;

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

  const gateway = useMemo(
    () => relations.find((r) => r.id === id) ?? null,
    [relations, id],
  );

  const gatewayTitle = useMemo(
    () => (gateway ? getRelationSheetIdentity({ relation: gateway }).primaryTitle : '…'),
    [gateway],
  );

  // Members reached primarily through this gateway.
  // viaState forced to 'direct' — the center IS already the via target.
  const viaMembers = useMemo<MapMember[]>(
    () => readings
      .filter((r) => {
        // B20: archived relations never appear as gateway members.
        if (!isRevealedNetworkMember(r.relation)) return false;
        const vs = deriveViaState(r, activeRelationsById);
        if (vs.kind !== 'via' || vs.relId !== id) return false;
        return derivePresenceMode(r, vs) === 'primarily_via';
      })
      .map((r) => {
        const gatewayPowerBand = deriveGatewayPowerBand(r);
        const relationIdentity = getRelationSheetIdentity({ relation: r.relation });
        return {
          id: r.relation.id,
          name: relationIdentity.primaryTitle,
          status: getCircleNodeStatus(r),
          avatarSeed: r.relation.avatarSeed,
          proximityBand: 'outer' as const,
          gatewayPowerBand,
          gatewayAccessState: deriveGatewayAccessState(r, gatewayPowerBand),
          linkQualityBand: deriveLinkQualityBand(r),
          viaState: { kind: 'direct' } as const,
          presenceMode: 'direct' as const,
        };
      }),
    [readings, activeRelationsById, id],
  );

  // Center = gateway person, warmGold — visually distinct from "me" in World
  const gatewayCenter = useMemo(
    () => ({
      displayName: gatewayTitle,
      avatarSeed:
        gateway?.avatarSeed ||
        (gatewayTitle.trim().charAt(0).toUpperCase() || '?'),
    }),
    [gateway, gatewayTitle],
  );

  const gatewayInitial =
    (gateway?.avatarSeed || gatewayTitle.trim().charAt(0) || '?').toUpperCase();

  // Gateway-aware tap: open gateways drill to Through X; locked → alert; others → relation.
  const handleNodeTap = useCallback((member: MapMember) => {
    if (member.gatewayAccessState === 'open') {
      if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`../through/${member.id}`);
    } else if (member.gatewayAccessState === 'locked') {
      if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      Alert.alert('Pas encore ouvert', `Termine ta révélation avec ${member.name} pour accéder à son monde.`);
    } else {
      if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      router.push(`../relation/${member.id}`);
    }
  }, []);

  // Tapping the center → gateway's relation screen
  const handleCenterTap = useCallback(() => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`../relation/${id}`);
  }, [id]);

  const handleOverflowTap = useCallback(() => {}, []);

  const memberCount = viaMembers.length;

  return (
    <View style={styles.screen}>

      {/* ── Identity zone — Lena's presence, fills the top ── */}
      {/* paddingTop = status bar + 44pt nav bar (transparent header) + 8pt gap */}
      <View style={[styles.identityZone, { paddingTop: insets.top + 52 }]}>
        <View style={styles.gatewayAvatarCircle}>
          <Text style={styles.gatewayInitial}>{gatewayInitial}</Text>
        </View>
        <Text style={styles.gatewayName} numberOfLines={1}>
          {gatewayTitle}
        </Text>
        {memberCount > 0 && (
          <View style={styles.opensRow}>
            <Text style={styles.opensCount}>{memberCount}</Text>
            <Text style={styles.opensLabel}>{memberCount === 1 ? ' relation' : ' relations'}</Text>
          </View>
        )}
      </View>

      {/* ── Thin warmGold separator ── */}
      <View style={styles.separator} />

      {/* ── Graph — sits directly under identity zone ── */}
      <View style={styles.graphSection}>
        <EgoGraph
          members={viaMembers}
          me={gatewayCenter}
          size={atlasSize}
          onOverflowTap={handleOverflowTap}
          onNodeTap={handleNodeTap}
          onCenterTap={handleCenterTap}
          centerRadius={30}
          centerColor={colors.accent.warmGold}
          emptyText={`Aucune connexion via ${gatewayTitle} pour l’instant.`}
        />
        <Text style={styles.brandWatermark}>{'BAOBAB'}</Text>
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

  // ── Identity zone ──────────────────────────────────────────────────────────

  identityZone: {
    paddingBottom: 20,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: 8,
  },
  gatewayAvatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent.warmGold + '18',
    borderWidth: 1.5,
    borderColor: colors.accent.warmGold + '55',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  gatewayInitial: {
    fontSize: 26,
    fontWeight: '700',
    color: colors.accent.warmGold,
  },
  gatewayName: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  opensRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
  },
  opensCount: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.accent.warmGold,
  },
  opensLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.muted,
    letterSpacing: 0.2,
  },

  // ── Separator ──────────────────────────────────────────────────────────────

  separator: {
    height: 1,
    marginHorizontal: spacing.lg,
    backgroundColor: colors.accent.warmGold + '1A',
    marginBottom: spacing.xs,
  },

  // ── Graph section ──────────────────────────────────────────────────────────

  // Graph sits flush at the top of this section — space below is intentional
  graphSection: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xs,
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

});
