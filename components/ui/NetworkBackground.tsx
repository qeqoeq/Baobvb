// B46 — reactive full-screen background for the Liens screen.
// It knows ONE thing: `temperature` (0..1) from computeNetworkTemperature.
// It never reads relations, axes, or reading detail.
//
// Render: a very subtle VERTICAL SVG linear gradient — the computed hue at the
// top, an 8%-darker version at the bottom. No halo, no glow, no radial gradient.
// The whole scale stays calm (prune ↔ muted grey-violet); no red/orange/alert
// anywhere by construction (the two endpoints below are the only colours used).
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const ALIVE = '#2A1A2E';   // t = 1 — warm prune (living network)
const DORMANT = '#1B1A22'; // t = 0 — muted grey-violet (dormant network)
const BOTTOM_DARKEN = 0.08;
const TRANSITION_MS = 1200;

export default function NetworkBackground({ temperature }: { temperature: number }) {
  const { width, height } = useWindowDimensions();
  const [t, setT] = useState(temperature);
  const anim = useRef(new Animated.Value(temperature)).current;
  const mounted = useRef(false);
  const valueRef = useRef(temperature);
  const targetRef = useRef(temperature);
  const runningRef = useRef<Animated.CompositeAnimation | null>(null);

  // Mirror the animated value into state so the SVG stops recolor in RGB space.
  useEffect(() => {
    const id = anim.addListener(({ value }) => {
      valueRef.current = value;
      setT(value);
    });
    return () => anim.removeListener(id);
  }, [anim]);

  // Slide toward the new temperature over ~1.2s. No animation on first render.
  useEffect(() => {
    targetRef.current = temperature;
    if (!mounted.current) {
      mounted.current = true;
      anim.setValue(temperature);
      valueRef.current = temperature;
      setT(temperature);
      return;
    }
    // B51: never animate while backgrounded — snap silently (not visible), so no
    // Fabric commits run off-'active' and nothing is left mid-transition.
    if (AppState.currentState !== 'active') {
      anim.setValue(temperature);
      valueRef.current = temperature;
      setT(temperature);
      return;
    }
    const a = Animated.timing(anim, {
      toValue: temperature,
      duration: TRANSITION_MS,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    });
    runningRef.current = a;
    a.start();
    return () => a.stop();
  }, [temperature, anim]);

  // B51: stop the running transition when not foregrounded; on return, resume
  // from the current (frozen) value toward the latest target — no jump.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        runningRef.current?.stop();
        return;
      }
      if (valueRef.current !== targetRef.current) {
        const a = Animated.timing(anim, {
          toValue: targetRef.current,
          duration: TRANSITION_MS,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        });
        runningRef.current = a;
        a.start();
      }
    });
    return () => sub.remove();
  }, [anim]);

  const top = lerpHex(DORMANT, ALIVE, t);
  const bottom = darken(top, BOTTOM_DARKEN);

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="networkBg" x1="0%" y1="0%" x2="0%" y2="100%">
          <Stop offset="0%" stopColor={top} />
          <Stop offset="100%" stopColor={bottom} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#networkBg)" />
    </Svg>
  );
}

// ── Linear RGB interpolation helpers ─────────────────────────────────────────
function lerpHex(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return rgbToHex(
    ca.r + (cb.r - ca.r) * k,
    ca.g + (cb.g - ca.g) * k,
    ca.b + (cb.b - ca.b) * k,
  );
}

function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
