import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { deriveBaobabCode } from '../../lib/identity-format';
import { getFoundationalReadings } from '../../lib/foundational-reading';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function ProfileScreen() {
  const { me, evaluations, activeRelations } = useRelationsStore();

  const activeReadings = useMemo(
    () => getFoundationalReadings(activeRelations, evaluations),
    [activeRelations, evaluations],
  );

  const toNurtureCount = useMemo(
    () => activeReadings.filter((r) => r.toNurture).length,
    [activeReadings],
  );

  const baobabCode = deriveBaobabCode(me.publicProfileId);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* ── Back ─────────────────────────────────────────────────────────────── */}
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={17} color={colors.text.muted} />
        <Text style={styles.backLabel}>{'World'}</Text>
      </Pressable>

      {/* ── Identity ─────────────────────────────────────────────────────────── */}
      <View style={styles.identityZone}>
        <Pressable style={styles.avatarContainer} onPress={() => router.push('/me/edit')}>
          <View style={styles.avatarRing}>
            <View style={styles.avatarInner}>
              <Text style={styles.avatarText}>
                {(me.avatarSeed || me.displayName.charAt(0) || '?').toUpperCase()}
              </Text>
            </View>
          </View>
          <View style={styles.avatarEditBadge}>
            <Ionicons name="create-outline" size={11} color={colors.text.primary} />
          </View>
        </Pressable>

        <Text style={styles.displayName}>{me.displayName}</Text>

        <View style={styles.handleRow}>
          <Text style={styles.handle}>{me.handle}</Text>
          {me.showBaobabCode && baobabCode !== null && (
            <Text style={styles.baobabCode}>{`· ${baobabCode}`}</Text>
          )}
        </View>
      </View>

      {/* ── My network ───────────────────────────────────────────────────────── */}
      <View style={styles.networkRow}>
        <Pressable style={styles.statCard} onPress={() => router.push('/garden')}>
          <Text style={styles.statValue}>{activeRelations.length}</Text>
          <View style={[styles.statAccent, { backgroundColor: colors.accent.deepTeal }]} />
          <Text style={styles.statLabel}>{'Active'}</Text>
        </Pressable>
        <Pressable style={styles.statCard} onPress={() => router.push('/garden')}>
          <Text style={styles.statValue}>{toNurtureCount}</Text>
          <View style={[styles.statAccent, { backgroundColor: colors.accent.dustyRose }]} />
          <Text style={styles.statLabel}>{'To nurture'}</Text>
        </Pressable>
      </View>

      {/* ── Share ────────────────────────────────────────────────────────────── */}
      <View style={styles.shareRow}>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => router.push('/me/scan')}
          activeOpacity={0.7}
        >
          <Ionicons name="scan-outline" size={24} color={colors.accent.warmGold} />
          <Text style={styles.shareBtnLabel}>{'Scan'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => router.push('/me/qr')}
          activeOpacity={0.7}
        >
          <Ionicons name="qr-code-outline" size={24} color={colors.accent.warmGold} />
          <Text style={styles.shareBtnLabel}>{'My QR'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.shareBtn}
          onPress={() => router.push('/relation/add')}
          activeOpacity={0.7}
        >
          <Ionicons name="person-add-outline" size={24} color={colors.accent.warmGold} />
          <Text style={styles.shareBtnLabel}>{'Add'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Account ──────────────────────────────────────────────────────────── */}
      <View style={styles.accountCard}>
        <Pressable style={styles.actionRow} onPress={() => router.push('/me/edit')}>
          <Text style={styles.actionLabel}>{'Edit your card'}</Text>
          <Text style={styles.chevron}>{'›'}</Text>
        </Pressable>

        <View style={styles.actionDivider} />

        <Pressable style={styles.actionRow} onPress={() => router.push('/me/settings')}>
          <Text style={styles.actionLabel}>{'Settings'}</Text>
          <Text style={styles.chevron}>{'›'}</Text>
        </Pressable>

        <View style={styles.actionDivider} />

        <Pressable style={styles.actionRow} onPress={() => router.push('/relation/archived')}>
          <Text style={styles.actionLabel}>{'Archived relationships'}</Text>
          <Text style={styles.chevron}>{'›'}</Text>
        </Pressable>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>{'Baobab — local-first, private by design.'}</Text>
      </View>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

  // ── Back ───────────────────────────────────────────────────────────────────

  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingBottom: spacing.xs,
  },
  backLabel: {
    fontSize: 15,
    color: colors.text.muted,
    fontWeight: '500',
  },

  // ── Identity zone ──────────────────────────────────────────────────────────

  identityZone: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.xs,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.xs,
  },
  avatarRing: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    borderColor: colors.accent.warmGold + '44',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '600',
    color: colors.text.primary,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  displayName: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  handle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent.warmGold,
    letterSpacing: 0.3,
  },
  baobabCode: {
    fontSize: 13,
    fontWeight: '500',
    color: colors.text.muted,
    letterSpacing: 0.5,
  },

  // ── Network row ────────────────────────────────────────────────────────────

  networkRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  statCard: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.md,
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
  },
  statAccent: {
    width: 20,
    height: 3,
    borderRadius: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── Share row ──────────────────────────────────────────────────────────────

  shareRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  shareBtn: {
    flex: 1,
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingVertical: spacing.md,
    alignItems: 'center',
    gap: 6,
  },
  shareBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  // ── Account card ───────────────────────────────────────────────────────────

  accountCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    overflow: 'hidden',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '500',
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
    marginLeft: spacing.lg,
  },
  chevron: {
    fontSize: 18,
    color: colors.text.muted,
  },

  // ── Footer ─────────────────────────────────────────────────────────────────

  footer: {
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  footerText: {
    fontSize: 12,
    color: colors.text.muted,
    fontStyle: 'italic',
  },
});
