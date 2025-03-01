import { merge } from "webpack-merge";
import TerserPlugin from "terser-webpack-plugin";
import OptimizeCSSAssetsPlugin from "optimize-css-assets-webpack-plugin";
import MiniCssExtractPlugin from "mini-css-extract-plugin";

import common from "./webpack.common.js";

export default merge(common, {
  mode: "production",

  output: {
    filename: "[name].[hash:5].js",
    chunkFilename: "[id].[hash:5].css"
  },

  optimization: {
    minimizer: [
      new TerserPlugin({
        parallel: true,
        exclude: /node_modules/,
        terserOptions: {
          compress: {
            drop_console: true
          },
          mangle: true
        }
      }),
      new OptimizeCSSAssetsPlugin({})
    ]
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: "[name].[hash:5].css",
      chunkFilename: "[id].[hash:5].css"
    })
  ]
});