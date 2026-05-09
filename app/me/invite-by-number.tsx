import * as Contacts from 'expo-contacts';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
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

export default function InviteByNumberScreen() {
  const { me, addRelation, setCanonicalRelationId } = useRelationsStore();
  const [phone, setPhone] = useState('');
  const [label, setLabel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedContactName, setSelectedContactName] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);
  const labelRef = useRef<TextInput>(null);

  const cleanPhone = phone.trim();
  const cleanLabel = label.trim();
  const canSubmit = cleanPhone.length >= 6 && cleanLabel.length >= 2;

  const handlePickContact = async () => {
    setContactError(null);
    const contact = await Contacts.presentContactPickerAsync();
    if (!contact) return;
    const firstPhone = contact.phoneNumbers?.[0];
    if (!firstPhone?.number) {
      setContactError('This contact has no phone number.');
      return;
    }
    const name = contact.name
      || [contact.firstName, contact.lastName].filter(Boolean).join(' ')
      || '';
    setPhone(firstPhone.number);
    if (name) setLabel(name);
    setSelectedContactName(name || null);
  };

  const handleCreate = async () => {
    if (!canSubmit || isSubmitting) return;
    setIsSubmitting(true);

    try {
      const relation = addRelation(cleanLabel, {
        source: 'invite_number',
        privateLabel: cleanLabel,
        anchorMode: 'invite_number',
        anchorValue: cleanPhone,
        relationDepth: 'encounter',
      });
      if (!relation) {
        Alert.alert('Error', 'Could not create the relationship. Try again.');
        return;
      }

      const canonicalId = relation.canonicalRelationId ?? newCanonicalRelationId();
      if (!relation.canonicalRelationId) {
        setCanonicalRelationId(relation.id, canonicalId);
      }
      if (isLocalDraftId(canonicalId)) {
        Alert.alert('Error', 'Could not generate a valid invite. Try again.');
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
        // Invite or share failed — relation created, user can re-share from relation/[id].
      }

      router.replace({ pathname: '/relation/[id]', params: { id: relation.id } });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <Text style={styles.title}>{'Invite someone'}</Text>
          <Text style={styles.subtitle}>
            {'Choose someone to invite. Your contacts stay on this device.'}
          </Text>

          {/* ── Contact picker ────────────────────────────────────────── */}
          <Pressable
            style={styles.contactPickerBtn}
            onPress={() => void handlePickContact()}
          >
            <Text style={styles.contactPickerText}>
              {selectedContactName ?? 'Choose contact'}
            </Text>
          </Pressable>

          {contactError ? (
            <Text style={styles.contactError}>{contactError}</Text>
          ) : null}

          {/* ── Divider ───────────────────────────────────────────────── */}
          <View style={styles.orRow}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>{'or enter manually'}</Text>
            <View style={styles.orLine} />
          </View>

          {/* ── Manual fields ─────────────────────────────────────────── */}
          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{'Phone number'}</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="+1 555 000 0000"
              placeholderTextColor={colors.text.muted}
              style={styles.input}
              keyboardType="phone-pad"
              returnKeyType="next"
              onSubmitEditing={() => labelRef.current?.focus()}
              blurOnSubmit={false}
            />
          </View>

          <View style={styles.fieldBlock}>
            <Text style={styles.fieldLabel}>{'Private label'}</Text>
            <TextInput
              ref={labelRef}
              value={label}
              onChangeText={setLabel}
              placeholder="How you know this person"
              placeholderTextColor={colors.text.muted}
              style={[styles.input, styles.inputSecondary]}
              returnKeyType="done"
              onSubmitEditing={() => void handleCreate()}
            />
            <Text style={styles.fieldCaption}>{'Only visible to you — never shared.'}</Text>
          </View>

          <Pressable
            onPress={() => void handleCreate()}
            disabled={!canSubmit || isSubmitting}
            style={[styles.primaryButton, (!canSubmit || isSubmitting) && styles.primaryButtonDisabled]}
          >
            <Text style={styles.primaryButtonText}>
              {isSubmitting ? 'Creating…' : 'Send invite'}
            </Text>
          </Pressable>

          <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>{'Cancel'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text.primary,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  contactPickerBtn: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  contactPickerText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  contactError: {
    fontSize: 12,
    color: colors.semantic.alert,
    textAlign: 'center',
    marginTop: -spacing.xs,
  },
  orRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
  },
  orText: {
    fontSize: 11,
    color: colors.text.muted,
    fontWeight: '500',
  },
  fieldBlock: {
    gap: spacing.xs,
  },
  fieldLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    color: colors.text.muted,
    fontWeight: '700',
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
  inputSecondary: {
    opacity: 0.7,
    fontSize: 14,
  },
  fieldCaption: {
    fontSize: 11,
    color: colors.text.muted,
    lineHeight: 16,
  },
  primaryButton: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
