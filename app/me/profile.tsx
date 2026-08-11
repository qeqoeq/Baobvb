import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Updates from 'expo-updates';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { G, Path } from 'react-native-svg';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { deriveBaobabCode } from '../../lib/identity-format';
import { buildPersonCardPayload, encodePersonCardPayload } from '../../lib/person-card';
import { useRelationsStore } from '../../store/useRelationsStore';
import { PrimaryNavBar } from '../../components/ui/PrimaryNavBar';
import { b39Entries } from '../../lib/b39-buffer'; // [B39] TEMPORARY — remove by grepping [B39]

export default function ProfileScreen() {
  const { me, relations, updateShowBaobabCode } = useRelationsStore();
  // [B39] TEMPORARY — hidden production diagnostic panel (long-press the build stamp).
  const [b39Open, setB39Open] = useState(false);

  const baobabCode = deriveBaobabCode(me.publicProfileId);
  const isCardReady = Boolean(me.publicProfileId);
  const payload = me.publicProfileId
    ? encodePersonCardPayload(buildPersonCardPayload(me, { preferV2: true }))
    : null;

  const handleToggleCode = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    updateShowBaobabCode(!me.showBaobabCode);
  };

  const handleScan = () => {
    if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/me/scan');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background.primary }}>
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* ── Back ─────────────────────────────────────────────────────────────── */}
      <Pressable style={styles.backRow} onPress={() => router.push('/(tabs)')}>
        <Ionicons name="chevron-back" size={17} color={colors.text.muted} />
        <Text style={styles.backLabel}>{'Jardin'}</Text>
      </Pressable>

      {/* ── Identity ─────────────────────────────────────────────────────────── */}
      <View style={styles.identityZone}>
        <Text style={styles.identityKicker}>{'BAOBAB'}</Text>
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
        <Text style={styles.handle}>
          {me.handle}{me.identitySuffix ? `·${me.identitySuffix}` : ''}
        </Text>

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

      {/* ── My Bao compact card ───────────────────────────────────────────────── */}
      <TouchableOpacity
        style={styles.baoCard}
        onPress={() => {
          if (process.env.EXPO_OS === 'ios') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push('/me/qr');
        }}
        activeOpacity={0.85}
      >
        <Text style={styles.baoCardLabel}>{'MON BAO'}</Text>

        {isCardReady ? (
          <View style={styles.baoQrSurface}>
            <QRCode
              value={payload!}
              size={160}
              color="#111111"
              backgroundColor="#FBF3E8"
              ecl="H"
            />
            {me.photoUri && (
              <View style={styles.baoQrAvatarWrap} pointerEvents="none">
                <View style={styles.baoQrAvatarRing}>
                  <Image
                    source={{ uri: me.photoUri }}
                    style={styles.baoQrAvatarPhoto}
                    contentFit="cover"
                  />
                </View>
              </View>
            )}
          </View>
        ) : (
          <View style={styles.baoQrLoading}>
            <Text style={styles.baoQrLoadingText}>{'Préparation de ton profil…'}</Text>
          </View>
        )}

        <Text style={styles.baoCardHint}>{'Montrer · Envoyer'}</Text>
      </TouchableOpacity>

      {/* ── Quiet links ──────────────────────────────────────────────────────── */}
      <View style={styles.quietLinks}>
        <TouchableOpacity style={styles.quietLink} onPress={handleScan} activeOpacity={0.7}>
          <Ionicons name="scan-outline" size={15} color={colors.text.muted} />
          <Text style={styles.quietLinkLabel}>{'Scanner un Bao'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quietLink} onPress={() => router.push('/me/invite-by-number')} activeOpacity={0.7}>
          <Ionicons name="person-add-outline" size={15} color={colors.text.muted} />
          <Text style={styles.quietLinkLabel}>{'Ajouter'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Utility ──────────────────────────────────────────────────────────── */}
      <View style={styles.utilitySection}>
        <Pressable style={styles.settingsLink} onPress={() => router.push('/me/settings')}>
          <Text style={styles.settingsLinkText}>{'Réglages'}</Text>
        </Pressable>
      </View>

      {/* Build/OTA identity — permanent, discreet. Long-press (~2s) opens the [B39] panel. */}
      <Pressable onLongPress={() => setB39Open(true)} delayLongPress={2000}>
        <Text style={styles.buildStamp}>
          {`v${Updates.runtimeVersion ?? '?'} · ${(Updates.updateId ?? 'embedded').slice(0, 8)}`}
        </Text>
      </Pressable>

      <View pointerEvents="none" style={styles.treeZone}>
        <View style={styles.treeGlow} />
        <BaoTreeMark />
      </View>

    </ScrollView>
      <PrimaryNavBar />

      {/* [B39] TEMPORARY — hidden production diagnostic panel. Remove by grepping [B39]. */}
      {b39Open ? (
        <Modal visible animationType="slide" onRequestClose={() => setB39Open(false)}>
          {(() => {
            const B39_REL = 'c41ab40b-6d3a-4003-8c81-15633391eb6e';
            const rel = relations.find((r) => r.canonicalRelationId === B39_REL || r.id === B39_REL);
            const snap = rel?.localState?.revealSnapshot;
            const raw = (v: unknown): string =>
              v === null ? 'null' : v === undefined ? 'undefined' : String(v);
            const entries = b39Entries();
            const dump = [
              `updateId: ${Updates.updateId ?? 'embedded'}`,
              `runtimeVersion: ${Updates.runtimeVersion ?? '?'}`,
              `entries: ${entries.length}`,
              '',
              `--- ÉTAT ACTUEL DU STORE @ open ---`,
              `relation ${B39_REL}`,
              `relationPresent: ${rel ? 'yes' : 'no'}`,
              `revealSnapshotPresent: ${snap ? 'yes' : 'no'}`,
              `status: ${raw(snap?.status)}`,
              `mutualScore: ${raw(snap?.mutualScore)}`,
              `firstViewedAt: ${raw(snap?.firstViewedAt)}`,
              '',
              '--- [B39] ENTRIES (chronological) ---',
              ...entries.map((e) => `${new Date(e.ts).toISOString()} [${e.label}] ${e.payload}`),
            ].join('\n');
            return (
              <View style={styles.b39Panel}>
                <View style={styles.b39HeaderRow}>
                  <Text style={styles.b39Title}>{`Diagnostic [B39] · ${entries.length} entrées`}</Text>
                  <Pressable onPress={() => setB39Open(false)} style={styles.b39CloseBtn}>
                    <Text style={styles.b39CloseText}>Fermer</Text>
                  </Pressable>
                </View>
                <Text style={styles.b39Hint}>
                  Appui long sur le texte → Tout sélectionner → Copier, puis envoie à Samo.
                </Text>
                <ScrollView style={styles.b39Scroll} contentContainerStyle={styles.b39ScrollContent}>
                  <Text selectable style={styles.b39Mono}>{dump}</Text>
                </ScrollView>
              </View>
            );
          })()}
        </Modal>
      ) : null}
    </View>
  );
}

