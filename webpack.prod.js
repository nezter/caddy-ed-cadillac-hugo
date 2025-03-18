const { merge } = require("webpack-merge");
const TerserPlugin = require("terser-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CompressionPlugin = require("compression-webpack-plugin");
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const { notifySuccess, notifyError } = require('./scripts/build-notifier');

const common = require("./webpack.common.js");

// Configuration for production build
const config = merge(common, {
  mode: "production",

  output: {
    filename: "[name].[fullhash:5].js",
    chunkFilename: "[id].[fullhash:5].css"
  },

  // Enhanced optimization options
  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          ecma: 6,
          compress: {
            drop_console: true,
          },
        },
        extractComments: false,
      }),
      new CssMinimizerPlugin({
        minimizerOptions: {
          preset: [
            'default',
            {
              discardComments: { removeAll: true },
            },
          ],
        },
      }),
    ]
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].[fullhash:5].css",
      chunkFilename: "[id].[fullhash:5].css"
    }),
    
    // Add compression for faster loading
    new CompressionPlugin({
      algorithm: "gzip",
      test: /\.(js|css|html|svg)$/,
      threshold: 10240,
      minRatio: 0.8,
    }),

    // Add a done hook to notify of success or failure
    {
      apply: (compiler) => {
        compiler.hooks.done.tap('BuildNotificationPlugin', (stats) => {
          if (stats.hasErrors()) {
            notifyError(`Build failed with ${stats.compilation.errors.length} error(s)`);
          } else {
            const buildTime = (stats.endTime - stats.startTime) / 1000;
            notifySuccess(`Build completed in ${buildTime.toFixed(2)}s`);
          }
        });
      }
    }
  ]
});

// Add bundle analyzer when ANALYZE flag is set
if (process.env.ANALYZE) {
  config.plugins.push(
    new BundleAnalyzerPlugin({
      analyzerMode: 'static',
      reportFilename: 'bundle-report.html',
      openAnalyzer: true
    })
  );
}

module.exports = config;