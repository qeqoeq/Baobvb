import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { buildPersonCardPayload, encodePersonCardPayload } from '../../lib/person-card';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function MyCardQrScreen() {
  const { me } = useRelationsStore();
  const payload = encodePersonCardPayload(buildPersonCardPayload(me));

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.avatarRing}>
          <View style={styles.avatarInner}>
            <Text style={styles.avatarText}>
              {(me.avatarSeed || me.displayName.charAt(0) || '?').toUpperCase()}
            </Text>
          </View>
        </View>
        <Text style={styles.name}>{me.displayName}</Text>
        <Text style={styles.handle}>{me.handle}</Text>

        <View style={styles.qrPlaceholder}>
          <View style={styles.qrSurface}>
            <QRCode value={payload} size={220} color="#111111" backgroundColor="#F7F1EA" />
          </View>
          <Text style={styles.qrSubtext}>
            Ask someone to scan this code with Baobab.
          </Text>
        </View>
        <Pressable onPress={() => router.push('../me/edit')} style={styles.editButton}>
          <Text style={styles.editButtonText}>Edit my card</Text>
        </Pressable>
      </View>

      <Pressable onPress={() => router.back()} style={styles.closeButton}>
        <Text style={styles.closeButtonText}>Done</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
    padding: spacing.lg,
    justifyContent: 'center',
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.strong,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: colors.accent.softAmber + '66',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInner: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.background.tertiary,
    borderWidth: 1,
    borderColor: colors.border.strong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: colors.text.primary,
    fontSize: 30,
    fontWeight: '700',
  },
  name: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text.primary,
  },
  handle: {
    fontSize: 14,
    color: colors.accent.warmGold,
    fontWeight: '600',
  },
  qrPlaceholder: {
    marginTop: spacing.md,
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border.soft,
    backgroundColor: colors.background.tertiary,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.xs,
  },
  qrSurface: {
    padding: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: '#F7F1EA',
  },
  qrSubtext: {
    fontSize: 12,
    color: colors.text.secondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  editButton: {
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
  },
  editButtonText: {
    fontSize: 12,
    color: colors.text.secondary,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  closeButton: {
    backgroundColor: colors.accent.warmGold,
    borderRadius: radius.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  closeButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.background.primary,
  },
});
