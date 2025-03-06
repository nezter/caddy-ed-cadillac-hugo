const { merge } = require("webpack-merge");
const TerserPlugin = require("terser-webpack-plugin");
const CssMinimizerPlugin = require("css-minimizer-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

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
        terserOptions: {
          compress: {
            drop_console: true
          },
          mangle: true
        }
      }),
      new CssMinimizerPlugin()
    ]
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].[fullhash:5].css",
      chunkFilename: "[id].[fullhash:5].css"
    })
  ]
});