import { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import { PLACE_CONTEXT_FIT_LABELS } from '@/lib/places';
import {
  PLACE_CONTEXT_FIT_OPTIONS,
  type PlaceContextFit,
  type PlaceQuickSignal,
} from '@/lib/place-quick-signal';

const CONTEXT_FIT_MAX = 2;

type PlaceQuickSignalSheetProps = {
  visible: boolean;
  value: PlaceQuickSignal;
  onChange: (value: PlaceQuickSignal) => void;
  onDismiss: () => void;
};

export function PlaceQuickSignalSheet({
  visible,
  value,
  onChange,
  onDismiss,
}: PlaceQuickSignalSheetProps) {
  const [touched, setTouched] = useState(false);

  const contextFit = value.contextFit ?? [];

  const showAcknowledgement = useMemo(
    () =>
      touched &&
      (value.repeatDesire !== undefined ||
        value.shareSafe !== undefined ||
        contextFit.length > 0),
    [touched, value.repeatDesire, value.shareSafe, contextFit.length],
  );

  const setRepeatDesire = (repeatDesire: boolean) => {
    setTouched(true);
    onChange({ ...value, repeatDesire });
  };

  const setShareSafe = (shareSafe: boolean) => {
    setTouched(true);
    onChange({ ...value, shareSafe });
  };

  const toggleContextFit = (option: PlaceContextFit) => {
    const selected = contextFit.includes(option);
    const next = selected
      ? contextFit.filter((item) => item !== option)
      : contextFit.length >= CONTEXT_FIT_MAX
        ? contextFit
        : [...contextFit, option];
    setTouched(true);
    onChange({ ...value, contextFit: next });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <Pressable style={styles.backdrop} onPress={onDismiss} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />

        <Text style={styles.title}>A quick read</Text>
        <Text style={styles.caption}>Help Bao understand when this place fits.</Text>

        <View style={styles.section}>
          <Text style={styles.question}>Worth returning?</Text>
          <View style={styles.row}>
            <YesNoChip
              label="Yes"
              active={value.repeatDesire === true}
              onPress={() => setRepeatDesire(true)}
            />
            <YesNoChip
              label="No"
              active={value.repeatDesire === false}
              onPress={() => setRepeatDesire(false)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.question}>Would you send someone here?</Text>
          <View style={styles.row}>
            <YesNoChip
              label="Yes"
              active={value.shareSafe === true}
              onPress={() => setShareSafe(true)}
            />
            <YesNoChip
              label="No"
              active={value.shareSafe === false}
              onPress={() => setShareSafe(false)}
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.question}>Good for…</Text>
          <View style={styles.chipRow}>
            {PLACE_CONTEXT_FIT_OPTIONS.map((option) => {
              const selected = contextFit.includes(option);
              const atMax = contextFit.length >= CONTEXT_FIT_MAX;
              const disabled = !selected && atMax;
              return (
                <Pressable
                  key={option}
                  onPress={() => toggleContextFit(option)}
                  disabled={disabled}
                  style={[
                    styles.contextChip,
                    selected && styles.contextChipSelected,
                    disabled && styles.contextChipDisabled,
                  ]}
                >
                  <Text
                    style={[
                      styles.contextChipText,
                      selected && styles.contextChipTextSelected,
                    ]}
                  >
                    {PLACE_CONTEXT_FIT_LABELS[option]}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {showAcknowledgement ? (
          <Text style={styles.acknowledgement}>Your Bao learned this place.</Text>
        ) : null}

        <Pressable onPress={onDismiss} style={styles.doneButton}>
          <Text style={styles.doneButtonText}>Done</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

function YesNoChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.yesNoChip, active && styles.yesNoChipActive]}>
      <Text style={[styles.yesNoChipText, active && styles.yesNoChipTextActive]}>{label}</Text>
    </Pressable>
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
  caption: {
    color: colors.text.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  section: {
    gap: spacing.sm,
  },
  question: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  yesNoChip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs + 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  yesNoChipActive: {
    borderColor: colors.accent.deepTeal,
    backgroundColor: colors.accent.deepTeal + '1F',
  },
  yesNoChipText: {
    color: colors.text.muted,
    fontWeight: '600',
  },
  yesNoChipTextActive: {
    color: colors.text.primary,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  contextChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  contextChipSelected: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.accent.warmGold + '18',
  },
  contextChipDisabled: {
    opacity: 0.4,
  },
  contextChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.text.secondary,
  },
  contextChipTextSelected: {
    color: colors.accent.warmGold,
  },
  acknowledgement: {
    color: colors.text.muted,
    fontSize: 12,
    fontStyle: 'italic',
  },
  doneButton: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