function BaoTreeMark() {
  return (
    <Svg width={210} height={164} viewBox="0 0 180 140">
      <G fill="none" strokeLinecap="round" strokeLinejoin="round">
        <Path
          d="M24 78C34 55 56 44 90 44C124 44 146 55 156 78"
          stroke={colors.accent.leafGreen}
          strokeOpacity={0.30}
          strokeWidth={1.8}
        />
        <Path
          d="M36 86C48 66 66 58 90 58C114 58 132 66 144 86"
          stroke={colors.accent.warmGold}
          strokeOpacity={0.28}
          strokeWidth={1.5}
        />
        <Path
          d="M90 72C90 86 89 95 89 107"
          stroke={colors.accent.warmGold}
          strokeOpacity={0.36}
          strokeWidth={2}
        />
        <Path
          d="M82 112C86 107 88 103 89 99"
          stroke={colors.accent.softCoral}
          strokeOpacity={0.26}
          strokeWidth={1.5}
        />
        <Path
          d="M96 112C92 107 90 103 89 99"
          stroke={colors.accent.softCoral}
          strokeOpacity={0.26}
          strokeWidth={1.5}
        />
        <Path
          d="M66 72C72 62 79 57 90 55C101 57 108 62 114 72"
          stroke={colors.accent.leafGreen}
          strokeOpacity={0.22}
          strokeWidth={1.2}
        />
      </G>
    </Svg>
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
    flexGrow: 1,
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
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  identityKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.warmGold,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
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
    backgroundColor: colors.background.secondary,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '24',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    marginTop: spacing.xs,
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

  // ── My Bao compact card ────────────────────────────────────────────────────

  baoCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg + 4,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '44',
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
  },
  baoCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accent.warmGold,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  baoQrSurface: {
    padding: 8,
    borderRadius: radius.md,
    backgroundColor: '#FBF3E8',
  },
  baoQrAvatarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baoQrAvatarRing: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FBF3E8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  baoQrAvatarPhoto: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  baoQrLoading: {
    width: 176,
    height: 176,
    borderRadius: radius.md,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baoQrLoadingText: {
    fontSize: 12,
    color: colors.text.muted,
    textAlign: 'center',
  },
  baoCardHint: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
    letterSpacing: 0.4,
  },

  // ── Quiet links ────────────────────────────────────────────────────────────

  quietLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  quietLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: spacing.xs,
  },
  quietLinkLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.muted,
  },

  // ── Utility ────────────────────────────────────────────────────────────────

  utilitySection: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  settingsLink: {
    alignItems: 'center',
  },
  settingsLinkText: {
    fontSize: 12,
    color: colors.text.muted,
    fontWeight: '600',
  },
  buildStamp: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    fontSize: 9,
    color: colors.text.muted,
    opacity: 0.5,
    letterSpacing: 0.3,
  },
  // [B39] TEMPORARY panel styles — remove by grepping [B39].
  b39Panel: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingTop: 56,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
  },
  b39HeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  b39Title: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  b39CloseBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  b39CloseText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  b39Hint: {
    fontSize: 11,
    color: colors.text.muted,
    marginBottom: spacing.sm,
  },
  b39Scroll: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: radius.sm,
    backgroundColor: colors.background.secondary,
  },
  b39ScrollContent: {
    padding: spacing.sm,
  },
  b39Mono: {
    fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 16,
    color: colors.text.primary,
  },
  treeZone: {
    flex: 1,
    minHeight: 130,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: spacing.md,
  },
  treeGlow: {
    position: 'absolute',
    width: 160,
    height: 90,
    borderRadius: 80,
    backgroundColor: colors.accent.leafGreen + '1A',
  },
});
