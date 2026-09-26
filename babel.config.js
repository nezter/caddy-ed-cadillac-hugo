/**
 * Babel Configuration for Jest Testing
 * Transforms ES6+ syntax for Node.js testing environment
 */

module.exports = {
  presets: [
    [
      '@babel/preset-env',
      {
        targets: {
          node: '18'
        },
        modules: 'commonjs'
      }
    ]
  ],
  plugins: [
    '@babel/plugin-transform-runtime',
    '@babel/plugin-proposal-optional-chaining',
    '@babel/plugin-proposal-nullish-coalescing-operator'
  ],
  env: {
    test: {
      plugins: [
        ['@babel/plugin-transform-runtime', {
          regenerator: true
        }]
      ]
    }
  }
};