import { defineConfig, ViteUserConfig } from 'vitest/config';

const rootConfig: ViteUserConfig = {
  test: {
    projects: ['services/core/vitest.config.ts', 'client/vite.config.ts'],
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html'],
    },
    watch: true,
    include: ['src/**/*.ts', 'src/**/*.tsx'],
    exclude: [
      'src/**/*.spec.ts',
      'src/**/*.test.ts',
      'src/**/*.d.ts',
      'src/**/*.stories.tsx',
      'src/**/*.stories.ts',
      'dist/**',
      'build/**',
      'node_modules/**',
      '**/infra/**',
    ],
  },
};

export default defineConfig(rootConfig);
