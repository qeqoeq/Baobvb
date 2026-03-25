import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { isLocalDraftId } from '../../lib/identity';
import {
  lookupPublicProfile,
  type PublicProfileLookupState,
} from '../../lib/lookup-public-profile';
import { useRelationsStore } from '../../store/useRelationsStore';

function normalizeHandle(raw: string) {
  const noSpaces = raw.trim().toLowerCase().replace(/\s+/g, '');
  const noAt = noSpaces.replace(/^@+/, '');
  const safe = noAt.replace(/[^a-z0-9._-]/g, '');
  return safe ? `@${safe}` : '';
}

function sanitizeRelationName(raw: string) {
  return raw.trim().replace(/\s+/g, ' ');
}

function isValidRelationName(name: string) {
  const allowedCharsPattern = /^[\p{L}\p{M}\s'’-]+$/u;
  if (!allowedCharsPattern.test(name)) return false;

  const usefulCharCount = (name.match(/[\p{L}\p{M}]/gu) ?? []).length;
  return usefulCharCount >= 2;
}

export default function AddRelationScreen() {
  const params = useLocalSearchParams<{
    prefillName?: string;
    prefillHandle?: string;
    prefillAvatarSeed?: string;
    scannedMeId?: string;
    scannedPublicProfileId?: string;
    fromScan?: string;
    // Claim path: set when navigated from a cold invite claim.
    fromClaim?: string;
    canonicalRelationId?: string;
    claimedSide?: string;
  }>();
  const { me, relations, addRelation } = useRelationsStore();
  const [name, setName] = useState(params.prefillName ?? '');
  const [handle, setHandle] = useState(params.prefillHandle ?? '');
  const [scanLookup, setScanLookup] = useState<PublicProfileLookupState>({ status: 'idle' });

  // For v2 scans only: verify the publicProfileId exists in Baobab backend.
  // Runs in background — does not block navigation or relation creation.
  // v1 scans have no scannedPublicProfileId and stay idle.
  useEffect(() => {
    const publicProfileId = params.scannedPublicProfileId?.trim();
    if (!publicProfileId) return;
    let cancelled = false;
    setScanLookup({ status: 'pending', publicProfileId });
    void lookupPublicProfile(publicProfileId).then((result) => {
      if (!cancelled) setScanLookup(result);
    });
    return () => {
      cancelled = true;
    };
  }, [params.scannedPublicProfileId]);

  const canSubmit = sanitizeRelationName(name).length > 0;
  const fromScan = params.fromScan === '1';
  const _fromClaimFlag = params.fromClaim === '1';
  const _claimedCanonicalRelationId = params.canonicalRelationId?.trim() || undefined;
  const _claimedSide = params.claimedSide?.trim();

  // Strict guard: claim path is only active when all four conditions hold.
  // Any tampered or stale param falls through to the normal add flow.
  const claimedSide: 'sideA' | 'sideB' | undefined =
    _claimedSide === 'sideA' || _claimedSide === 'sideB' ? _claimedSide : undefined;
  const claimedCanonicalRelationId =
    _claimedCanonicalRelationId && !isLocalDraftId(_claimedCanonicalRelationId)
      ? _claimedCanonicalRelationId
      : undefined;
  const isValidClaimPath =
    _fromClaimFlag &&
    !!claimedCanonicalRelationId &&
    (claimedSide === 'sideA' || claimedSide === 'sideB');
  const fromClaim = isValidClaimPath;

  const handleCreate = () => {
    if (!canSubmit) return;

    const isOwnCard =
      (params.scannedMeId && params.scannedMeId === me.id) ||
      Boolean(
        params.scannedPublicProfileId &&
          me.publicProfileId &&
          params.scannedPublicProfileId === me.publicProfileId,
      );
    if (isOwnCard) {
      Alert.alert('This is your own card', 'Scan another person to add a new relationship.');
      return;
    }

    const cleanName = sanitizeRelationName(name);
    setName(cleanName);
    if (!isValidRelationName(cleanName)) {
      Alert.alert(
        'Invalid name',
        'Use a real name with letters. Allowed: letters, spaces, apostrophes, and hyphens.',
      );
      return;
    }

    // Claim path: create a minimal shared-materialized relation and navigate to evaluate.
    if (fromClaim) {
      const existingByClaim = claimedCanonicalRelationId
        ? relations.find((r) => r.canonicalRelationId === claimedCanonicalRelationId)
        : null;
      if (existingByClaim) {
        // Already materialized (duplicate tap or race). Navigate directly.
        router.replace({ pathname: '/relation/[id]', params: { id: existingByClaim.id } });
        return;
      }
      const created = addRelation(cleanName, {
        source: 'claim',
        avatarSeed: cleanName.charAt(0).toUpperCase(),
        canonicalRelationId: claimedCanonicalRelationId,
      });
      if (!created) return;
      router.replace({
        pathname: '/relation/evaluate/[id]',
        params: { id: created.id, side: claimedSide ?? 'sideB' },
      });
      return;
    }

    const normalizedScannedHandle = normalizeHandle(params.prefillHandle ?? '');
    const normalizedInputHandle = normalizeHandle(handle);
    const normalizedHandle = fromScan
      ? normalizedScannedHandle || normalizedInputHandle
      : normalizedInputHandle;
    const scannedCardMeId = params.scannedMeId?.trim() || '';
    const scannedPublicProfileId = params.scannedPublicProfileId?.trim() || undefined;
    const scannedAvatarSeed = params.prefillAvatarSeed?.trim().toUpperCase().slice(0, 2);

    const existingByCardMeId = scannedCardMeId
      ? relations.find(
          (relation) =>
            relation.source === 'scan' &&
            relation.sourceCardMeId &&
            relation.sourceCardMeId === scannedCardMeId,
        )
      : null;
    if (existingByCardMeId) {
      Alert.alert('Person already exists', `${existingByCardMeId.name} is already in your Garden.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open relationship', onPress: () => router.replace(`/relation/${existingByCardMeId.id}`) },
      ]);
      return;
    }

    const existingByHandle = normalizedHandle
      ? relations.find(
          (relation) =>
            normalizeHandle(relation.handle ?? relation.sourceHandle ?? '') === normalizedHandle,
        )
      : null;
    if (existingByHandle) {
      Alert.alert('Likely duplicate', `${existingByHandle.name} already uses this scanned handle.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open relationship', onPress: () => router.replace(`/relation/${existingByHandle.id}`) },
      ]);
      return;
    }

    const existingByName = relations.find(
      (relation) => relation.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );
    if (existingByName) {
      Alert.alert('Private draft already exists', 'A private relationship with this name already exists. Names are not unique.', [
        { text: 'Open existing relationship', onPress: () => router.replace(`/relation/${existingByName.id}`) },
        {
          text: 'Create another private draft',
          onPress: () => {
            const createdFromName = addRelation(cleanName, fromScan
              ? {
                  source: 'scan',
                  handle: normalizedHandle || undefined,
                  avatarSeed: scannedAvatarSeed || cleanName.charAt(0).toUpperCase(),
                  sourceCardMeId: scannedCardMeId || undefined,
                  sourcePublicProfileId: scannedPublicProfileId,
                  sourceHandle: normalizedScannedHandle || undefined,
                }
              : {
                  source: 'manual',
                  handle: normalizedHandle || undefined,
                  avatarSeed: cleanName.charAt(0).toUpperCase(),
                });
            if (createdFromName) {
              router.replace({
                pathname: '/relation/[id]',
                params: { id: createdFromName.id, justCreated: '1' },
              });
            }
          },
        },
        { text: 'Cancel', style: 'cancel' },
      ]);
      return;
    }

    const created = addRelation(cleanName, fromScan
      ? {
          source: 'scan',
          handle: normalizedHandle || undefined,
          avatarSeed: scannedAvatarSeed || cleanName.charAt(0).toUpperCase(),
          sourceCardMeId: scannedCardMeId || undefined,
          sourcePublicProfileId: scannedPublicProfileId,
          sourceHandle: normalizedScannedHandle || undefined,
        }
      : {
          source: 'manual',
          handle: normalizedHandle || undefined,
          avatarSeed: cleanName.charAt(0).toUpperCase(),
        });
    if (!created) return;
    router.replace({
    pathname: '/relation/[id]',
    params: { id: created.id, justCreated: '1' },
    });
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.title}>
          {fromClaim ? 'Name this person' : fromScan ? 'Add a person' : 'Create a private link'}
        </Text>
        <Text style={styles.subtitle}>
          {fromClaim
            ? 'Your participation has been recorded. Give this person a name for your Garden — it stays private.'
            : 'Create a private draft relationship. A name is a local label, not a unique identity.'}
        </Text>
        {fromScan && (
          <View style={styles.scanHintCard}>
            <Text style={styles.scanHintTitle}>Scanned card detected</Text>
            <Text style={styles.scanHintText}>
              {params.prefillHandle ?? 'No handle on this card'}
              {params.prefillAvatarSeed ? ` · seed ${params.prefillAvatarSeed}` : ''}
            </Text>
            {scanLookup.status === 'found' && (
              <Text style={styles.scanHintVerified}>Baobab account confirmed</Text>
            )}
          </View>
        )}

        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Person name"
          placeholderTextColor={colors.text.muted}
          style={styles.input}
          autoFocus
        />
        {fromScan ? (
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="Handle (optional)"
            placeholderTextColor={colors.text.muted}
            style={styles.input}
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}

        <Pressable
          onPress={handleCreate}
          disabled={!canSubmit}
          style={[styles.button, !canSubmit && styles.buttonDisabled]}
        >
          <Text style={styles.buttonText}>
            {fromClaim ? 'Save and continue' : fromScan ? 'Add person' : 'Create private draft'}
          </Text>
        </Pressable>
        <Text style={styles.helperText}>
          {fromScan
            ? 'After saving, you will open this relationship directly.'
            : 'After saving, you will open this private relationship directly.'}
        </Text>

        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
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
  scanHintCard: {
    backgroundColor: colors.background.tertiary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    padding: spacing.sm + 2,
    gap: 2,
  },
  scanHintTitle: {
    fontSize: 12,
    color: colors.text.primary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  scanHintText: {
    fontSize: 12,
    color: colors.text.secondary,
  },
  scanHintVerified: {
    fontSize: 11,
    color: colors.accent.warmGold,
    fontWeight: '600',
    marginTop: 2,
  },
  button: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text.primary,
  },
  helperText: {
    marginTop: -spacing.xs,
    fontSize: 12,
    lineHeight: 18,
    color: colors.text.muted,
    textAlign: 'center',
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
