const { merge } = require("webpack-merge");
const path = require("path");
const { WebpackPluginServe } = require('webpack-plugin-serve');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const common = require("./webpack.common.js");

module.exports = merge(common, {
  mode: "development",
  
  // Enable source maps for better debugging
  devtool: "eval-source-map",
  
  // Improved development output
  stats: {
    colors: true,
    modules: false,
    children: false,
    chunks: false,
    chunkModules: false,
    // Reduce output noise
    assets: true,
    entrypoints: false,
  },
  
  output: {
    filename: "[name].js",
    chunkFilename: "[id].css"
  },

  devServer: {
    // Improved dev server configuration
    static: {
      directory: path.join(__dirname, 'dist'),
    },
    // Fallback for SPA-style routing
    historyApiFallback: true,
    // Enable gzip compression for faster development experience
    compress: true,
    host: "localhost",
    port: 3000,
    // Open browser when server starts
    open: true,
    // Auto-reload on Hugo changes
    watchFiles: ['site/**/*'],
    // Display useful errors as overlay
    client: {
      overlay: {
        errors: true,
        warnings: false,
      },
    },
  },

  plugins: [
    // Extract CSS into separate files for better caching
    new MiniCssExtractPlugin({
      filename: "[name].css",
      chunkFilename: "[id].css"
    })
  ]
});
