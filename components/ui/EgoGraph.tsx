import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle as SvgCircle, G, Line, Text as SvgText } from 'react-native-svg';
import { Image } from 'expo-image';

import { colors } from '../../constants/colors';
import { radius as radiusConst, spacing } from '../../constants/spacing';
import {
  applyNodeSpread,
  CIRCLE_NODE_STATUS_COLOR,
  GATEWAY_NODE_RADIUS,
  LINK_QUALITY_NODE_COLOR,
  computeEgoLayoutV2,
  getCircleNodeStatusLabel,
  resolveDisplayNames,
  sortAndBucketEgoMembers,
  type EgoLayoutNodeV2,
  type MapMember,
} from '../../lib/circle-node-state';

// B45: an SVG group we can animate (opacity breathing). JS-driven — SVG attribute,
// not native-driver eligible; amplitude is small and the period long, so it is cheap.
const AnimatedG = Animated.createAnimatedComponent(G);

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
  me: { displayName: string; avatarSeed: string; photoUri?: string | null };
  size: number;
  onOverflowTap: () => void;
  onNodeTap: (member: MapMember) => void;
  /** Optional: tap on the center (me) node. Used by Circle home as the construction entry. */
  onCenterTap?: () => void;
  /** Optional: long press on the center node. Used for direct card access from Bao. */
  onCenterLongPress?: () => void;
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

