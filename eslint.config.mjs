// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/no-explicit-any': 'warn',

      // General JavaScript rules
      'no-console': 'warn',
      'prefer-const': 'error',
      'no-var': 'error',
      'object-shorthand': 'error',
      'prefer-template': 'error',
    },
  },
  {
    files: ['src/playwright/**/*.ts'],
    rules: {
      // Playwright scripts are CLI utilities; allow structured console output.
      'no-console': ['error', { allow: ['info', 'error'] }],
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    ignores: [
      'lib/**/*',
      'dist/**/*',
      'node_modules/**/*',
      '.env',
      '.env.local',
      '.env.*.local',
      '*.log',
      'npm-debug.log*',
      'csv/**/*',
      '*.config.js',
    ],
  },
];
