import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./src/__tests__/setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'dictionaries/**', '.workflows/**', '.claude/**', '.claire/**', '.direnv/**'],
  },
});
