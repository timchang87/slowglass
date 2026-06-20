// vitest.config.ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: { label: 'Infra Tests', color: 'yellow' },
    globals: true,
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html'],
    },
  },
});
