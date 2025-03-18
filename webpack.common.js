const webpack = require("webpack");
const path = require("path");
const CopyWebpackPlugin = require("copy-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const AssetsPlugin = require("assets-webpack-plugin");
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const WebpackErrorReportingPlugin = require('./scripts/webpack-error-reporting-plugin');

// Improve caching with environment-specific settings
const isDev = process.env.NODE_ENV !== "production";

module.exports = {
  entry: {
    main: path.join(__dirname, "src", "index.js"),
    // Split app code from vendor code for better caching
    vendor: path.join(__dirname, "src", "js", "vendor.js"),
    cms: path.join(__dirname, "src", "js", "cms.js"),
    sw: path.join(__dirname, "src", "sw.js")
  },

  output: {
    path: path.join(__dirname, "dist"),
    // Add contenthash for better cache invalidation
    filename: isDev ? "[name].js" : "[name].[contenthash:8].js",
  },

  // Add cache configuration for faster rebuilds
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename]
    }
  },

  // Optimize module resolution
  resolve: {
    extensions: ['.js', '.jsx', '.json'],
    alias: {
      // Add aliases for common import paths
      '@': path.resolve(__dirname, 'src'),
      '@components': path.resolve(__dirname, 'src/js/components'),
      '@utils': path.resolve(__dirname, 'src/js/utils')
    }
  },

  module: {
    rules: [
      {
        test: /\.((png)|(svg)|(gif)|(jpe?g)|(webp))$/,
        type: "asset/resource",
        // Add specific output path for assets
        generator: {
          filename: 'images/[name].[hash:8][ext]'
        }
      },
      {
        test: /\.(woff|woff2|ttf|eot)$/,
        type: "asset/resource",
        // Add specific output path for fonts
        generator: {
          filename: 'fonts/[name].[hash:8][ext]'
        }
      },
      {
        test: /\.json$/,
        loader: "json-loader"
      },
      {
        test: /\.js$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            // Enable caching for babel
            cacheDirectory: true,
            cacheCompression: false
          }
        }
      },
      {
        test: /\.(sa|sc|c)ss$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: "css-loader",
            options: {
              importLoaders: 1,
              // Enable source maps in development
              sourceMap: isDev
            }
          },
          {
            loader: "postcss-loader",
            options: {
              sourceMap: isDev
            }
          },
          {
            loader: "sass-loader", 
            options: {
              sourceMap: isDev
            }
          }
        ]
      }
    ]
  },

  // Optimize chunk splitting for better performance
  optimization: {
    runtimeChunk: 'single',
    splitChunks: {
      chunks: 'all',
      maxInitialRequests: Infinity,
      minSize: 0,
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name(module) {
            // Get the name. E.g. node_modules/packageName/not/this/part.js
            // or node_modules/packageName
            const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
            // Return in a format compatible with output filename
            return `vendor.${packageName.replace('@', '')}`;
          }
        }
      }
    }
  },

  plugins: [
    // Clean the dist directory on each build
    new CleanWebpackPlugin({
      cleanOnceBeforeBuildPatterns: [
        '**/*',
        '!.git/**',
      ],
    }),

    // More verbose progress information for better build feedback
    new webpack.ProgressPlugin({
      percentBy: 'entries',
      profile: true,
      handler: (percentage, message, ...args) => {
        // Only log at meaningful percentage points to reduce noise
        if (percentage === 0 || percentage === 1 || 
            percentage === 0.25 || percentage === 0.5 || percentage === 0.75 ||
            args[0]) {
          const percent = Math.floor(percentage * 100);
          console.log(`[${percent}%] ${message} ${args.join(' ')}`);
        }
      }
    }),

    new webpack.ProvidePlugin({
      fetch: "imports-loader?this=>global!exports-loader?global.fetch!whatwg-fetch"
    }),

    // Enhanced asset emitting for better build information
    new AssetsPlugin({
      filename: "webpack.json",
      path: path.join(process.cwd(), "site/data"),
      prettyPrint: true,
      removeFullPathAutoPrefix: true
    }),

    new CopyWebpackPlugin({
      patterns: [
        {
          from: "./src/fonts/",
          to: "fonts/",
          noErrorOnMissing: true
        },
        {
          from: "./src/static",
          to: ".",
          noErrorOnMissing: true
        }
      ]
    }),

    new HtmlWebpackPlugin({
      filename: 'admin/index.html',
      template: 'src/cms.html',
      inject: false,
    }),

    // Add improved error reporting
    new WebpackErrorReportingPlugin(),
  ]
};
