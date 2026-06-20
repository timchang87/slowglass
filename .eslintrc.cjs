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
  ignorePatterns: ['.eslintrc.cjs', '.tf', '**/coverage/**'],
  overrides: [
    {
      files: ['*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    {
      files: ['client/**/*.{ts,tsx}'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './client/tsconfig.json',
        tsconfigRootDir: __dirname,
      },
    },
    {
      files: ['services/**/*.ts'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        project: './services/core/tsconfig.json',
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
  settings: {
    'import/resolver': {
      typescript: {
        project: [
          './tsconfig.json',
          './client/tsconfig.json',
          './services/core/tsconfig.json',
          './infra/tsconfig.json',
        ],
      },
    },
  },
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
