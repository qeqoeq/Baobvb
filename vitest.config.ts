import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: { __DEV__: 'false' },
  test: {
    include: ['lib/**/*.test.ts', 'store/**/*.test.ts'],
    environment: 'node',
  },
});
