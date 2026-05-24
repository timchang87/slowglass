const path = require('path');

module.exports = {
  env: { es2022: true },
  extends: ['airbnb-typescript/base', '../../.eslintrc.cjs'],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'infra/**'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  settings: {
    'import/resolver': {
      node: {
        paths: ['../node_modules', 'node_modules'],
        moduleDirectory: ['node_modules', '../node_modules'],
      },
      typescript: {
        project: './tsconfig.json',
      },
    },
  },
  rules: {
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: [
          '**/*.test.ts',
          '**/*.spec.ts',
          '**/__tests__/**/*.ts',
          '**/vitest.config.ts',
          '**/vitest.setup.ts',
          '**/drizzle.config.ts',
        ],
        optionalDependencies: false,
        peerDependencies: false,
        packageDir: [__dirname, path.resolve(__dirname, '../'), path.resolve(__dirname, 'infra')],
      },
    ],
  },
};
