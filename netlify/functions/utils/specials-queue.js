'use strict';
/* specials-queue.js -- the specials instance of the shared content queue. */
const { createQueue } = require('./content-queue');
const { TYPES } = require('./content-types');
module.exports = createQueue(TYPES.specials);
