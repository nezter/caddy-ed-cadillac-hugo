/**
 * specials-admin.js -- the specials endpoint (same machine as articles;
 * see utils/content-admin.js). Offers queue, apply and publish like every
 * other content type; drafts stay invisible until Published is ticked.
 */

'use strict';

const { makeContentHandler } = require('./utils/content-admin');
const store = require('./utils/specials-queue');
const { TYPES } = require('./utils/content-types');

exports.handler = makeContentHandler({ store, def: TYPES.specials });
