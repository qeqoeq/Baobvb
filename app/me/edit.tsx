import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
  const [displayName, setDisplayName] = useState(me.displayName);
  const [handle, setHandle] = useState(me.handle);
  const [localPhotoUri, setLocalPhotoUri] = useState<string | null>(me.photoUri ?? null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const handleInputRef = useRef<TextInput>(null);

  const handlePickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Photos needed', 'Allow photo access in Settings to set a profile photo.');
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
    const cleanHandle = normalizeHandleInput(handle);
    const cleanAvatarSeed = deriveAvatarSeed(cleanDisplayName);

    if (!cleanDisplayName) {
      setError('Display name cannot be empty.');
      return;
    }
    if (!cleanHandle) {
      setError('Handle is invalid. Use letters, numbers, dots, dashes or underscores.');
      return;
    }

    // Sync handle to the backend registry on every save.
    // upsert_user_handle is idempotent — unchanged handles are a no-op on the backend.
    // Calling unconditionally ensures new handles are claimed, changed handles are
    // re-claimed, and existing users are lazily migrated on their next edit.
    setIsSaving(true);
    setError(null);
    try {
      const result = await upsertUserHandle(cleanHandle);
      if (result.taken) {
        setError('This handle is already taken. Choose another.');
        setIsSaving(false);
        return;
      }
    } catch {
      setError('Could not secure this handle. Try again.');
      setIsSaving(false);
      return;
    }

    const ok = updateMe({
      displayName: cleanDisplayName,
      handle: cleanHandle,
      avatarSeed: cleanAvatarSeed,
    });
    if (!ok) {
      setError('Could not save your card. Please check your fields.');
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
        showsVerticalScrollIndicator={false}
      >
      <View style={styles.card}>
        <Text style={styles.title}>
          {isSetupMode ? 'Create your card' : 'Edit your card'}
        </Text>
        <Text style={styles.subtitle}>
          {isSetupMode
            ? 'Pick a name and username for your card.'
            : 'Shown on your card and QR.'}
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
            {localPhotoUri ? 'Change photo' : 'Add photo'}
          </Text>
        </Pressable>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{'Name'}</Text>
          <TextInput
            value={displayName}
            onChangeText={(value) => {
              setDisplayName(value);
              if (error) setError(null);
            }}
            placeholder="Your name"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            returnKeyType="next"
            onSubmitEditing={() => handleInputRef.current?.focus()}
            blurOnSubmit={false}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.fieldLabel}>{'Username'}</Text>
          <TextInput
            ref={handleInputRef}
            value={handle}
            onChangeText={(value) => {
              setHandle(value);
              if (error) setError(null);
            }}
            placeholder="@your.handle"
            placeholderTextColor={colors.text.muted}
            style={[styles.input, styles.inputSecondary]}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => void handleSave()}
          />
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable
          onPress={() => void handleSave()}
          disabled={isSaving}
          style={[styles.primaryButton, isSaving && styles.primaryButtonDisabled]}
        >
          <Text style={styles.primaryButtonText}>
            {isSaving ? 'Saving…' : isSetupMode ? 'Start' : 'Save my card'}
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
            {isSetupMode ? 'Back to sign-in' : 'Cancel'}
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
