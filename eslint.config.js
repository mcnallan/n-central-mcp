import js from '@eslint/js';
import nodePlugin from 'eslint-plugin-n';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: { n: nodePlugin },
    rules: {
      'consistent-return': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-undef': 'error',
      'prefer-const': 'warn',
      'no-var': 'error',
      'eqeqeq': ['error', 'smart'],
      'n/no-process-exit': 'off',
      'n/no-missing-import': 'off',
    },
  },
  {
    files: ['test/**/*.js'],
    rules: {
      'no-unused-vars': 'off',
    },
  },
];
