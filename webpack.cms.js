const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

/**
 * webpack.cms.js -- the ONLY remaining webpack build.
 *
 * The public site no longer uses webpack: front-end CSS and JS are emitted by
 * Hugo Pipes (`js.Build` + `css.Sass`) from site/assets/. See
 * site/layouts/partials/assets.html.
 *
 * Decap CMS is the exception. It needs `decap-cms-app` plus React and the eight
 * preview templates bundled together, which Hugo's single-entry esbuild pass
 * cannot produce (the preview templates are registered dynamically at runtime
 * and share a React instance). So the CMS keeps a dedicated webpack build,
 * scoped to exactly one entry and one output file.
 *
 * Output: site/static/cms.js  ->  consumed by site/static/cms.html
 */

module.exports = {
  mode: process.env.NODE_ENV === "development" ? "development" : "production",

  // Fail loudly. A silently-broken CMS is worse than a failed build.
  bail: true,

  entry: {
    cms: path.join(__dirname, "src", "js", "cms.js"),
  },

  output: {
    // Straight into static/ so Hugo copies it verbatim to the publish dir.
    // Deliberately NOT fingerprinted: site/static/cms.html references /cms.js
    // directly, and this page is editor-only, not cached hard by the public.
    path: path.join(__dirname, "site", "static"),
    filename: "[name].js",
    publicPath: "",
    clean: false,
  },

  resolve: {
    extensions: [".js", ".jsx"],
  },

  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: "babel-loader",
          options: {
            presets: [
              ["@babel/preset-env", { targets: "defaults" }],
              ["@babel/preset-react", { runtime: "automatic" }],
            ],
            cacheDirectory: true,
          },
        },
      },
    ],
  },

  optimization: {
    minimize: process.env.NODE_ENV !== "development",
    minimizer: [
      new TerserPlugin({
        parallel: true,
        terserOptions: {
          compress: { drop_console: true },
          format: { comments: false },
        },
      }),
    ],
  },

  performance: {
    // The CMS bundle is inherently large (React + netlify-cms-app). A size
    // warning here is noise, and ci/verify-build.js enforces the real budgets
    // on the public site.
    hints: false,
  },

  stats: "errors-warnings",
};
