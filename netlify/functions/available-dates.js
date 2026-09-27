/**
 * available-dates -- returns booked dates for the scheduling calendar.
 *
 * WHY THIS EXISTS
 * ---------------
 * site/assets/js/refactored/TimeSlotManager.js fetches /api/available-dates on
 * init and treats the response as the set of dates that cannot be booked. When
 * the endpoint did not exist the fetch returned 404, the catch block fell back
 * to generated dates, and the calendar still worked -- but every page load
 * produced a failed request that reads as a site fault in the network log.
 *
 * This function closes that gap. It returns an empty array, which means "no
 * dates are booked", which is the true state: there is no booking system yet,
 * so every date is available. The calendar's own fallback generates the same
 * set client-side, so behaviour is unchanged; only the spurious 404 is gone.
 *
 * When a real booking system lands, this is the single file to replace: query
 * it for booked dates and return them in the same shape.
 */

'use strict';

/**
 * @param {Object} event - Netlify function event
 * @returns {Object} response with CORS headers and a JSON body
 */
exports.handler = async function () {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      // The calendar reads this from a same-origin page, but CORS costs nothing
      // and keeps the endpoint usable from a future standalone booking page.
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      // An empty array is the honest answer: nothing is booked because nothing
      // can be booked. The client generates availability from this.
      availableDates: [],
      source: 'none'
    })
  };
};
