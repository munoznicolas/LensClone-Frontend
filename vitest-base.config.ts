import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    setupFiles: ['./src/test-setup.ts'],
  },
});
