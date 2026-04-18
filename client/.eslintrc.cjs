const path = require('path');

module.exports = {
  env: { browser: true, es2022: true },
  extends: [
    'plugin:react-hooks/recommended',
    'airbnb-typescript',
    '../.eslintrc.cjs',
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'index.html'],
  plugins: ['react-refresh', 'react'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
  settings: {
    'import/resolver': {
      node: {
        paths: [
          path.resolve(__dirname, 'node_modules'),
          path.resolve(__dirname, '../node_modules'),
        ],
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
      typescript: {
        alwaysTryTypes: true,
        project: './tsconfig.json',
      },
    },
  },
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',

    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/consistent-type-definitions': ['error', 'type'],
    '@typescript-eslint/no-unnecessary-condition': 'error',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': 'error',
    'require-await': 'off',
    '@typescript-eslint/require-await': 'error',
    'no-nested-ternary': 'error',
    'import/no-extraneous-dependencies': [
      'error',
      {
        devDependencies: true,
        packageDir: [__dirname, path.resolve(__dirname, '../')], // Check both local and root package.json
      },
    ],
    '@typescript-eslint/naming-convention': [
      'error',
      {
        format: ['camelCase', 'snake_case', 'UPPER_CASE', 'PascalCase'],
        leadingUnderscore: 'allowSingleOrDouble',
        selector: 'variable',
      },
    ],
  },
  overrides: [
    {
      files: [
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
        '**/__tests__/**/*.{js,ts,tsx}',
        '**/vitest.setup.{js,ts}',
        '**/vitest.config.{js,ts}',
      ],
      rules: {
        'import/no-extraneous-dependencies': 'off',
      },
    },
  ],
};
