'use strict';
/* testimonials-queue.js -- the testimonials instance of the shared content queue. */
const { createQueue } = require('./content-queue');
const { TYPES } = require('./content-types');
module.exports = createQueue(TYPES.testimonials);
