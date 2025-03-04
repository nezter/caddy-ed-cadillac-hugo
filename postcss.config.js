const purgecss = require('@fullhuman/postcss-purgecss')({
  content: [
    './site/**/*.html',
    './site/**/*.md',
    './src/**/*.js',
    './src/**/*.html'
  ],
  defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
  safelist: {
    standard: ['is-active', 'active', 'show', 'hide', 'animated', 'loaded'],
    deep: [/^lazy/, /^pre/, /^highlight/, /^pagination/, /^cms/]
  }
});

module.exports = {
  plugins: [
    require('postcss-import'),
    require('postcss-preset-env')({
      browsers: 'last 2 versions',
      features: {
        'nesting-rules': true
      }
    }),
    ...(process.env.NODE_ENV === 'production' ? [purgecss] : [])
  ]
};
