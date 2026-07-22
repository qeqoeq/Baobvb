import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '../../lib/supabase';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { deriveAvatarSeed, normalizeHandleInput } from '../../lib/identity-format';
import { upsertUserHandle } from '../../lib/public-profile';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function EditMyCardScreen() {
  const params = useLocalSearchParams<{
    fromInvite?: string;
    invitedRelationId?: string;
    setup?: string;
  }>();
  const isSetupMode = params.setup === '1';
  const { me, updateMe, updatePhotoUri } = useRelationsStore();
  // D2 (B15): the handle is frozen once the profile is set up. Robust form —
  // depends on the actual profile state, not on how this screen was opened.
  const handleLocked = Boolean(me.isProfileSetup) && !!me.handle;
  const [displayName, setDisplayName] = useState(me.displayName);
  const [handle, setHandle] = useState(me.handle);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(me.photoUri ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const handleInputRef = useRef<TextInput>(null);

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Accès aux photos requis', 'Autorise l’accès aux photos dans les Réglages pour ajouter une photo de profil.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: 'images',
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]?.uri) {
      const uri = result.assets[0].uri;
      setLocalPhotoUri(uri);
      updatePhotoUri(uri);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;

    const cleanDisplayName = displayName.trim();
    // D2 (B15): when the handle is frozen, ALWAYS use the existing me.handle —
    // never a field value. Post-setup this screen only edits displayName; the
    // handle is re-published unchanged, which keeps reconcileHandleOwnership
    // (bootstrap) working since it too re-publishes the existing handle.
    const cleanHandle = handleLocked ? me.handle : normalizeHandleInput(handle);
    const cleanAvatarSeed = deriveAvatarSeed(cleanDisplayName);

    if (!cleanDisplayName) {
      setError('Le nom ne peut pas être vide.');
      return;
    }
    if (!cleanHandle) {
      setError('Identifiant invalide. Utilise des lettres, chiffres, points, tirets ou underscores.');
      return;
    }

    // Sync handle to the backend registry on every save.
    // upsert_user_handle is idempotent — unchanged handles are a no-op on the backend.
    // At setup this claims the new handle; post-setup it re-publishes the frozen
    // handle together with the (possibly changed) display name.
    setIsSaving(true);
    setError(null);
    try {
      const result = await upsertUserHandle(cleanHandle, cleanDisplayName);
      if (result.taken) {
        setError('Cet identifiant est déjà pris. Choisis-en un autre.');
        setIsSaving(false);
        return;
      }
    } catch {
      setError('Impossible de réserver cet identifiant. Réessaie.');
      setIsSaving(false);
      return;
    }

    const ok = updateMe({
      displayName: cleanDisplayName,
      handle: cleanHandle,
      avatarSeed: cleanAvatarSeed,
    });
    if (!ok) {
      setError('Impossible d’enregistrer ta carte. Vérifie tes champs.');
      setIsSaving(false);
      return;
    }

    if (params.fromInvite === '1' && params.invitedRelationId) {
      router.replace({
        pathname: '/invite/[relationId]',
        params: { relationId: params.invitedRelationId },
      });
      return;
    }

    if (isSetupMode) {
      router.replace('/(tabs)');
      return;
    }

    router.back();
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.card}>
        <Text style={styles.title}>
          {isSetupMode ? 'Crée ta carte' : 'Modifie ta carte'}
        </Text>
        <Text style={styles.subtitle}>
          {isSetupMode
            ? 'Choisis un nom et un identifiant pour ta carte.'
            : 'Affiché sur ta carte et ton QR.'}
        </Text>

        <Pressable style={styles.previewAvatar} onPress={() => void handlePickPhoto()}>
          {localPhotoUri ? (
            <Image source={{ uri: localPhotoUri }} style={styles.previewAvatarImage} contentFit="cover" />
          ) : (
            <Text style={styles.previewAvatarText}>
              {deriveAvatarSeed(displayName)}
            </Text>
          )}
        </Pressable>
        <Pressable onPress={() => void handlePickPhoto()} style={styles.photoBtn}>
          <Text style={styles.photoBtnText}>
            {localPhotoUri ? 'Changer la photo' : 'Ajouter une photo'}
          </Text>
        </Pressable>
        <Text style={styles.photoPrivacyNote}>{'Visible par toi uniquement'}</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{'Nom'}</Text>
          <TextInput
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (error) setError(null);
            }}
            placeholder="Ton nom"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            returnKeyType="next"
            onSubmitEditing={() => handleInputRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{'Identifiant'}</Text>
          {handleLocked ? (
            <View style={[styles.input, styles.inputSecondary, styles.inputReadOnly]}>
              <Text style={styles.inputReadOnlyText}>
                {me.handle}{me.identitySuffix ? `·${me.identitySuffix}` : ''}
              </Text>
            </View>
          ) : (
            <TextInput
              ref={handleInputRef}
              value={handle}
              onChangeText={(value) => {
                setHandle(value);
                if (error) setError(null);
              }}
              placeholder="@ton.identifiant"
              placeholderTextColor={colors.text.muted}
              style={[styles.input, styles.inputSecondary]}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
            />
          )}
          {handleLocked ? (
            <Text style={styles.helperText}>Ton identifiant est fixé et ne peut plus être changé.</Text>
          ) : null}
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={() => void handleSave()}
          disabled={isSaving}
          style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving ? 'Enregistrement…' : isSetupMode ? 'Commencer' : 'Enregistrer ma carte'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => {
            if (isSetupMode) {
              void supabase.auth.signOut();
            } else {
              router.back();
            }
          }}
          style={styles.secondaryButton}
        >
          <Text style={styles.secondaryButtonText}>
            {isSetupMode ? 'Retour à la connexion' : 'Annuler'}
          </Text>
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
  previewAvatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.accent.softAmber + '66',
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  previewAvatarText: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  previewAvatarImage: {
    width: 64,
    height: 64,
  },
  photoBtn: {
    alignSelf: 'center',
    marginTop: -spacing.xs,
    paddingVertical: 4,
  },
  photoBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accent.warmGold,
  },
  photoPrivacyNote: {
    alignSelf: 'center',
    marginTop: 2,
    fontSize: 11,
    color: colors.text.muted,
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
  inputReadOnly: {
    justifyContent: 'center',
    backgroundColor: colors.background.secondary,
  },
  inputReadOnlyText: {
    color: colors.text.secondary,
    fontSize: 14,
  },
  helperText: {
    marginTop: spacing.xs,
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.muted,
  },
  errorText: {
    fontSize: 12,
    color: colors.semantic.alert,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
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
