import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle as SvgCircle, Defs, G, Line, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';

import { colors } from '../../constants/colors';
import { radius as radiusConst, spacing } from '../../constants/spacing';
import {
  applyNodeSpread,
  CIRCLE_NODE_STATUS_COLOR,
  GATEWAY_NODE_RADIUS,
  LINK_QUALITY_NODE_COLOR,
  computeEgoLayoutV2,
  computeOrbitRadii,
  getCircleNodeStatusLabel,
  resolveDisplayNames,
  sortAndBucketEgoMembers,
  type EgoLayoutNodeV2,
  type MapMember,
} from '../../lib/circle-node-state';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE   = 20;
const CENTER_RADIUS = 22;
const OVERFLOW_ID   = '__overflow__';

// ─── Types ────────────────────────────────────────────────────────────────────

type TooltipState = {
  name: string;
  label: string;
  cx: number;
  cy: number;
};

type Props = {
  members: MapMember[];
  me: { displayName: string; avatarSeed: string };
  size: number;
  onOverflowTap: () => void;
  onNodeTap: (member: MapMember) => void;
  /** Optional: tap on the center (me) node. Used by Circle home as the construction entry. */
  onCenterTap?: () => void;
  /**
   * Full graph member set (direct + primarily_via) for territorial angular sort.
   * When provided, world-openers cluster toward 12 o'clock.
   * Omit in secondary atlases (Through X) to use the simpler gateway-first sort.
   */
  allMembers?: MapMember[];
  /** Override center node radius (default 22). Pass larger value for gateway perspective screens. */
  centerRadius?: number;
  /** Override center node fill color (default deepTeal). Use warmGold for gateway perspective. */
  centerColor?: string;
  /**
   * Override empty state message.
   * Pass `null` to suppress the internal empty overlay entirely
   * (use when the parent provides its own empty state UI).
   */
  emptyText?: string | null;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EgoGraph({ members, me, size, onOverflowTap, onNodeTap, onCenterTap, allMembers, centerRadius, centerColor, emptyText }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Dismiss stale tooltip whenever the member set changes (filter switch)
  useEffect(() => { setTooltip(null); }, [members]);

  const canvas = useMemo(() => ({ width: size, height: size }), [size]);
  const cx = size / 2;
  const cy = size / 2;

  // Sort + bucket
  const { visible, overflowCount } = useMemo(
    () => sortAndBucketEgoMembers(members, MAX_VISIBLE),
    [members],
  );

  // Build layout input: visible members + overflow pseudo-node if needed
  const layoutMembers = useMemo<MapMember[]>(() => {
    if (overflowCount === 0) return visible;
    return [
      ...visible,
      {
        id: OVERFLOW_ID,
        name: '',
        status: 'unread',
        proximityBand: 'edge',
        gatewayPowerBand: 'low',
        gatewayAccessState: 'none',
        linkQualityBand: 'faint',
        viaState: { kind: 'direct' },
        presenceMode: 'direct',
      } satisfies MapMember,
    ];
  }, [visible, overflowCount]);

  const layoutNodes = useMemo(
    () => computeEgoLayoutV2(layoutMembers, canvas, allMembers),
    [layoutMembers, canvas, allMembers],
  );

  // Cloud spread: deterministic jitter + bounded repulsion — breaks the perfect circle
  const cloudNodes = useMemo(
    () => applyNodeSpread(layoutNodes, cx, cy),
    [layoutNodes, cx, cy],
  );

  const orbitRadii = useMemo(() => computeOrbitRadii(canvas), [canvas]);

  // Resolved display labels — first name only, disambiguated on collision
  const displayNames = useMemo(() => resolveDisplayNames(visible), [visible]);

  const effectiveCenterR    = centerRadius ?? CENTER_RADIUS;
  const effectiveCenterFill = centerColor  ?? colors.accent.deepTeal;

  const meInitial = (me.avatarSeed || me.displayName.charAt(0) || '?').toUpperCase();
  const meFirstName = (() => {
    const first = me.displayName.split(' ')[0] ?? me.displayName;
    return first.length > 8 ? `${first.slice(0, 7)}\u2026` : first;
  })();

  const handleLongPress = useCallback(
    (member: MapMember, node: EgoLayoutNodeV2) => {
      const via = member.viaState.kind === 'via' ? member.viaState : null;
      const label = via
        ? `via ${via.viaName}`
        : getCircleNodeStatusLabel(member.status) +
          (member.gatewayAccessState === 'open' ? ' · Open gateway' : '');
      setTooltip({ name: member.name, label, cx: node.cx, cy: node.cy });
    },
    [],
  );

  const dismissTooltip = useCallback(() => setTooltip(null), []);

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }} pointerEvents="box-none">
      <Svg width={size} height={size}>
        {/* Gradient definitions */}
        <Defs>
          <RadialGradient id="worldBg" cx="50%" cy="50%" rx="50%" ry="50%">
            <Stop offset="0%"   stopColor={colors.background.tertiary} stopOpacity={0.65} />
            <Stop offset="100%" stopColor={colors.background.primary}  stopOpacity={0}    />
          </RadialGradient>
        </Defs>

        {/* Canvas depth — soft radial illumination from center */}
        <Rect x={0} y={0} width={size} height={size} fill="url(#worldBg)" />

        {/* Orbit ghost rings — barely perceptible, dashed, just a hint of tiers */}
        {orbitRadii.map((r, i) =>
          r > 0 ? (
            <SvgCircle
              key={`ring-${i}`}
              cx={cx} cy={cy}
              r={r}
              fill="none"
              stroke={colors.border.soft}
              strokeWidth={1}
              strokeOpacity={0.12}
              strokeDasharray="2 10"
            />
          ) : null,
        )}

        {/* Lines from center to each orbit node — quality-tinted */}
        {cloudNodes.map((node) => {
          if (node.id === OVERFLOW_ID) return null;
          const member = visible.find((m) => m.id === node.id);
          if (!member) return null;
          const lineOpacity =
            member.linkQualityBand === 'strong'   ? 0.50 :
            member.linkQualityBand === 'moderate' ? 0.30 : 0.10;
          const lineColor =
            member.linkQualityBand === 'strong'   ? colors.accent.deepTeal  :
            member.linkQualityBand === 'moderate' ? colors.accent.mutedSage : colors.border.strong;
          return (
            <Line
              key={`ln-${node.id}`}
              x1={cx} y1={cy}
              x2={node.cx} y2={node.cy}
              stroke={lineColor}
              strokeWidth={StyleSheet.hairlineWidth}
              strokeOpacity={lineOpacity}
            />
          );
        })}

        {/* Via path lines — dashed, node-to-node */}
        {cloudNodes.map((node) => {
          if (node.id === OVERFLOW_ID) return null;
          const member = visible.find((m) => m.id === node.id);
          if (!member) return null;
          const via = member.viaState.kind === 'via' ? member.viaState : null;
          if (!via) return null;
          const targetNode = cloudNodes.find((n) => n.id === via.relId);
          if (!targetNode) return null;
          return (
            <Line
              key={`via-${node.id}`}
              x1={node.cx} y1={node.cy}
              x2={targetNode.cx} y2={targetNode.cy}
              stroke={colors.accent.warmGold}
              strokeWidth={0.8}
              strokeOpacity={0.28}
              strokeDasharray="3 5"
            />
          );
        })}

        {/* Center — Me/Gateway — layered glow; radius + color driven by props */}
        <SvgCircle cx={cx} cy={cy} r={effectiveCenterR + 12} fill={effectiveCenterFill} fillOpacity={0.05} />
        <SvgCircle cx={cx} cy={cy} r={effectiveCenterR + 6}  fill={effectiveCenterFill} fillOpacity={0.10} />
        <SvgCircle cx={cx} cy={cy} r={effectiveCenterR}      fill={effectiveCenterFill} fillOpacity={0.88} />
        {/* Tappable ring — fine stroke signals interactivity when onCenterTap is wired */}
        {onCenterTap && (
          <SvgCircle
            cx={cx} cy={cy}
            r={effectiveCenterR + 4}
            fill="none"
            stroke={effectiveCenterFill}
            strokeWidth={0.8}
            strokeOpacity={0.35}
          />
        )}
        <SvgText
          x={cx} y={cy + (effectiveCenterR < 26 ? 5 : 6)}
          fontSize={effectiveCenterR < 26 ? 14 : 18} fontWeight="700"
          fill={colors.text.primary}
          textAnchor="middle"
        >
          {meInitial}
        </SvgText>
        {/* Name label — always visible; mirrors orbit label pattern */}
        <SvgText
          x={cx} y={cy + effectiveCenterR + 14}
          fontSize={10}
          fill={colors.text.secondary}
          textAnchor="middle"
          fillOpacity={0.75}
        >
          {meFirstName}
        </SvgText>

        {/* Cloud nodes */}
        {cloudNodes.map((node) => {
          // Overflow pseudo-node
          if (node.id === OVERFLOW_ID) {
            return (
              <G key={OVERFLOW_ID}>
                <SvgCircle
                  cx={node.cx} cy={node.cy}
                  r={GATEWAY_NODE_RADIUS.low}
                  fill={colors.background.tertiary}
                  stroke={colors.border.strong}
                  strokeWidth={1}
                  strokeOpacity={0.6}
                />
                <SvgText
                  x={node.cx} y={node.cy + 4}
                  fontSize={10} fontWeight="700"
                  fill={colors.text.secondary}
                  textAnchor="middle"
                >
                  {`+${overflowCount}`}
                </SvgText>
              </G>
            );
          }

          const member = visible.find((m) => m.id === node.id);
          if (!member) return null;

          const initial    = (member.avatarSeed || member.name.charAt(0) || '?').toUpperCase();
          const dotColor   = CIRCLE_NODE_STATUS_COLOR[member.status];
          const isUnread   = member.status === 'unread';
          const showLabel  = member.proximityBand === 'core' || member.proximityBand === 'close';
          const rawLabel   = displayNames.get(member.id) ?? member.name;
          const truncName  = rawLabel.length > 8 ? `${rawLabel.slice(0, 7)}\u2026` : rawLabel;
          const dotR       = node.nodeRadius <= GATEWAY_NODE_RADIUS.low + 1 ? 3.5 : 4.5;
          const fontSize   = node.nodeRadius <= GATEWAY_NODE_RADIUS.low + 1 ? 10 : 13;
          const nodeColors = LINK_QUALITY_NODE_COLOR[member.linkQualityBand];

          return (
            <G key={node.id} opacity={isUnread ? 0.50 : 1}>
              {/* Gateway halo — filled glow + fine stroke ring */}
              {node.gatewayAccessState === 'open' && (
                <>
                  <SvgCircle
                    cx={node.cx} cy={node.cy}
                    r={node.nodeRadius + 9}
                    fill={colors.accent.warmGold}
                    fillOpacity={0.07}
                  />
                  <SvgCircle
                    cx={node.cx} cy={node.cy}
                    r={node.nodeRadius + 4}
                    fill="none"
                    stroke={colors.accent.warmGold}
                    strokeWidth={0.8}
                    strokeOpacity={0.40}
                  />
                </>
              )}

              {/* Node body */}
              <SvgCircle
                cx={node.cx} cy={node.cy}
                r={node.nodeRadius}
                fill={nodeColors.fill}
                fillOpacity={nodeColors.fillOpacity}
                stroke={nodeColors.stroke}
                strokeOpacity={nodeColors.strokeOpacity}
                strokeWidth={nodeColors.strokeWidth}
              />
              {/* Initial */}
              <SvgText
                x={node.cx} y={node.cy + (fontSize <= 10 ? 4 : 5)}
                fontSize={fontSize} fontWeight="600"
                fill={colors.text.primary}
                textAnchor="middle"
              >
                {initial}
              </SvgText>
              {/* Status dot — top-right */}
              <SvgCircle
                cx={node.cx + node.nodeRadius - dotR}
                cy={node.cy - node.nodeRadius + dotR}
                r={dotR} fill={dotColor}
              />
              {/* Name label — inner orbit only */}
              {showLabel && (
                <SvgText
                  x={node.cx} y={node.cy + node.nodeRadius + 14}
                  fontSize={10} fill={colors.text.secondary}
                  textAnchor="middle"
                  fillOpacity={0.75}
                >
                  {truncName}
                </SvgText>
              )}
            </G>
          );
        })}
      </Svg>

      {/* Hit targets — Pressable layer over SVG for reliable iOS touch */}
      <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
        {cloudNodes.map((node) => {
          const hitSize = Math.max(44, node.nodeRadius * 2 + 16);
          if (node.id === OVERFLOW_ID) {
            return (
              <Pressable
                key={`hit-${node.id}`}
                onPress={onOverflowTap}
                style={{
                  position: 'absolute',
                  left: node.cx - hitSize / 2,
                  top: node.cy - hitSize / 2,
                  width: hitSize,
                  height: hitSize,
                  borderRadius: hitSize / 2,
                }}
              />
            );
          }
          const member = visible.find((m) => m.id === node.id);
          if (!member) return null;
          return (
            <Pressable
              key={`hit-${node.id}`}
              onPress={() => {
                setTooltip(null);
                onNodeTap(member);
              }}
              onLongPress={() => handleLongPress(member, node)}
              style={{
                position: 'absolute',
                left: node.cx - hitSize / 2,
                top: node.cy - hitSize / 2,
                width: hitSize,
                height: hitSize,
                borderRadius: hitSize / 2,
              }}
            />
          );
        })}
      </View>

      {/* Center (me/gateway) hit target — scales with effectiveCenterR */}
      {onCenterTap && (
        <View pointerEvents="box-none" style={StyleSheet.absoluteFillObject}>
          <Pressable
            onPress={onCenterTap}
            style={{
              position: 'absolute',
              left: cx - (effectiveCenterR + 4),
              top:  cy - (effectiveCenterR + 4),
              width:  (effectiveCenterR + 4) * 2,
              height: (effectiveCenterR + 4) * 2,
              borderRadius: effectiveCenterR + 4,
            }}
          />
        </View>
      )}

      {/* Empty state — suppressed when emptyText is explicitly null */}
      {members.length === 0 && emptyText !== null && (
        <View style={[styles.emptyOverlay, { top: cy + effectiveCenterR + spacing.md }]}>
          <Text style={styles.emptyText}>
            {emptyText ?? 'Reveal a connection\nto see your world.'}
          </Text>
        </View>
      )}

      {/* Long-press tooltip */}
      {tooltip !== null && (
        <Pressable style={StyleSheet.absoluteFillObject} onPress={dismissTooltip}>
          <View
            style={[
              styles.tooltip,
              {
                left: Math.max(spacing.md, Math.min(tooltip.cx - 64, size - 144)),
                top: Math.max(spacing.md, tooltip.cy - CENTER_RADIUS - 60),
              },
            ]}
          >
            <Text style={styles.tooltipName}>{tooltip.name}</Text>
            <Text style={styles.tooltipLabel}>{tooltip.label}</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  emptyOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  tooltip: {
    position: 'absolute',
    width: 144,
    backgroundColor: colors.background.tertiary,
    borderRadius: radiusConst.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 3,
  },
  tooltipName: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text.primary,
  },
  tooltipLabel: {
    fontSize: 12,
    color: colors.text.secondary,
  },
});
