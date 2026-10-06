/**
 * article-queue.js -- the articles instance of the shared content queue.
 *
 * This used to be the whole implementation; it now delegates to
 * utils/content-queue.js with the articles definition from
 * utils/content-types.js, and keeps its old export surface so every existing
 * caller (articles-admin.js, scripts/articles, ci/check-articles-admin.js)
 * keeps working unchanged.
 *
 * The full original commentary -- why a queue, agent design notes, the
 * never-throw contract, the applied snapshot -- lives in content-queue.js,
 * which is the file that now owns those behaviours for all three types.
 */

'use strict';

const { createQueue } = require('./content-queue');
const { TYPES } = require('./content-types');

module.exports = createQueue(TYPES.articles);