export default function EgoGraph({ members, me, size, onOverflowTap, onNodeTap, onCenterTap, onCenterLongPress, allMembers, centerRadius, centerColor, emptyText }: Props) {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const [centerLongPressActive, setCenterLongPressActive] = useState(false);

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

  // Sparse mode: 1–3 revealed people on canvas → tighter orbit, larger nodes, all labels shown.
  const sparseMode = visible.length > 0 && visible.length <= 3;

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

  // Cloud spread / sparse layout.
  // Sparse (1–3 nodes): clean circular placement at 46% of canvas half-width, no jitter,
  // boosted node radius. Standard (4+): deterministic jitter + bounded repulsion.
  const cloudNodes = useMemo(() => {
    if (layoutNodes.length > 0 && layoutNodes.length <= 3) {
      const targetR = Math.min(cx, cy) * 0.46;
      return layoutNodes.map((n, i) => {
        const angle = (2 * Math.PI * i) / layoutNodes.length - Math.PI / 2;
        return {
          ...n,
          cx: cx + targetR * Math.cos(angle),
          cy: cy + targetR * Math.sin(angle),
          nodeRadius: Math.min(28, Math.round(n.nodeRadius * 1.35)),
        };
      });
    }
    return applyNodeSpread(layoutNodes, cx, cy);
  }, [layoutNodes, cx, cy]);

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
          (member.gatewayAccessState === 'open' ? ' · Passage ouvert' : '');
      setTooltip({ name: member.name, label, cx: node.cx, cy: node.cy });
    },
    [],
  );

  const dismissTooltip = useCallback(() => setTooltip(null), []);

  // B45: slow, continuous "breathing" on node opacity (~4.2s period), split into
  // 3 phase groups started out of sync so the graph feels alive — never a blink,
  // no glow. Small amplitude (0.82→1.0). JS-driven (SVG opacity attribute).
  const breathe = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  useEffect(() => {
    const loops = breathe.map((v) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: 2100, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
          Animated.timing(v, { toValue: 0, duration: 2100, easing: Easing.inOut(Easing.sin), useNativeDriver: false }),
        ]),
      ),
    );
    const timers = loops.map((l, i) => setTimeout(() => l.start(), i * 1400));
    return () => {
      timers.forEach(clearTimeout);
      loops.forEach((l) => l.stop());
    };
  }, [breathe]);

  return (
    <View style={{ width: size, height: size, alignSelf: 'center' }} pointerEvents="box-none">
      <Svg width={size} height={size}>
        {/* B43: removed the radial-illumination background and the concentric
            ghost rings — diffuse glow that read as an "AI" canvas. */}

        {/* Lines from center to each orbit node — quality-tinted */}
        {cloudNodes.map((node) => {
          if (node.id === OVERFLOW_ID) return null;
          const member = visible.find((m) => m.id === node.id);
          if (!member) return null;
          // B45: links more visible than before (raised opacity + brighter faint),
          // duotone gold/mauve. No glow.
          const lineOpacity =
            member.linkQualityBand === 'strong'   ? 0.72 :
            member.linkQualityBand === 'moderate' ? 0.52 : 0.30;
          const lineColor =
            member.linkQualityBand === 'strong'   ? colors.accent.deepTeal   :
            member.linkQualityBand === 'moderate' ? colors.accent.dustyRose  : colors.text.muted;
          const lineWidth = member.linkQualityBand === 'faint' ? StyleSheet.hairlineWidth : 1;
          return (
            <Line
              key={`ln-${node.id}`}
              x1={cx} y1={cy}
              x2={node.cx} y2={node.cy}
              stroke={lineColor}
              strokeWidth={lineWidth}
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

        {/* Center — Me/Gateway — solid fill + fine ring; radius + color driven by props.
            B43: removed the two layered glow halos (r+12, r+6). */}
        {/* Fill circle — only when no photo; photo is rendered in a View layer above SVG */}
        {!me.photoUri && (
          <SvgCircle cx={cx} cy={cy} r={effectiveCenterR} fill={effectiveCenterFill} fillOpacity={0.88} />
        )}
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
        {/* Initial — only when no photo */}
        {!me.photoUri && (
          <SvgText
            x={cx} y={cy + (effectiveCenterR < 26 ? 5 : 6)}
            fontSize={effectiveCenterR < 26 ? 14 : 18} fontWeight="700"
            fill="#141210"
            textAnchor="middle"
          >
            {meInitial}
          </SvgText>
        )}
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
        {cloudNodes.map((node, nodeIndex) => {
          // Overflow pseudo-node
          if (node.id === OVERFLOW_ID) {
            return (
              <G key={OVERFLOW_ID}>
                <SvgCircle
                  cx={node.cx} cy={node.cy}
                  r={GATEWAY_NODE_RADIUS.low + 2}
                  fill={colors.background.secondary}
                  stroke={colors.accent.warmGold}
                  strokeWidth={1.2}
                  strokeOpacity={0.65}
                />
                <SvgText
                  x={node.cx} y={node.cy + 4}
                  fontSize={10} fontWeight="700"
                  fill={colors.accent.warmGold}
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
          const denseMode  = visible.length > 14;
          const showLabel  = sparseMode || member.proximityBand === 'core' || (!denseMode && member.proximityBand === 'close');
          const rawLabel   = displayNames.get(member.id) ?? member.name;
          const truncLen   = sparseMode ? 10 : 8;
          const truncName  = rawLabel.length > truncLen ? `${rawLabel.slice(0, truncLen - 1)}\u2026` : rawLabel;
          const dotR       = node.nodeRadius <= GATEWAY_NODE_RADIUS.low + 1 ? 3.5 : 4.5;
          const fontSize   = node.nodeRadius <= GATEWAY_NODE_RADIUS.low + 1 ? 10 : 13;
          const nodeColors = LINK_QUALITY_NODE_COLOR[member.linkQualityBand];
          // B43-bis: dark initial on the two light solid fills (strong/terracotta,
          // moderate/sage); light initial stays on the dark faint node.
          const initialColor = member.linkQualityBand === 'faint' ? colors.text.primary : '#141210';
          // B45: staggered breathing opacity (phase group = nodeIndex % 3).
          const breatheOpacity = breathe[nodeIndex % breathe.length].interpolate({
            inputRange: [0, 1],
            outputRange: isUnread ? [0.42, 0.55] : [0.82, 1],
          });

          return (
            <AnimatedG key={node.id} opacity={breatheOpacity}>
              {/* Gateway indicator — fine stroke ring only.
                  B43: removed the filled glow halo (r+9); kept the thin ring. */}
              {node.gatewayAccessState === 'open' && (
                <SvgCircle
                  cx={node.cx} cy={node.cy}
                  r={node.nodeRadius + 4}
                  fill="none"
                  stroke={colors.accent.warmGold}
                  strokeWidth={0.8}
                  strokeOpacity={0.40}
                />
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
                fill={initialColor}
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
            </AnimatedG>
          );
        })}
      </Svg>

      {/* Center photo — rendered above SVG using expo-image for reliable cover fill.
          SVG Image preserveAspectRatio is unreliable on native; RN + expo-image is not. */}
      {me.photoUri && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: cx - effectiveCenterR,
            top:  cy - effectiveCenterR,
            width:  effectiveCenterR * 2,
            height: effectiveCenterR * 2,
            borderRadius: effectiveCenterR,
            overflow: 'hidden',
            borderWidth: 1.5,
            borderColor: effectiveCenterFill + '8C',
          }}
        >
          <Image
            source={{ uri: me.photoUri }}
            style={{ width: effectiveCenterR * 2, height: effectiveCenterR * 2 }}
            contentFit="cover"
          />
          {/* Dark veil — pulls photo toward the graph's dark palette */}
          <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.18)' }]} />
        </View>
      )}

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
            onPress={() => {
              if (centerLongPressActive) {
                setCenterLongPressActive(false);
                return;
              }
              onCenterTap();
            }}
            onLongPress={() => {
              if (!onCenterLongPress) return;
              setCenterLongPressActive(true);
              onCenterLongPress();
            }}
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
            {emptyText ?? 'Révèle un lien\npour voir ton réseau.'}
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
