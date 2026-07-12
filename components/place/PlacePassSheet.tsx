import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import { getNormalizedPrivateLabel } from '@/lib/relation-model';
import { formatPassButtonLabel } from '@/lib/place-pass';
import type { Relation } from '@/store/useRelationsStore';

const NOTE_MAX_LENGTH = 80;

type PlacePassSheetProps = {
  visible: boolean;
  eligibleRelations: Relation[];
  onClose: () => void;
  onPass: (toRelationId: string, toName: string, note?: string) => void;
};

export function PlacePassSheet({
  visible,
  eligibleRelations,
  onClose,
  onPass,
}: PlacePassSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setSelectedId(null);
      setNote('');
    }
  }, [visible]);

  const selectedRelation = eligibleRelations.find((r) => r.id === selectedId);
  const canPass = selectedRelation !== undefined;

  const handlePass = () => {
    if (!selectedRelation) return;
    const trimmedNote = note.trim().slice(0, NOTE_MAX_LENGTH);
    onPass(selectedRelation.id, getNormalizedPrivateLabel(selectedRelation), trimmedNote || undefined);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>Who came to mind?</Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {eligibleRelations.map((relation) => {
            const selected = relation.id === selectedId;
            const label = getNormalizedPrivateLabel(relation);
            return (
              <Pressable
                key={relation.id}
                onPress={() => setSelectedId(relation.id)}
                style={[styles.relationRow, selected && styles.relationRowSelected]}
              >
                <View style={[styles.avatar, selected && styles.avatarSelected]}>
                  <Text style={[styles.avatarText, selected && styles.avatarTextSelected]}>
                    {(relation.avatarSeed || label.charAt(0) || '?').toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.relationName, selected && styles.relationNameSelected]}>
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <TextInput
          value={note}
          onChangeText={(text) => setNote(text.slice(0, NOTE_MAX_LENGTH))}
          placeholder="What made you think of them?"
          placeholderTextColor={colors.text.muted}
          style={styles.noteInput}
          maxLength={NOTE_MAX_LENGTH}
        />

        <Pressable
          onPress={handlePass}
          disabled={!canPass}
          style={[styles.passButton, !canPass && styles.passButtonDisabled]}
        >
          <Text style={styles.passButtonText}>
            {formatPassButtonLabel(selectedRelation ? getNormalizedPrivateLabel(selectedRelation) : null)}
          </Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    backgroundColor: colors.background.secondary,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border.strong,
    marginBottom: spacing.xs,
  },
  title: {
    color: colors.text.primary,
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    maxHeight: 260,
  },
  scrollContent: {
    gap: spacing.xs,
  },
  relationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  relationRowSelected: {
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.soft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: {
    borderColor: colors.accent.warmGold,
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text.secondary,
  },
  avatarTextSelected: {
    color: colors.accent.warmGold,
  },
  relationName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: colors.text.secondary,
  },
  relationNameSelected: {
    color: colors.text.primary,
    fontWeight: '600',
  },
  noteInput: {
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    backgroundColor: colors.background.tertiary,
    fontSize: 14,
    lineHeight: 20,
  },
  passButton: {
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  passButtonDisabled: {
    opacity: 0.4,
  },
  passButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
