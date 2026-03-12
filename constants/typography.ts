export const typography = {
  heading: {
    h1: {
      fontSize: 32,
      lineHeight: 40,
      fontWeight: '700',
    },
    h2: {
      fontSize: 24,
      lineHeight: 32,
      fontWeight: '700',
    },
    h3: {
      fontSize: 20,
      lineHeight: 28,
      fontWeight: '600',
    },
  },

  body: {
    large: {
      fontSize: 17,
      lineHeight: 26,
      fontWeight: '400',
    },
    regular: {
      fontSize: 15,
      lineHeight: 24,
      fontWeight: '400',
    },
    small: {
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '400',
    },
  },

  label: {
    regular: {
      fontSize: 13,
      lineHeight: 18,
      letterSpacing: 0.5,
      fontWeight: '600',
    },
  },
} as const;

export type BaobabTypography = typeof typography;
