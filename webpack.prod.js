const { merge } = require("webpack-merge");
const path = require("path");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const TerserPlugin = require("terser-webpack-plugin");
const CompressionPlugin = require("compression-webpack-plugin");
const { notifySuccess } = require("./scripts/build-notifier");
const common = require("./webpack.common.js");

module.exports = merge(common, {
  mode: "production",

  // Use source maps optimized for production
  devtool: "source-map",

  output: {
    filename: "[name].[fullhash:8].js",
    chunkFilename: "[id].[fullhash:8].js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/"
  },

  // Optimize bundle size
  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          ecma: 2020,
          compress: {
            drop_console: true, // Remove console logs in production
          },
        },
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
    ],
    splitChunks: {
      cacheGroups: {
        styles: {
          name: 'styles',
          test: /\.css$/,
          chunks: 'all',
          enforce: true
        }
      }
    }
  },

  plugins: [
    // Extract CSS into separate files for better caching
    new MiniCssExtractPlugin({
      filename: "[name].[fullhash:8].css",
      chunkFilename: "[id].[fullhash:8].css"
    }),
    
    // Compress assets for faster loading
    new CompressionPlugin({
      algorithm: "gzip",
      test: /\.(js|css|html|svg)$/,
      threshold: 10240, // Only compress files > 10kb
      minRatio: 0.8 // Only compress if compression ratio is better than 0.8
    }),
    
    // Show success notification on build completion
    {
      apply: (compiler) => {
        compiler.hooks.done.tap('BuildNotifier', () => {
          if (process.env.ENABLE_NOTIFICATIONS === 'true') {
            notifySuccess('Production build completed successfully');
          }
        });
      }
    }
  ],

  // Production-specific performance hints
  performance: {
    hints: "warning",
    maxAssetSize: 250000, // 250kb
    maxEntrypointSize: 400000, // 400kb
  }
});