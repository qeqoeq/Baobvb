import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { colors } from '../../constants/colors';
import { radius, spacing } from '../../constants/spacing';
import { supabase } from '../../lib/supabase';
import { useRelationsStore } from '../../store/useRelationsStore';

export default function SettingsScreen() {
  const { me, updateShowBaobabCode } = useRelationsStore();

  const handleSignOut = () => {
    Alert.alert(
      'Se déconnecter',
      'Tu devras te reconnecter pour accéder à Baobab.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Se déconnecter',
          style: 'destructive',
          onPress: () => {
            void supabase.auth.signOut().catch(() => {
              // Auth state listener in _layout.tsx handles the redirect.
            });
          },
        },
      ],
    );
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>

      {/* ── Privacy ──────────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{'Confidentialité'}</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleLabelBlock}>
              <Text style={styles.toggleLabel}>{'Afficher le code Baobab'}</Text>
              <Text style={styles.toggleCaption}>{'Apparaît sur ton profil et ta carte QR.'}</Text>
            </View>
            <Switch
              value={me.showBaobabCode}
              onValueChange={updateShowBaobabCode}
              trackColor={{ false: colors.border.strong, true: colors.accent.deepTeal }}
              thumbColor={colors.text.primary}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.descriptionRow}>
            <Text style={styles.descriptionText}>
              {'Ton réseau est privé par défaut. Aucune donnée de connexion ne quitte cet appareil sans une action explicite de ta part.'}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Security ─────────────────────────────────────────────────────────── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>{'Sécurité'}</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Text style={styles.infoKey}>{'Authentification'}</Text>
            <Text style={styles.infoValue}>{'Connexion Apple'}</Text>
          </View>
        </View>
      </View>

      {/* ── Sign out ─────────────────────────────────────────────────────────── */}
      <View style={styles.card}>
        <Pressable style={styles.signOutRow} onPress={handleSignOut}>
          <Text style={styles.signOutLabel}>{'Se déconnecter'}</Text>
        </Pressable>
      </View>

    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background.primary,
  },
  content: {
    padding: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg * 2,
    gap: spacing.lg,
  },

  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.text.muted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    paddingHorizontal: spacing.xs,
    paddingBottom: spacing.xs,
  },

  card: {
    backgroundColor: colors.background.secondary,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border.soft,
    overflow: 'hidden',
  },

  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
  },
  infoKey: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: colors.text.secondary,
    fontWeight: '400',
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border.soft,
    marginLeft: spacing.lg,
  },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  toggleLabelBlock: {
    flex: 1,
    gap: 2,
    marginRight: spacing.md,
  },
  toggleLabel: {
    fontSize: 15,
    color: colors.text.primary,
    fontWeight: '500',
  },
  toggleCaption: {
    fontSize: 12,
    color: colors.text.muted,
    lineHeight: 16,
  },
  descriptionRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  descriptionText: {
    fontSize: 13,
    lineHeight: 20,
    color: colors.text.secondary,
  },
  signOutRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    alignItems: 'center',
  },
  signOutLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.semantic.alert,
  },
});
