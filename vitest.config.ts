import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: [
      'packages/**/test/**/*.test.ts',
      'packages/ui-tokens/src/**/*.test.ts',
      'apps/**/src/**/*.test.ts',
    ],
    environment: 'node',
    testTimeout: 120_000,
  },
});
