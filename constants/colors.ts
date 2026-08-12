export const colors = {
    background: {
      primary: '#141210',    // B43: warm brown-black (was cold #111313)
      secondary: '#1C1917',  // B43: card surface (was #171A18)
      tertiary: '#24201D',   // B43: warm elevated step (was #1D211D)
    },

    accent: {
      warmGold: '#D8A85F',   // kept (already warm)
      softAmber: '#E8B87A',  // kept
      deepTeal: '#C4623C',   // B43: terracotta primary accent (was teal #38C8B5); key name kept to avoid restructuring 42 call sites
      leafGreen: '#7D9070',  // B43: sage (positive / Santé « Solide »), was #8FBC72
      mutedSage: '#7A9E7E',  // kept (sage green)
      dustyRose: '#B07282',
      softCoral: '#E98F6F',
    },

    text: {
      primary: '#F2EDE6',    // B43: warm white (was #F4F1EA / never pure #FFFFFF)
      secondary: '#9A9088',  // B43: warm grey (was #B8B3A8)
      muted: '#7E7A72',      // kept (warm grey)
    },

    semantic: {
      growth: '#7D9070',     // B43: sage positive (was #7A9E7E)
      caution: '#D4A054',
      alert: '#C46B5C',
      trust: '#C4623C',      // B43: de-tealed to terracotta (was #38C8B5) — see report: now in the same family as `alert`
    },

    border: {
      soft: '#2E2926',       // B43: warm border (was #252C25)
      strong: '#3A342F',     // B43: warm step (was #303830)
    },
  } as const;

  export type BaobabColors = typeof colors;
