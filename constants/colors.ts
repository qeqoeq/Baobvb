export const colors = {
    background: {
      primary: '#1A1220',    // B45 Nuit prune: very dark plum (was warm #141210)
      secondary: '#241A2A',  // B45: card surface
      tertiary: '#2E2235',   // B45: elevated surface
    },

    accent: {
      warmGold: '#D8A85F',   // kept — deep gold, harmonises with Nuit prune
      softAmber: '#E8B87A',  // kept — warm amber (= primary accent value)
      deepTeal: '#E8B87A',   // B45: PRIMARY accent = or chaud (key name kept to avoid restructuring ~42 call sites)
      leafGreen: '#8FAF97',  // B45: muted green (unlisted — harmonised to Nuit prune, = growth)
      mutedSage: '#8FAF97',  // B45: muted green (unlisted — harmonised)
      dustyRose: '#A88BA6',  // B45: SECONDARY accent = mauve poudré
      softCoral: '#E98F6F',  // kept — warm coral (unlisted — minor "nurture" status accent)
    },

    text: {
      primary: '#F2EBDF',    // B45
      secondary: '#A89BA6',  // B45
      muted: '#8B7F8A',      // B45
    },

    semantic: {
      growth: '#8FAF97',     // B45: muted green
      caution: '#D8A85F',    // B45: gold
      alert: '#A85A6B',      // B45: plum-red — never a bright red
      trust: '#E8B87A',      // B45: aligned to primary gold (unlisted — see report)
    },

    border: {
      soft: '#33263A',       // B45
      strong: '#40304A',     // B45
    },
  } as const;

  export type BaobabColors = typeof colors;
