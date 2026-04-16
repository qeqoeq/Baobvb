import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle as SvgCircle, G, Line, Text as SvgText } from 'react-native-svg';

import { colors } from '../../constants/colors';
import { radius as radiusConst, spacing } from '../../constants/spacing';
import {
  CIRCLE_NODE_STATUS_COLOR,
  NODE_RADIUS,
  computeEgoLayout,
  getCircleNodeStatusLabel,
  sortAndBucketEgoMembers,
  type CanvasSize,
  type EgoGraphMember,
  type EgoLayoutNode,
} from '../../lib/circle-node-state';

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_VISIBLE = 20;
const CENTER_RADIUS = 26;
const DOT_RADIUS = 5;
const OVERFLOW_ID = '__overflow__';

// ─── Types ────────────────────────────────────────────────────────────────────

type TooltipState = {
  name: string;
  label: string;
  cx: number;
  cy: number;
};

type Props = {
  members: EgoGraphMember[];
  me: { displayName: string; avatarSeed: string };
  onOverflowTap: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EgoGraph({ members, me, onOverflowTap }: Props) {
  const [canvas, setCanvas] = useState<CanvasSize>({ width: 0, height: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setCanvas({ width, height });
  }, []);

  // Deterministic sort: status weight → name → id
  const { visible, overflowCount } = useMemo(
    () => sortAndBucketEgoMembers(members, MAX_VISIBLE),
    [members],
  );

  // nodeIds fed to layout: visible nodes + overflow pseudo-node if needed
  const nodeIds = useMemo(() => {
    const ids = visible.map((m) => m.id);
    if (overflowCount > 0) ids.push(OVERFLOW_ID);
    return ids;
  }, [visible, overflowCount]);

  const layoutNodes = useMemo(
    () => computeEgoLayout(nodeIds, canvas),
    [nodeIds, canvas],
  );

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const meInitial = (me.avatarSeed || me.displayName.charAt(0) || '?').toUpperCase();

  const handleLongPress = useCallback(
    (member: EgoGraphMember, node: EgoLayoutNode) => {
      setTooltip({
        name: member.name,
        label: getCircleNodeStatusLabel(member.status),
        cx: node.cx,
        cy: node.cy,
      });
    },
    [],
  );

  const dismissTooltip = useCallback(() => setTooltip(null), []);

  return (
    <View style={styles.canvas} onLayout={handleLayout}>
      {canvas.width > 0 && (
        <>
          <Svg width={canvas.width} height={canvas.height}>
            {/* Lines from center to each orbit node */}
            {layoutNodes.map((node) => (
              <Line
                key={`ln-${node.id}`}
                x1={cx}
                y1={cy}
                x2={node.cx}
                y2={node.cy}
                stroke={colors.border.strong}
                strokeWidth={1}
              />
            ))}

            {/* Center — Me (non-interactive) */}
            <SvgCircle
              cx={cx}
              cy={cy}
              r={CENTER_RADIUS}
              fill={colors.accent.deepTeal}
            />
            <SvgText
              x={cx}
              y={cy + 6}
              fontSize={16}
              fontWeight="700"
              fill={colors.text.primary}
              textAnchor="middle"
            >
              {meInitial}
            </SvgText>

            {/* Orbit nodes */}
            {layoutNodes.map((node) => {
              // Overflow pseudo-node
              if (node.id === OVERFLOW_ID) {
                return (
                  <G key={OVERFLOW_ID} onPress={onOverflowTap}>
                    <SvgCircle
                      cx={node.cx}
                      cy={node.cy}
                      r={NODE_RADIUS}
                      fill={colors.background.tertiary}
                      stroke={colors.border.strong}
                      strokeWidth={1}
                    />
                    <SvgText
                      x={node.cx}
                      y={node.cy + 5}
                      fontSize={11}
                      fontWeight="700"
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

              const initial = (member.avatarSeed || member.name.charAt(0) || '?').toUpperCase();
              const dotColor = CIRCLE_NODE_STATUS_COLOR[member.status];
              const isUnread = member.status === 'unread';
              const truncName = member.name.length > 8 ? `${member.name.slice(0, 7)}\u2026` : member.name;

              return (
                <G
                  key={node.id}
                  opacity={isUnread ? 0.55 : 1}
                  onPress={() => {
                    setTooltip(null);
                    router.push(`../relation/${member.id}`);
                  }}
                  onLongPress={() => handleLongPress(member, node)}
                >
                  {/* Node body */}
                  <SvgCircle
                    cx={node.cx}
                    cy={node.cy}
                    r={NODE_RADIUS}
                    fill={colors.background.secondary}
                    stroke={colors.border.strong}
                    strokeWidth={1}
                  />
                  {/* Initial */}
                  <SvgText
                    x={node.cx}
                    y={node.cy + 5}
                    fontSize={13}
                    fontWeight="600"
                    fill={colors.text.primary}
                    textAnchor="middle"
                  >
                    {initial}
                  </SvgText>
                  {/* Status dot — top-right of node */}
                  <SvgCircle
                    cx={node.cx + NODE_RADIUS - DOT_RADIUS}
                    cy={node.cy - NODE_RADIUS + DOT_RADIUS}
                    r={DOT_RADIUS}
                    fill={dotColor}
                  />
                  {/* Name label below node */}
                  <SvgText
                    x={node.cx}
                    y={node.cy + NODE_RADIUS + 14}
                    fontSize={10}
                    fill={colors.text.secondary}
                    textAnchor="middle"
                  >
                    {truncName}
                  </SvgText>
                </G>
              );
            })}
          </Svg>

          {/* Empty state — rendered over SVG when no members */}
          {members.length === 0 && (
            <View
              style={[
                styles.emptyOverlay,
                { top: cy + CENTER_RADIUS + spacing.md },
              ]}
            >
              <Text style={styles.emptyText}>
                {'Add someone from Garden\nto see your circle.'}
              </Text>
            </View>
          )}

          {/* Long-press tooltip — fullscreen pressable to dismiss */}
          {tooltip !== null && (
            <Pressable style={StyleSheet.absoluteFillObject} onPress={dismissTooltip}>
              <View
                style={[
                  styles.tooltip,
                  {
                    left: Math.max(
                      spacing.md,
                      Math.min(tooltip.cx - 64, canvas.width - 144),
                    ),
                    top: Math.max(
                      spacing.md,
                      tooltip.cy - NODE_RADIUS - 60,
                    ),
                  },
                ]}
              >
                <Text style={styles.tooltipName}>{tooltip.name}</Text>
                <Text style={styles.tooltipLabel}>{tooltip.label}</Text>
              </View>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
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
    width: 128,
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
