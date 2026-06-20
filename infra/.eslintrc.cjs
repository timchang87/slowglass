const path = require('path');

module.exports = {
  env: { es2022: true },
  extends: ['airbnb-typescript/base', '../.eslintrc.cjs'],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
  },
};
