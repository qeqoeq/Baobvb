import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import type { PlaceCategory, ReceivedObject } from '@/store/useRelationsStore';

const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  restaurant: 'Restaurant',
  cafe: 'Café',
  bar: 'Bar',
  spot: 'Coin',
  other: 'Lieu',
};

type PlaceReceivedSheetProps = {
  visible: boolean;
  receivedObject: ReceivedObject | null;
  fromRelationName: string | null;
  onClose: () => void;
  onKeep: () => void;
  onNotForMe: () => void;
};

export function PlaceReceivedSheet({
  visible,
  receivedObject,
  fromRelationName,
  onClose,
  onKeep,
  onNotForMe,
}: PlaceReceivedSheetProps) {
  if (!receivedObject) return null;

  const displayName = fromRelationName ?? 'Quelqu’un';
  const categoryLabel = CATEGORY_LABELS[receivedObject.categorySnapshot] ?? 'Lieu';

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

        <Text style={styles.title}>
          {`${displayName} a pensé à toi.`}
        </Text>

        <View style={styles.objectRow}>
          <Text style={styles.objectName}>{receivedObject.nameSnapshot}</Text>
          <Text style={styles.objectCategory}>{` · ${categoryLabel}`}</Text>
        </View>

        {receivedObject.note ? (
          <Text style={styles.note}>{receivedObject.note}</Text>
        ) : null}

        <Pressable onPress={onKeep} style={styles.keepButton}>
          <Text style={styles.keepButtonText}>{'Garder'}</Text>
        </Pressable>

        <Pressable onPress={onNotForMe} style={styles.notForMeButton}>
          <Text style={styles.notForMeText}>{'Pas pour moi'}</Text>
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
  objectRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
  },
  objectName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text.primary,
  },
  objectCategory: {
    fontSize: 13,
    fontWeight: '400',
    color: colors.text.secondary,
  },
  note: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.text.secondary,
    lineHeight: 19,
  },
  keepButton: {
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  keepButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  notForMeButton: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  notForMeText: {
    fontSize: 13,
    color: colors.text.muted,
    fontWeight: '500',
  },
});
