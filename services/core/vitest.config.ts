import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: { label: 'Core Tests', color: 'blue' },
    environment: 'node',
    setupFiles: ['./vitest-setup.ts'],
  },
});
