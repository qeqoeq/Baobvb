import { CameraView, type BarcodeScanningResult, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { parsePersonCardPayload } from '../../lib/person-card';

export default function ScanCardScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasScanned, setHasScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetScan = useCallback(() => {
    setHasScanned(false);
    setError(null);
  }, []);

  const onScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (hasScanned) return;
      setHasScanned(true);

      const payload = parsePersonCardPayload(result.data);
      if (!payload) {
        setError('This code is not a valid Baobab person card.');
        return;
      }

      router.replace({
        pathname: '../relation/add',
        params: {
          prefillName: payload.displayName,
          prefillHandle: payload.handle,
          prefillAvatarSeed: payload.avatarSeed,
          scannedMeId: payload.meId,
          fromScan: '1',
        },
      });
    },
    [hasScanned],
  );

  if (!permission) {
    return <View style={styles.screen} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.screen}>
        <View style={styles.card}>
          <Text style={styles.title}>Camera access needed</Text>
          <Text style={styles.text}>
            Baobab needs camera permission to scan person cards.
          </Text>
          <Pressable onPress={requestPermission} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Allow camera</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.cameraWrap}>
        <CameraView
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={onScan}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.overlayText}>Align a Baobab QR card</Text>
        </View>
      </View>

      {error ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable onPress={resetScan} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable onPress={() => router.back()} style={styles.secondaryButton}>
          <Text style={styles.secondaryButtonText}>Close</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    gap: spacing.md,
  },
  cameraWrap: {
    flex: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border.strong,
    backgroundColor: colors.background.secondary,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    backgroundColor: '#00000033',
  },
  scanFrame: {
    width: 230,
    height: 230,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.accent.softAmber,
    backgroundColor: '#00000010',
  },
  overlayText: {
    fontSize: 13,
    color: colors.text.primary,
    fontWeight: '600',
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
    fontSize: 20,
    fontWeight: '700',
    color: colors.text.primary,
  },
  text: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  errorCard: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.semantic.alert + '55',
    padding: spacing.md,
    gap: spacing.sm,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  primaryButton: {
    backgroundColor: colors.accent.deepTeal,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text.primary,
  },
  secondaryButton: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text.secondary,
  },
});
