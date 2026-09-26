// =============================================================================
// eslint.config.js -- flat config (ESLint 9)
//
// Replaces three mutually-conflicting legacy configs (.eslintrc,
// .eslintrc.json, .eslintrc.yml) plus eslint 7. There was no single answer to
// "what does this repo lint with".
//
// Lint scope is the code that actually ships or runs in CI:
//   site/assets/js  front-end bundles (browser)
//   src/js          CMS entry (browser)
//   scripts/        build + ops scripts (node)
//   ci/             pipeline driver + verification (node)
// =============================================================================

import js from '@eslint/js';
import globals from 'globals';
import babelParser from '@babel/eslint-parser';

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'site/public/**',
      'site/resources/**',
      'site/static/**', // generated CMS bundle
      'netlify/functions/node_modules/**',
      'netlify/functions/coverage/**',
      '.taskmaster/**',
    ],
  },

  js.configs.recommended,

  // --- browser: the front end -------------------------------------------
  {
    files: ['site/assets/js/**/*.js', 'src/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parser: babelParser,
      requireConfigFile: false,
      babelOptions: { presets: [['@babel/preset-react', { runtime: 'automatic' }]] },
      globals: {
        ...globals.browser,
        // Bundled as ESM and executed in the browser.
        module: 'writable',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
      'no-var': 'error',
    },
  },

  // --- node: build, CI and ops scripts -----------------------------------
  {
    files: ['scripts/**/*.js', 'ci/**/*.js', '*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'prefer-const': 'warn',
      'no-var': 'error',
      eqeqeq: ['warn', 'smart'],
    },
  },

  // --- tests -------------------------------------------------------------
  {
    files: ['netlify/functions/**/*.test.js', 'netlify/functions/__tests__/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'commonjs',
      globals: { ...globals.node, ...globals.jest },
    },
  },
];
