/**
 * sync-rules.js -- the inventory sync's operating limits, in one place.
 *
 * The runner (scripts/inventory/crawl.js) enforces these; the /admin/sync
 * page promises them. They used to live only in the runner, so the page
 * could not tell its users WHY a run may have to wait -- the exact feedback
 * the admin team asked for. Both sides read this module now, so the text
 * the page shows and the gate the runner enforces cannot drift.
 *
 * A manual request from /admin/sync (the Sync now button) waives the window
 * and the interval for that one run: a person deciding now outranks the
 * site's polite self-restraint. The runner records that in the run's detail
 * (gate: { waivedBy: 'manual request' }), so every fast run says why.
 */

'use strict';

const SYNC_RULES = {
  minIntervalHours: 24,
  windowStartHour: 1,
  windowEndHour: 5,
};

module.exports = SYNC_RULES;
