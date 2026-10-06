/**
 * articles-admin.js -- the articles endpoint, wired around the shared
 * content-admin handler (see utils/content-admin.js and
 * utils/content-types.js for the definition).
 */

'use strict';

const { makeContentHandler } = require('./utils/content-admin');
const store = require('./utils/article-queue');
const { TYPES } = require('./utils/content-types');

exports.handler = makeContentHandler({ store, def: TYPES.articles });
