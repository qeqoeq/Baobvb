import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as FileSystem from 'expo-file-system/legacy';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Animated, PanResponder, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import Svg, { G, Path } from 'react-native-svg';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { deriveBaobabCode } from '../../lib/identity-format';
import { buildPersonCardPayload, encodePersonCardPayload } from '../../lib/person-card';
import { getOrCreatePublicProfileId } from '../../lib/public-profile';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function MyCardQrScreen() {
  const { me, setPublicProfileId } = useRelationsStore();
  const [provisionFailed, setProvisionFailed] = useState(false);
  const provisioningRef = useRef(false);

  const isCardReady = Boolean(me.publicProfileId);
  const payload = me.publicProfileId
    ? encodePersonCardPayload(buildPersonCardPayload(me, { preferV2: true }))
    : null;
  const baobabCode = me.showBaobabCode ? deriveBaobabCode(me.publicProfileId) : null;

  const cardY = useRef(new Animated.Value(0)).current;
  const qrSvgRef = useRef<any>(null);
  const shareDataRef = useRef({ handle: me.handle, baobabCode });
  shareDataRef.current = { handle: me.handle, baobabCode };
  const isSharingRef = useRef(false);
  const hasTriggeredSendRef = useRef(false);

  // Stable function ref: all deps (cardY, qrSvgRef, shareDataRef, isSharingRef,
  // hasTriggeredSendRef) are stable refs captured once by the PanResponder
  // closure. .current is re-assigned each render so it always reads fresh refs.
  const launchSendRef = useRef<() => void>(() => { /* populated below */ });
  launchSendRef.current = () => {
    if (isSharingRef.current) return;
    isSharingRef.current = true;
    hasTriggeredSendRef.current = true;
    Animated.spring(cardY, { toValue: -110, useNativeDriver: false, tension: 220, friction: 12 }).start(() => {
      Animated.spring(cardY, { toValue: 0, useNativeDriver: false, tension: 100, friction: 18 }).start();
    });
    const { handle, baobabCode: code } = shareDataRef.current;
    const message = `Add me on Baobab — ${handle}${code ? ` · ${code}` : ''}`;
    void (async () => {
      try {
        await triggerSendHaptics();
        const svgRef = qrSvgRef.current;
        if (svgRef?.toDataURL) {
          await new Promise<void>((resolve) => {
            svgRef.toDataURL(async (base64: string) => {
              try {
                const fileUri = `${FileSystem.cacheDirectory}bao-${Date.now()}.png`;
                await FileSystem.writeAsStringAsync(fileUri, base64, {
                  encoding: FileSystem.EncodingType.Base64,
                });
                await Share.share({ url: fileUri, message });
              } catch {
                await Share.share({ message });
              } finally {
                resolve();
              }
            });
          });
        } else {
          await Share.share({ message });
        }
      } finally {
        isSharingRef.current = false;
        hasTriggeredSendRef.current = false;
      }
    })();
  };

  const panResponder = useRef(
    PanResponder.create({
      // Claim immediately so iOS native gesture system doesn't steal the responder
      // before onMoveShouldSetPanResponder fires. Safe: no Pressables inside the
      // card when isCardReady (panHandlers are not spread when !isCardReady).
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy < -5 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderMove: (_, gs) => {
        if (gs.dy < 0) {
          const nextY = Math.max(gs.dy * 0.75, -90);
          cardY.setValue(nextY);
          // Trigger on crossing during move — onPanResponderRelease can be stolen
          // by the iOS modal gesture recognizer before the finger lifts.
          if (!hasTriggeredSendRef.current && (gs.dy < -24 || gs.vy < -0.22)) {
            launchSendRef.current();
          }
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (!hasTriggeredSendRef.current) {
          Animated.spring(cardY, { toValue: 0, useNativeDriver: false, tension: 120, friction: 14 }).start();
        }
      },
      onPanResponderTerminate: () => {
        if (!hasTriggeredSendRef.current) {
          Animated.spring(cardY, { toValue: 0, useNativeDriver: false, tension: 120, friction: 14 }).start();
        }
      },
    }),
  ).current;

  useEffect(() => {
    if (me.publicProfileId || provisioningRef.current) return;
    provisioningRef.current = true;
    setProvisionFailed(false);
    void getOrCreatePublicProfileId()
      .then((id) => { setPublicProfileId(id); })
      .catch((err) => {
        if (__DEV__) console.warn('[identity:qr] provisioning failed:', err);
        setProvisionFailed(true);
      })
      .finally(() => { provisioningRef.current = false; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = () => {
    if (me.publicProfileId || provisioningRef.current) return;
    provisioningRef.current = true;
    setProvisionFailed(false);
    void getOrCreatePublicProfileId()
      .then((id) => { setPublicProfileId(id); })
      .catch((err) => {
        if (__DEV__) console.warn('[identity:qr] retry failed:', err);
        setProvisionFailed(true);
      })
      .finally(() => { provisioningRef.current = false; });
  };

  return (
    <View style={styles.screen}>
      <View pointerEvents="none" style={styles.glowAccent} />
      <View pointerEvents="none" style={styles.glowAccentSoft} />

      <Pressable onPress={() => router.back()} style={styles.closeIcon}>
        <Ionicons name="close" size={20} color={colors.text.secondary} />
      </Pressable>

      <View style={styles.content}>
        <View style={styles.brandZone}>
          <Text style={styles.brandKicker}>{'BAOBAB'}</Text>
          <Text style={styles.brandTitle}>{'My Bao'}</Text>
        </View>

        <Animated.View
          style={[styles.cardMotion, { transform: [{ translateY: cardY }] }]}
          {...(isCardReady ? panResponder.panHandlers : {})}
        >
        <View style={styles.card}>
          <View style={styles.identityZone}>
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
            <Text style={styles.name}>{me.displayName}</Text>
            <View style={styles.handleRow}>
              <Text style={styles.handle}>{me.handle}</Text>
              {baobabCode !== null ? (
                <Text style={styles.baobabCode}>{`· ${baobabCode}`}</Text>
              ) : null}
            </View>
          </View>

          {isCardReady ? (
            <>
              <View style={styles.qrPlaceholder}>
                <View style={styles.qrSurface}>
                  <QRCode
                    value={payload!}
                    size={214}
                    color="#111111"
                    backgroundColor="#FBF3E8"
                    ecl="H"
                    getRef={(c) => { qrSvgRef.current = c; }}
                  />
                  {me.photoUri && (
                    <View style={styles.qrAvatarWrap} pointerEvents="none">
                      <View style={styles.qrAvatarRing}>
                        <Image
                          source={{ uri: me.photoUri }}
                          style={styles.qrAvatarPhoto}
                          contentFit="cover"
                        />
                      </View>
                    </View>
                  )}
                </View>
              </View>
              <Text style={styles.qrScanLabel}>{'Scan my Bao'}</Text>
            </>
          ) : (
            <View style={[styles.qrPlaceholder, styles.qrPlaceholderLoading]}>
              <View style={styles.loadingContent}>
                <BaoSprout />
                <Text style={styles.loadingTitle}>{'Your Bao is forming'}</Text>
                <Text style={styles.loadingBody}>{'We\'re aligning both readings.'}</Text>
                {provisionFailed ? (
                  <Pressable onPress={handleRetry} style={styles.retryAction}>
                    <Text style={styles.retryActionText}>{'Retry'}</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          )}
        </View>
        </Animated.View>
      </View>

      {isCardReady && (
        <Text style={styles.swipeHint}>{'↑  Swipe up to send'}</Text>
      )}

      <Pressable onPress={() => router.push('../me/edit')} style={styles.editAction}>
        <Text style={styles.editActionText}>{'Edit my Bao'}</Text>
      </Pressable>
    </View>
  );
}

async function triggerSendHaptics() {
  if (process.env.EXPO_OS !== 'ios') return;
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  await new Promise<void>((r) => setTimeout(r, 90));
  await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  await new Promise<void>((r) => setTimeout(r, 120));
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

function BaoSprout() {
  return (
    <Svg width={72} height={66} viewBox="0 0 52 48">
      <G fill="none" strokeLinecap="round" strokeLinejoin="round">
        <Path d="M26 42C26 32 26 26 26 18" stroke={colors.accent.warmGold} strokeWidth={2.2} strokeOpacity={0.75} />
        <Path d="M24 44C21 42 18 41 14 41" stroke={colors.accent.leafGreen} strokeWidth={1.6} strokeOpacity={0.55} />
        <Path d="M28 44C31 42 34 41 38 41" stroke={colors.accent.leafGreen} strokeWidth={1.6} strokeOpacity={0.55} />
        <Path d="M26 22C21 17 15 15 10 17" stroke={colors.accent.leafGreen} strokeWidth={1.6} strokeOpacity={0.55} />
        <Path d="M26 22C31 17 37 15 42 17" stroke={colors.accent.leafGreen} strokeWidth={1.6} strokeOpacity={0.55} />
        <Path d="M10 13C16 9 21 8 26 9C31 8 36 9 42 13" stroke={colors.accent.leafGreen} strokeWidth={1.3} strokeOpacity={0.40} />
      </G>
    </Svg>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing.lg,
    paddingTop: 56,
    paddingBottom: spacing.xl,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  glowAccent: {
    position: 'absolute',
    top: -30,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: colors.accent.warmGold + '14',
  },
  glowAccentSoft: {
    position: 'absolute',
    bottom: 120,
    left: -50,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: colors.accent.softAmber + '0C',
  },
  closeIcon: {
    position: 'absolute',
    top: spacing.lg,
    right: spacing.lg,
    zIndex: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
    borderWidth: 1,
    borderColor: colors.border.soft,
  },
  brandZone: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  brandKicker: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent.warmGold,
    letterSpacing: 3.2,
    textTransform: 'uppercase',
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.7,
  },
  cardMotion: {
    // Motion-only wrapper: no visual properties so styles.card is the sole source
    // of border/background/padding — eliminates any style conflict with transform.
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg + 6,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '44',
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  identityZone: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: colors.accent.warmGold + '7A',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent.warmGold + '10',
  },
  avatarInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: '#26201C',
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '24',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: {
    color: colors.text.primary,
    fontSize: 30,
    fontWeight: '700',
  },
  avatarPhoto: {
    width: 76,
    height: 76,
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.4,
  },
  handleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  handle: {
    fontSize: 15,
    color: colors.accent.softAmber,
    fontWeight: '600',
  },
  baobabCode: {
    fontSize: 12,
    fontWeight: '500',
    color: colors.text.muted,
    letterSpacing: 0.5,
  },
  syncingNote: {
    fontSize: 11,
    color: colors.text.muted,
    fontStyle: 'italic',
    opacity: 0.35,
  },
  qrPlaceholder: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '30',
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md + 2,
    overflow: 'hidden',
  },
  qrPlaceholderLoading: {
    aspectRatio: undefined,
    height: 200,
  },
  qrSurface: {
    padding: spacing.sm + 2,
    borderRadius: radius.md,
    backgroundColor: '#FBF3E8',
  },
  qrAvatarWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrAvatarRing: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FBF3E8',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  qrAvatarPhoto: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  qrScanLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.text.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  loadingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text.primary,
    textAlign: 'center',
  },
  loadingBody: {
    fontSize: 13,
    color: colors.text.secondary,
    textAlign: 'center',
  },
  retryAction: {
    marginTop: spacing.xs,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '44',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  retryActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accent.warmGold,
  },
  swipeHint: {
    fontSize: 11,
    fontWeight: '500',
    color: colors.text.muted,
    letterSpacing: 0.4,
    textAlign: 'center',
    opacity: 0.7,
    paddingBottom: spacing.xs,
  },
  editAction: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  editActionText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
  },
});
