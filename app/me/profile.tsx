import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { deriveBaobabCode } from '../../lib/identity-format';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function ProfileScreen() {
  const { me, updateShowBaobabCode } = useRelationsStore();

  const baobabCode = deriveBaobabCode(me.publicProfileId);

  const handleToggleCode = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateShowBaobabCode(!me.showBaobabCode);
  };

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
              {me.photoUri ? (
                <Image source={{ uri: me.photoUri }} style={styles.avatarPhoto} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>
                  {(me.avatarSeed || me.displayName.charAt(0) || '?').toUpperCase()}
                </Text>
              )}
            </View>
          </View>
          <View style={styles.avatarEditBadge}>
            <Ionicons name="create-outline" size={11} color={colors.text.primary} />
          </View>
        </Pressable>

        <Text style={styles.displayName}>{me.displayName}</Text>
        <Text style={styles.handle}>{me.handle}</Text>

        {baobabCode !== null && (
          <Pressable onPress={handleToggleCode} style={styles.codePill}>
            <Text style={styles.codeLabel}>{'CODE'}</Text>
            <Text style={styles.codeValue}>
              {me.showBaobabCode ? baobabCode : '——————'}
            </Text>
            <Ionicons
              name={me.showBaobabCode ? 'eye-outline' : 'eye-off-outline'}
              size={11}
              color={colors.text.muted}
            />
          </Pressable>
        )}
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
        <Pressable style={styles.actionRow} onPress={() => router.push('/me/settings')}>
          <Text style={styles.actionLabel}>{'Settings'}</Text>
          <Text style={styles.chevron}>{'›'}</Text>
        </Pressable>
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
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 30,
    fontWeight: '600',
    color: colors.text.primary,
  },
  avatarPhoto: {
    width: 76,
    height: 76,
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
  handle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.accent.warmGold,
    letterSpacing: 0.3,
  },
  codePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border.soft,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    marginTop: 2,
  },
  codeLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.text.muted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  codeValue: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
    letterSpacing: 1.5,
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

});
