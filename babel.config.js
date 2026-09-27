/**
 * Babel configuration.
 *
 * Used by jest (via babel-jest) to transform ES modules and modern syntax into
 * something Node can run. The webpack build has its own loader settings.
 *
 * WHY THE PLUGIN LIST IS ONE LINE
 * -------------------------------
 * This used to list three plugins:
 *
 *     @babel/plugin-transform-runtime
 *     @babel/plugin-proposal-optional-chaining
 *     @babel/plugin-proposal-nullish-coalescing-operator
 *
 * The latter two are part of @babel/preset-env since Babel 7.8. Their
 * standalone `plugin-proposal-*` packages are deprecated, exist to be
 * maintained for a version range that has not existed for years, and were being
 * carried here with no effect on the output.
 *
 * The dependencies for this file also have to be resolvable from the REPO ROOT,
 * because this file is here. @babel/core and preset-env already were. The
 * plugins were not, so babel could not load its own config and every test suite
 * that needed a transform failed with "Cannot find module
 * '@babel/plugin-transform-runtime'" before a single assertion ran.
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        // The CI host runs Node 24; 18 is the floor the code actually uses.
        targets: {
          node: '18',
        },
        // Jest needs CommonJS. The site itself is bundled by esbuild, which
        // handles ESM natively, so this does not affect production output.
        modules: 'commonjs',
      },
    ],
  ],

  plugins: ['@babel/plugin-transform-runtime'],

  env: {
    test: {
      // Regenerator lets async/await in the calendar modules run under the
      // jsdom environment the browser-facing tests need.
      plugins: [
        ['@babel/plugin-transform-runtime', { regenerator: true }],
      ],
    },
  },
};
