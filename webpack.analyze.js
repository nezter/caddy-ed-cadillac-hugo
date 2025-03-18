const { merge } = require("webpack-merge");
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
const prod = require("./webpack.prod.js");

module.exports = merge(prod, {
  plugins: [
    new BundleAnalyzerPlugin({
      analyzerMode: 'server',
      analyzerHost: 'localhost',
      analyzerPort: 8888,
      reportFilename: 'report.html',
      openAnalyzer: true,
      generateStatsFile: true,
      statsFilename: 'stats.json',
    })
  ]
});
