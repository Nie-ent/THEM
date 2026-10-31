// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'playwright-report/**',
      'test-results/**',
      'services/**',
      '.claude/**',
      '**/*.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  // Core simulation must stay deterministic and platform-free (CLAUDE.md hard rule 2).
  {
    files: ['packages/core/src/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the sim RNG (run.rng).' },
        { object: 'Date', property: 'now', message: 'Sim time is ticks, never wall clock.' },
        { object: 'performance', property: 'now', message: 'Sim time is ticks, never wall clock.' },
        { object: 'Math', property: 'sin', message: 'Trig is not bit-exact across engines; use vector math.' },
        { object: 'Math', property: 'cos', message: 'Trig is not bit-exact across engines; use vector math.' },
        { object: 'Math', property: 'atan2', message: 'Trig is not bit-exact across engines; use vector math.' },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'No DOM in core.' },
        { name: 'document', message: 'No DOM in core.' },
        { name: 'Date', message: 'No wall clock in core.' },
        { name: 'setTimeout', message: 'Sim time is ticks.' },
        { name: 'setInterval', message: 'Sim time is ticks.' },
      ],
      'no-restricted-imports': ['error', { patterns: ['phaser', 'react', 'react-dom', '@them/i18n'] }],
    },
  },
  {
    files: ['apps/game/src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
    },
  },
);
