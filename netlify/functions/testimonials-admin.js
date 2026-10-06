/**
 * testimonials-admin.js -- the testimonials endpoint (same machine as
 * articles; see utils/content-admin.js).
 */

'use strict';

const { makeContentHandler } = require('./utils/content-admin');
const store = require('./utils/testimonials-queue');
const { TYPES } = require('./utils/content-types');

exports.handler = makeContentHandler({ store, def: TYPES.testimonials });
