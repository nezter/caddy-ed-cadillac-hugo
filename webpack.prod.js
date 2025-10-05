const { merge } = require("webpack-merge");
const TerserPlugin = require("terser-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const CompressionPlugin = require("compression-webpack-plugin");
const { WebpackManifestPlugin } = require("webpack-manifest-plugin");
const { notifySuccess, notifyError } = require("./scripts/build-notifier");
// Critical CSS temporarily disabled due to ESM issues
// const CriticalCssWebpackPlugin = require("./scripts/critical-css-webpack-plugin");
// const criticalCssConfig = require("./scripts/critical-css-config");

const common = require("./webpack.common.js");

module.exports = merge(common, {
  mode: "production",
  
  output: {
    filename: "[name].[fullhash:5].js",
    chunkFilename: "[id].[fullhash:5].css"
  },
  
  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
        exclude: /\/node_modules/,
        terserOptions: {
          compress: {
            drop_console: true
          }
        }
      }),
      // Temporarily disabled - causing CSS parsing issues
      // new CssMinimizerPlugin()
    ],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        styles: {
          name: 'styles',
          test: /\.css$/,
          chunks: 'all',
          enforce: true
        },
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all'
        }
      }
    }
  },
  
  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].[fullhash:5].css",
      chunkFilename: "[id].[fullhash:5].css"
    }),
    
    new WebpackManifestPlugin({
      fileName: "assets.json",
      publicPath: ""
    }),
    
    new CompressionPlugin({
      test: /\.(js|css|html|svg)$/,
      algorithm: "gzip",
      threshold: 10240,
      minRatio: 0.8
    }),
    
    // Temporarily disabled - causing CSS loader issues
    // new CriticalCssWebpackPlugin({
    //   base: criticalCssConfig.base,
    //   templates: criticalCssConfig.templates
    // }),
    
    // Notify on build completion
    {
      apply: compiler => {
        compiler.hooks.done.tap('BuildNotifierPlugin', stats => {
          if (stats.hasErrors()) {
            notifyError('Build failed with errors');
            return;
          }
          
          const time = (stats.endTime - stats.startTime) / 1000;
          notifySuccess(`Build completed in ${time.toFixed(2)}s`);
        });
      }
    }
  ],
  
  // More detailed stats for production build
  stats: {
    colors: true,
    hash: true,
    timings: true,
    assets: true,
    chunks: false,
    chunkModules: false,
    modules: false,
    children: false
  }
});