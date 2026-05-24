module.exports = {
  root: true,
  env: {},
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
  ignorePatterns: ['.eslintrc.cjs', '.tf', 'services/core/infra/**'],
  overrides: [
    {
      files: ['client/**/*.{ts,tsx}', 'services/**/**/*.{ts,tsx}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: (filePath) => {
          if (filePath.includes('/client/')) return './client/tsconfig.json';
          if (filePath.includes('/services/core/'))
            return './services/core/tsconfig.json';
          return null;
        },
        tsconfigRootDir: __dirname,
      },
    },
    {
      files: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/__tests__/**/*.ts',
        '**/vitest.setup.ts',
        '**/vitest.config.ts',
      ],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    '@typescript-eslint/no-unnecessary-condition': 'error',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'require-await': 'off',
    '@typescript-eslint/require-await': 'error',
    'no-nested-ternary': 'error',
    'import/no-extraneous-dependencies': ['error', { devDependencies: true }],
    '@typescript-eslint/naming-convention': [
      'error',
      {
        format: ['camelCase', 'snake_case', 'UPPER_CASE', 'PascalCase'],
        leadingUnderscore: 'allowSingleOrDouble',
        selector: 'variable',
      },
    ],
  },
};
