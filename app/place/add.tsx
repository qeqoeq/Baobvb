import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { PlaceQuickSignalSheet } from '@/components/place/PlaceQuickSignalSheet';
import { colors } from '@/constants/colors';
import { radius, spacing } from '@/constants/spacing';
import {
  PLACE_PERSONAL_FIT_CAPTURE_OPTIONS,
  PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION,
} from '@/lib/places';
import type { PlaceQuickSignal } from '@/lib/place-quick-signal';
import {
  type PlaceCategory,
  type PlaceCreateInput,
  type PlacePersonalFit,
  useRelationsStore,
} from '@/store/useRelationsStore';

const CATEGORIES: { id: PlaceCategory; label: string }[] = [
  { id: 'restaurant', label: 'Restaurant' },
  { id: 'cafe', label: 'Café' },
  { id: 'bar', label: 'Bar' },
  { id: 'spot', label: 'Coin' },
  { id: 'other', label: 'Autre' },
];

export default function AddPlaceScreen() {
  const { addPlace } = useRelationsStore();
  const { sourceRelationId: sourceRelationIdRaw } = useLocalSearchParams<{ sourceRelationId?: string }>();
  const sourceRelationIdParam =
    typeof sourceRelationIdRaw === 'string' && sourceRelationIdRaw.trim().length > 0
      ? sourceRelationIdRaw.trim()
      : undefined;

  const [name, setName] = useState('');
  const [category, setCategory] = useState<PlaceCategory>('other');
  const [identityHint, setIdentityHint] = useState('');
  const [personalFit, setPersonalFit] = useState<PlaceCreateInput['personalFit']>('saved');
  const [impression, setImpression] = useState('');
  const [noteVisible, setNoteVisible] = useState(false);
  const [quickSignal, setQuickSignal] = useState<PlaceQuickSignal>({});
  const [quickSignalVisible, setQuickSignalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = useMemo(() => name.trim().length > 0, [name]);

  const handlePersonalFitChange = (fit: PlacePersonalFit) => {
    setPersonalFit(fit);
    if (fit === 'kept') {
      setQuickSignalVisible(true);
    }
  };

  const handleSave = () => {
    const cleanName = name.trim();
    if (!cleanName) {
      setError('Le nom du lieu est requis.');
      return;
    }

    const created = addPlace({
      name: cleanName,
      category,
      personalFit,
      impression,
      sourceRelationId: sourceRelationIdParam,
      quickSignal,
      identityHint,
    });
    if (!created) {
      setError('Impossible d’enregistrer ce lieu pour l’instant.');
      return;
    }

    if (sourceRelationIdParam) {
      router.back();
    } else {
      router.replace('../place');
    }
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      onScrollBeginDrag={Keyboard.dismiss}
    >
      <View style={styles.header}>
        <Text style={styles.kicker}>Lieux</Text>
        <Text style={styles.title}>Enregistrer un lieu</Text>
        <Text style={styles.subtitle}>
          Garde une trace simple et honnête des lieux qui méritent qu’on s’en souvienne.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Nom du lieu</Text>
        <TextInput
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (error) setError(null);
          }}
          placeholder="Ex : Atelier Céline"
          placeholderTextColor={colors.text.muted}
          style={styles.input}
        />

        <Text style={styles.label}>Catégorie</Text>
        <View style={styles.rowWrap}>
          {CATEGORIES.map((item) => {
            const active = item.id === category;
            return (
              <Pressable
                key={item.id}
                onPress={() => setCategory(item.id)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Adresse ou lien (facultatif)</Text>
        <TextInput
          value={identityHint}
          onChangeText={setIdentityHint}
          placeholder="Lien de carte, site web ou adresse"
          placeholderTextColor={colors.text.muted}
          style={styles.input}
        />
        <Text style={styles.identityHintHint}>Uniquement pour le reconnaître plus tard.</Text>

        {/* "Save for later" is personal memory, not experience evidence.
            The verdict (would go back / depends / not for me) lives in the
            Quick Read, not as an entry-level chip — see PlaceQuickSignalSheet. */}
        <Text style={styles.label}>Tu y es allé·e ?</Text>
        <View style={styles.rowWrap}>
          {PLACE_PERSONAL_FIT_CAPTURE_OPTIONS.map((item) => {
            const active = item.id === personalFit;
            return (
              <Pressable
                key={item.id}
                onPress={() => handlePersonalFitChange(item.id)}
                style={[styles.fitChip, active && styles.fitChipActive]}
              >
                <Text style={[styles.fitText, active && styles.fitTextActive]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => handlePersonalFitChange(PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION.id)}
          style={styles.saveForLaterLink}
        >
          <Text
            style={[
              styles.saveForLaterLinkText,
              personalFit === PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION.id &&
                styles.saveForLaterLinkTextActive,
            ]}
          >
            {personalFit === PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION.id ? '✓ ' : ''}
            {PLACE_PERSONAL_FIT_SAVE_FOR_LATER_OPTION.label}
          </Text>
        </Pressable>

        {noteVisible ? (
          <>
            <Text style={styles.label}>Courte impression (facultatif)</Text>
            <TextInput
              value={impression}
              onChangeText={setImpression}
              placeholder="Une ligne discrète pour t’en souvenir."
              placeholderTextColor={colors.text.muted}
              style={[styles.input, styles.inputArea]}
              multiline
              maxLength={120}
            />
          </>
        ) : (
          <Pressable onPress={() => setNoteVisible(true)} style={styles.addNoteLink}>
            <Text style={styles.addNoteLinkText}>Ajouter une note</Text>
          </Pressable>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={handleSave}
          disabled={!isValid}
          style={[styles.saveButton, !isValid && styles.saveButtonDisabled]}
        >
          <Text style={styles.saveButtonText}>Enregistrer le lieu</Text>
        </Pressable>
      </View>

      <PlaceQuickSignalSheet
        visible={quickSignalVisible}
        value={quickSignal}
        onChange={setQuickSignal}
        onDismiss={() => setQuickSignalVisible(false)}
        category={category}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
  },
  kicker: {
    color: colors.text.muted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    color: colors.text.primary,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.text.muted,
    lineHeight: 20,
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.lg,
    gap: spacing.md,
  },
  label: {
    color: colors.text.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border.soft,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text.primary,
    backgroundColor: colors.background.tertiary,
  },
  inputArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  identityHintHint: {
    color: colors.text.muted,
    fontSize: 11,
    marginTop: -spacing.xs,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  chipActive: {
    borderColor: colors.accent.warmGold,
    backgroundColor: colors.background.secondary,
  },
  chipText: {
    color: colors.text.muted,
    fontWeight: '600',
  },
  chipTextActive: {
    color: colors.text.primary,
  },
  fitChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
  },
  fitChipActive: {
    borderColor: colors.accent.mutedSage,
    backgroundColor: colors.background.secondary,
  },
  fitText: {
    color: colors.text.muted,
    fontWeight: '600',
  },
  fitTextActive: {
    color: colors.text.primary,
  },
  saveForLaterLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  saveForLaterLinkText: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  saveForLaterLinkTextActive: {
    color: colors.accent.mutedSage,
  },
  addNoteLink: {
    alignSelf: 'flex-start',
    paddingVertical: spacing.xs,
  },
  addNoteLinkText: {
    color: colors.text.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  error: {
    color: '#A34A3B',
    fontSize: 13,
  },
  saveButton: {
    marginTop: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.accent.deepTeal,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
