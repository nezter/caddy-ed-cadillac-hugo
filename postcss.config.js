const purgecss = require('@fullhuman/postcss-purgecss')({
  content: ['./site/**/*.html', './site/**/*.md', './src/**/*.js', './src/**/*.html', './src/**/*.css'],
  defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || [],
  safelist: {
    standard: ['body', 'html', 'a', /^cms-/],
    deep: [/^pre/, /^code/, /^h[1-6]/, /^table/]
  }
});

module.exports = {
  plugins: [
    require('postcss-import'),
    require('postcss-preset-env')({
      browsers: 'last 2 versions'
    }),
    ...(process.env.NODE_ENV === 'production' ? [purgecss] : [])
  ]
};
