# MED-07 Subtask 1 Plan: ESLint and Sass Modernization

## Issue Description
As part of our ongoing efforts to modernize the build toolchain and eliminate deprecation warnings, we need to update two key components:

1. Replace the deprecated `babel-eslint` with `@babel/eslint-parser`
2. Migrate from `node-sass` to the maintained `sass` package

Both packages have been flagged as deprecated during builds, and replacing them will ensure better compatibility with other tools and future-proof our development environment.

## Current Status
- Build process shows deprecation warnings for both packages
- `babel-eslint` is no longer maintained; `@babel/eslint-parser` is the recommended replacement
- `node-sass` is being phased out in favor of the Dart Sass implementation (`sass`)

## Steps to Take

### 1. ESLint Parser Update
- Add `@babel/eslint-parser` to devDependencies
- Update ESLint configuration to use the new parser
- Test linting with the new configuration
- Remove `babel-eslint` once everything is working

### 2. Sass Migration
- Add `sass` to devDependencies
- Update any scripts or configurations that reference node-sass
- Test CSS compilation with Dart Sass
- Remove `node-sass` once everything is working

### 3. Update Documentation
- Update contributor documentation to reflect the new tooling
- Document any syntax differences between node-sass and Dart Sass

## Files to Modify
1. `/home/nez/caddy-ed-cadillac-hugo/package.json` - Update dependencies
2. `/home/nez/caddy-ed-cadillac-hugo/.eslintrc` (or similar) - Update parser configuration
3. `/home/nez/caddy-ed-cadillac-hugo/webpack.common.js` - Check for any sass-loader configuration that might need updating

## Expected Impact
- Elimination of deprecation warnings related to ESLint and Sass
- More maintainable codebase using actively supported packages
- Potentially improved build performance, particularly with Sass compilation

## Acceptance Criteria
- Build process shows no warnings related to ESLint parser or Sass
- Linting functionality works correctly with the new parser
- CSS compiles correctly with Dart Sass
- No visual or functional regressions

## Estimated Effort
- ESLint parser update: 45 minutes
- Sass migration: 1 hour
- Testing and verification: 45 minutes
- Total: 2.5 hours
