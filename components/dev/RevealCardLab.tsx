// [B44] TEMPORARY — reveal-card visual test bench. Throwaway. Remove by grepping [B44].
// A real, on-device prototype of the reveal card so its beauty can be judged with
// real type + real motion. Fake data (Sou, 90, Enraciné). Nothing here is final.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Fraunces_700Bold, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Sora_700Bold, Sora_600SemiBold } from '@expo-google-fonts/sora';
import { SpaceGrotesk_700Bold, SpaceGrotesk_500Medium } from '@expo-google-fonts/space-grotesk';

// ── Bench options (see B44 report) ───────────────────────────────────────────
const BGS = [
  { key: 'braise', label: 'Braise', color: '#B8442C' },
  { key: 'prune', label: 'Nuit prune', color: '#2B1A2E' },
  { key: 'vert', label: 'Vert profond', color: '#0E3A32' },
] as const;

const FONTS = [
  { key: 'Fraunces', label: 'Fraunces', number: 'Fraunces_700Bold', accent: 'Fraunces_600SemiBold' },
  { key: 'Sora', label: 'Sora', number: 'Sora_700Bold', accent: 'Sora_600SemiBold' },
  { key: 'Space Grotesk', label: 'Space Grotesk', number: 'SpaceGrotesk_700Bold', accent: 'SpaceGrotesk_500Medium' },
] as const;

const NUMBER_SIZES = [176, 236];

const CREAM = '#F2EDE6';
const INK = '#141210';

// Fake reveal payload — not wired to the store.
const DATA = { eyebrow: 'SOU ET TOI', score: '90', tier: 'Enraciné' };

export default function RevealCardLab({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [fontsLoaded] = useFonts({
    Fraunces_700Bold,
    Fraunces_600SemiBold,
    Sora_700Bold,
    Sora_600SemiBold,
    SpaceGrotesk_700Bold,
    SpaceGrotesk_500Medium,
  });

  const [bgIndex, setBgIndex] = useState(0);
  const [fontIndex, setFontIndex] = useState(0);
  const [sizeIndex, setSizeIndex] = useState(0);

  const bg = BGS[bgIndex];
  const font = FONTS[fontIndex];
  const numberSize = NUMBER_SIZES[sizeIndex];

  // Entrance: the card arrives, it doesn't just appear. Replays on font/size
  // change so the motion can be judged per option.
  const intro = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!fontsLoaded) return;
    intro.setValue(0);
    Animated.timing(intro, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [fontsLoaded, fontIndex, sizeIndex, intro]);

  const rise = intro.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  const numberScale = intro.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] });

  const onShare = useMemo(
    () => () => {
      void Share.share({ message: `${DATA.eyebrow} — ${DATA.score} · ${DATA.tier}` });
    },
    [],
  );

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: bg.color }]}>
        {/* Close */}
        <Pressable onPress={onClose} hitSlop={12} style={[styles.close, { top: insets.top + 8 }]}>
          <Text style={styles.closeText}>✕</Text>
        </Pressable>

        {/* Card — full frame, no card-in-card */}
        <Animated.View style={[styles.card, { opacity: intro, transform: [{ translateY: rise }] }]}>
          {fontsLoaded ? (
            <>
              <Text style={[styles.eyebrow, { fontFamily: font.accent }]}>{DATA.eyebrow}</Text>
              <Animated.Text
                style={[
                  styles.number,
                  { fontFamily: font.number, fontSize: numberSize, transform: [{ scale: numberScale }] },
                ]}
              >
                {DATA.score}
              </Animated.Text>
              <Text style={[styles.tier, { fontFamily: font.accent }]}>{DATA.tier}</Text>

              <Pressable onPress={onShare} style={styles.shareBtn}>
                <Text style={[styles.shareText, { fontFamily: font.accent }]}>Partager</Text>
              </Pressable>
              <Pressable onPress={onClose} hitSlop={8}>
                <Text style={styles.detailLink}>Voir le détail</Text>
              </Pressable>
            </>
          ) : (
            <Text style={styles.loading}>…</Text>
          )}
        </Animated.View>

        {/* Throwaway selector */}
        <View style={[styles.selector, { paddingBottom: insets.bottom + 10 }]}>
          <Row label="Fond" items={BGS.map((b) => b.label)} active={bgIndex} onPick={setBgIndex} />
          <Row label="Police" items={FONTS.map((f) => f.label)} active={fontIndex} onPick={setFontIndex} />
          <Row label="Taille" items={['S', 'L']} active={sizeIndex} onPick={setSizeIndex} />
        </View>
      </View>
    </Modal>
  );
}

function Row({
  label,
  items,
  active,
  onPick,
}: {
  label: string;
  items: readonly string[];
  active: number;
  onPick: (i: number) => void;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.pills}>
        {items.map((it, i) => (
          <Pressable key={it} onPress={() => onPick(i)} style={[styles.pill, i === active && styles.pillOn]}>
            <Text style={[styles.pillText, i === active && styles.pillTextOn]}>{it}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', right: 16, zIndex: 2, padding: 6 },
  closeText: { color: CREAM, fontSize: 20, opacity: 0.7 },
  card: { alignItems: 'center', paddingHorizontal: 28 },
  eyebrow: { color: CREAM, opacity: 0.72, fontSize: 13, letterSpacing: 3, marginBottom: 12 },
  number: { color: CREAM, includeFontPadding: false, lineHeight: undefined },
  tier: { color: CREAM, fontSize: 24, marginTop: 8, letterSpacing: 0.5 },
  shareBtn: {
    marginTop: 36,
    backgroundColor: CREAM,
    paddingHorizontal: 34,
    paddingVertical: 13,
    borderRadius: 999,
  },
  shareText: { color: INK, fontSize: 15, letterSpacing: 0.3 },
  detailLink: { color: CREAM, opacity: 0.6, fontSize: 13, marginTop: 18, textDecorationLine: 'underline' },
  loading: { color: CREAM, fontSize: 40, opacity: 0.5 },
  selector: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 12,
    paddingHorizontal: 14,
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { color: CREAM, opacity: 0.55, fontSize: 11, width: 52 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(242,237,230,0.4)',
  },
  pillOn: { backgroundColor: CREAM, borderColor: CREAM },
  pillText: { color: CREAM, opacity: 0.8, fontSize: 12 },
  pillTextOn: { color: INK, opacity: 1 },
});
