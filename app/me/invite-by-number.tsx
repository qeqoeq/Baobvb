import * as Contacts from 'expo-contacts';
import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { isLocalDraftId, newCanonicalRelationId } from '../../lib/identity';
import { getRelationshipInviteMessage } from '../../lib/relationship-invite';
import { createRelationshipInviteForCurrentUser } from '../../lib/reveal-shared-repo';
import { useRelationsStore } from '../../store/useRelationsStore';

type ScreenState = 'ready' | 'no_phone' | 'manual' | 'submitting';

// ── Decorative Bao orb — concentric rings + 3 satellite nodes ─────────────────
function BaoOrb() {
  return (
    <View style={styles.baoOrbWrapper}>
      <View style={styles.baoOrb}>
        <View style={styles.baoOrbInner} />
      </View>
      {/* Satellite nodes at ~45°, ~150°, ~270° around the ring */}
      <View style={[styles.baoNode, { left: 57, top: 15 }]} />
      <View style={[styles.baoNode, { left: 10, top: 21 }]} />
      <View style={[styles.baoNode, { left: 36, top: 66 }]} />
    </View>
  );
}

export default function InviteByNumberScreen() {
  const { me, addRelation, setCanonicalRelationId } = useRelationsStore();
  const [screenState, setScreenState] = useState<ScreenState>('ready');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  // isPicking drives button disabled state; isPickingRef is the sync mutex.
  const [isPicking, setIsPicking] = useState(false);

  // Mutex: prevents simultaneous presentContactPickerAsync() calls.
  const isPickingRef = useRef(false);

  const canSubmitManual = phone.trim().length >= 6;

  const sendInvite = async (anchorPhone: string, label: string) => {
    setScreenState('submitting');
    const effectiveLabel = label.trim() || anchorPhone.trim();
    try {
      const relation = addRelation(effectiveLabel, {
        source: 'invite_number',
        privateLabel: effectiveLabel,
        anchorMode: 'invite_number',
        anchorValue: anchorPhone,
        relationDepth: 'encounter',
      });
      if (!relation) {
        setErrorMsg('Could not create relationship. Try again.');
        setScreenState('ready');
        return;
      }

      const canonicalId = relation.canonicalRelationId ?? newCanonicalRelationId();
      if (!relation.canonicalRelationId) {
        setCanonicalRelationId(relation.id, canonicalId);
      }
      if (isLocalDraftId(canonicalId)) {
        setErrorMsg('Could not generate invite. Try again.');
        setScreenState('ready');
        return;
      }

      try {
        const invite = await createRelationshipInviteForCurrentUser(canonicalId, 'sideA');
        const { message, url } = getRelationshipInviteMessage({
          relationId: canonicalId,
          inviteToken: invite.invite_token,
          senderName: me.displayName,
        });
        await Share.share({ message: url ? `${message}\n${url}` : message });
      } catch {
        // invite/share failed — relation created, re-share available from relation/[id]
      }

      router.replace({ pathname: '/relation/[id]', params: { id: relation.id } });
    } catch {
      setErrorMsg('Something went wrong. Try again.');
      setScreenState('ready');
    }
  };

  const launchPicker = async () => {
    // Mutex: reject if another picker call is already in flight.
    if (isPickingRef.current) return;
    isPickingRef.current = true;
    setIsPicking(true);
    setErrorMsg(null);
    try {
      const contact = await Contacts.presentContactPickerAsync();
      if (!contact) {
        // Picker dismissed — stay on card, only Cancel exits.
        return;
      }
      const firstPhone = contact.phoneNumbers?.[0];
      if (!firstPhone?.number) {
        setScreenState('no_phone');
        return;
      }
      const contactName =
        contact.name ||
        [contact.firstName, contact.lastName].filter(Boolean).join(' ') ||
        '';
      await sendInvite(firstPhone.number, contactName);
    } catch {
      // Native error (e.g. concurrent picker call that slipped through) — ignore silently.
    } finally {
      isPickingRef.current = false;
      setIsPicking(false);
    }
  };

  // ── Submitting ──────────────────────────────────────────────────────────────
  if (screenState === 'submitting') {
    return (
      <View style={styles.screen}>
        <Text style={styles.statusText}>{'Sending invite…'}</Text>
      </View>
    );
  }

  // ── Manual entry ────────────────────────────────────────────────────────────
  if (screenState === 'manual') {
    return (
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{'Enter manually'}</Text>
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}
          <TextInput
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 000 0000"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            keyboardType="phone-pad"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => {
              if (canSubmitManual) void sendInvite(phone.trim(), name.trim());
            }}
          />
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Name (optional)"
            placeholderTextColor={colors.text.muted}
            style={[styles.input, styles.inputSecondary]}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (canSubmitManual) void sendInvite(phone.trim(), name.trim());
            }}
          />
          <Pressable
            onPress={() => void sendInvite(phone.trim(), name.trim())}
            disabled={!canSubmitManual}
            style={[styles.primaryButton, !canSubmitManual && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>{'Send invite'}</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>{'Cancel'}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  // ── No phone number ─────────────────────────────────────────────────────────
  if (screenState === 'no_phone') {
    return (
      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.screenGlow} />
        <View style={styles.card}>
          <BaoOrb />
          <Text style={styles.title}>{'No phone number'}</Text>
          <Text style={styles.body}>{'This contact has no phone number saved.'}</Text>
          <Pressable
            onPress={() => void launchPicker()}
            disabled={isPicking}
            style={[styles.primaryButton, isPicking && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>
              {isPicking ? 'Opening contacts…' : 'Choose another contact'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setErrorMsg(null); setScreenState('manual'); }}
            disabled={isPicking}
            style={styles.subtleButton}
          >
            <Text style={[styles.subtleButtonText, isPicking && styles.disabledText]}>
              {'Enter number manually'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>{'Cancel'}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Ready — default state ───────────────────────────────────────────────────
  return (
    <>
      <Stack.Screen options={{ title: 'Invite someone' }} />
      <View style={styles.screen}>
        <View pointerEvents="none" style={styles.screenGlow} />
        <View style={styles.card}>

          {/* ── Orb + kicker ── */}
          <View style={styles.orbZone}>
            <BaoOrb />
            <Text style={styles.kicker}>{'BAOBAB'}</Text>
          </View>

          {/* ── Copy ── */}
          <Text style={styles.title}>{'Send a Bao'}</Text>
          <Text style={styles.body}>
            {'Choose someone you truly know to start a private reading.'}
          </Text>
          <Text style={styles.microcopy}>
            {'Nothing is public. The link reveals only when both sides share.'}
          </Text>

          {/* ── Error ── */}
          {errorMsg ? <Text style={styles.errorText}>{errorMsg}</Text> : null}

          {/* ── CTA ── */}
          <Pressable
            onPress={() => void launchPicker()}
            disabled={isPicking}
            style={[styles.primaryButton, isPicking && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>
              {isPicking ? 'Opening contacts…' : 'Choose contact'}
            </Text>
          </Pressable>

          {/* ── Secondary actions ── */}
          <Pressable
            onPress={() => { setErrorMsg(null); setScreenState('manual'); }}
            disabled={isPicking}
            style={styles.subtleButton}
          >
            <Text style={[styles.subtleButtonText, isPicking && styles.disabledText]}>
              {'Enter number manually'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.ghostButton}>
            <Text style={styles.ghostButtonText}>{'Cancel'}</Text>
          </Pressable>

        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({

  // ── Screen ─────────────────────────────────────────────────────────────────

  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    justifyContent: 'center',
  },

  // Warm glow behind the card — absolute, never blocks touches.
  screenGlow: {
    position: 'absolute',
    left: -40,
    right: -40,
    top: '22%',
    height: 320,
    borderRadius: 160,
    backgroundColor: colors.accent.warmGold + '07',
  },

  // ── Bao orb ────────────────────────────────────────────────────────────────

  baoOrbWrapper: {
    width: 80,
    height: 80,
    position: 'relative',
  },
  baoOrb: {
    position: 'absolute',
    left: 14,
    top: 14,
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '38',
    backgroundColor: colors.accent.warmGold + '0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  baoOrbInner: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent.warmGold + '20',
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '55',
  },
  baoNode: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent.warmGold + '42',
  },
  orbZone: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.xs,
  },

  // ── Card ───────────────────────────────────────────────────────────────────

  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg + 4,
    borderWidth: 1,
    borderColor: colors.accent.warmGold + '22',
    padding: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },

  // ── Typography ─────────────────────────────────────────────────────────────

  kicker: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accent.warmGold,
    letterSpacing: 3.5,
    textTransform: 'uppercase',
    opacity: 0.8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: -0.4,
  },
  body: {
    fontSize: 14,
    lineHeight: 22,
    color: colors.text.secondary,
  },
  microcopy: {
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.muted,
    marginTop: -spacing.xs,
  },
  statusText: {
    fontSize: 15,
    color: colors.text.muted,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 12,
    color: colors.semantic.alert,
    lineHeight: 18,
  },

  // ── Primary button ─────────────────────────────────────────────────────────

  primaryButton: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md + 2,
    marginTop: spacing.xs,
    // Soft teal shadow — adds depth and life to the CTA.
    shadowColor: colors.accent.deepTeal,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
    shadowOpacity: 0,
    elevation: 0,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
    letterSpacing: 0.1,
  },

  // ── Secondary / ghost actions ───────────────────────────────────────────────

  subtleButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  subtleButtonText: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.text.muted,
    opacity: 0.55,
  },
  ghostButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  ghostButtonText: {
    fontSize: 12,
    fontWeight: '400',
    color: colors.text.muted,
    opacity: 0.6,
  },

  // ── Form (manual fallback) ──────────────────────────────────────────────────

  input: {
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    fontSize: 15,
  },
  inputSecondary: {
    opacity: 0.7,
    fontSize: 14,
  },

  disabledText: {
    opacity: 0.35,
  },
});
