import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { requestEmailOtp, signInWithApple, verifyEmailOtp } from '../../lib/supabase-auth';

type SignInState = 'idle' | 'email_entry' | 'code_sent' | 'verifying';

export default function AuthSignInScreen() {
  const { relationId } = useLocalSearchParams<{ relationId?: string }>();
  const inviteRelationId = typeof relationId === 'string' ? relationId.trim() : '';

  const [state, setState]         = useState<SignInState>('idle');
  const [email, setEmail]         = useState('');
  const [code, setCode]           = useState('');
  const [isApple, setIsApple]     = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isVerify, setIsVerify]   = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const sendingRef                = useRef(false);

  // ── Apple ──────────────────────────────────────────────────────────────────

  const handleApple = async () => {
    if (isApple) return;
    setIsApple(true);
    setError(null);
    try {
      await signInWithApple();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in right now. Please try again.');
    } finally {
      setIsApple(false);
    }
  };

  // ── Email OTP — send ────────────────────────────────────────────────────────

  const handleSendCode = async () => {
    if (sendingRef.current || isSending) return;
    sendingRef.current = true;
    setIsSending(true);
    setError(null);
    try {
      await requestEmailOtp(email);
      setCode('');
      setState('code_sent');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send code. Please try again.');
    } finally {
      setIsSending(false);
      sendingRef.current = false;
    }
  };

  // ── Email OTP — verify ──────────────────────────────────────────────────────

  const handleVerify = async () => {
    if (isVerify) return;
    setIsVerify(true);
    setState('verifying');
    setError(null);
    try {
      await verifyEmailOtp(email, code);
      // onAuthStateChange in _layout.tsx drives navigation.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid code. Please try again.');
      setState('code_sent');
    } finally {
      setIsVerify(false);
    }
  };

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const busy = isApple || isSending || isVerify;

  const goBack = () => {
    setError(null);
    setState('idle');
  };

  const useAnotherEmail = () => {
    setCode('');
    setError(null);
    setState('email_entry');
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.card}>

        {/* Title + sub-text */}
        <View style={styles.copyZone}>
          <Text style={styles.title}>{'Sign in to Baobab'}</Text>
          <Text style={styles.body}>
            {inviteRelationId
              ? 'Sign in to accept this invitation and add your side of the relationship.'
              : 'Your connections, mapped privately.'}
          </Text>
        </View>

        {/* Error */}
        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {/* ════════════════════════════════ IDLE ════════════════════════════════ */}
        {state === 'idle' && (
          <>
            <Pressable
              onPress={() => { setError(null); setState('email_entry'); }}
              style={styles.primaryButton}
            >
              <Text style={styles.primaryButtonText}>{'Continue with email'}</Text>
            </Pressable>

            <Pressable
              onPress={() => void handleApple()}
              disabled={isApple}
              style={[styles.secondaryButton, isApple && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonText}>
                {isApple ? 'Signing in…' : 'Continue with Apple'}
              </Text>
            </Pressable>
          </>
        )}

        {/* ═════════════════════════ EMAIL ENTRY ════════════════════════════════ */}
        {state === 'email_entry' && (
          <>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="send"
              onSubmitEditing={() => void handleSendCode()}
              autoFocus
              editable={!busy}
            />

            <Pressable
              onPress={() => void handleSendCode()}
              disabled={isSending || !email.trim()}
              style={[styles.primaryButton, (isSending || !email.trim()) && styles.buttonDisabled]}
            >
              <Text style={styles.primaryButtonText}>
                {isSending ? 'Sending…' : 'Send code'}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => void handleApple()}
              disabled={isApple || isSending}
              style={[styles.secondaryButton, (isApple || isSending) && styles.buttonDisabled]}
            >
              <Text style={styles.secondaryButtonText}>
                {isApple ? 'Signing in…' : 'Continue with Apple'}
              </Text>
            </Pressable>

            <Pressable onPress={goBack} disabled={busy} style={styles.ghostButton}>
              <Text style={styles.ghostButtonText}>{'Back'}</Text>
            </Pressable>
          </>
        )}

        {/* ══════════════════════════ CODE SENT / VERIFYING ═════════════════════ */}
        {(state === 'code_sent' || state === 'verifying') && (
          <>
            <Text style={styles.codeSentHint}>
              {'Check your email — we sent a private sign-in code.'}
            </Text>

            <TextInput
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              keyboardType="number-pad"
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (code.trim().length === 6) void handleVerify();
              }}
              editable={state !== 'verifying'}
              autoFocus
            />

            <Pressable
              onPress={() => void handleVerify()}
              disabled={isVerify || code.trim().length < 6}
              style={[
                styles.primaryButton,
                (isVerify || code.trim().length < 6) && styles.buttonDisabled,
              ]}
            >
              <Text style={styles.primaryButtonText}>
                {isVerify ? 'Confirming…' : 'Confirm'}
              </Text>
            </Pressable>

            <View style={styles.secondaryActions}>
              <Pressable onPress={useAnotherEmail} disabled={isVerify}>
                <Text style={styles.secondaryActionText}>{'Use another email'}</Text>
              </Pressable>
              <Pressable onPress={() => void handleSendCode()} disabled={isSending || isVerify}>
                <Text style={styles.secondaryActionText}>
                  {isSending ? 'Sending…' : 'Resend code'}
                </Text>
              </Pressable>
            </View>
          </>
        )}

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  copyZone: {
    gap: spacing.xs,
  },
  title: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700',
    color: colors.text.primary,
  },
  body: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text.secondary,
  },
  errorText: {
    fontSize: 12,
    color: colors.semantic.alert,
    lineHeight: 18,
  },
  primaryButton: {
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  secondaryButton: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.strong,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  ghostButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  ghostButtonText: {
    fontSize: 13,
    color: colors.text.muted,
  },
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
  codeSentHint: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text.secondary,
  },
  secondaryActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  secondaryActionText: {
    fontSize: 12,
    color: colors.text.muted,
    opacity: 0.75,
  },
});
