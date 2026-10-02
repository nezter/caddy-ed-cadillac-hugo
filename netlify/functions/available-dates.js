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
 *
 * WARNING FOR WHOEVER DOES THAT
 * -----------------------------
 * Returning an empty array is public information and needs no guard. Returning
 * the REAL booked dates is not: an unauthenticated caller who can enumerate
 * dates can then read, day by day, exactly when this dealership is expecting a
 * customer -- which is the clearest possible signal to anyone considering
 * stealing a car, and it maps the quietest and busiest days of the week.
 *
 * The calendar needs "which dates can I not offer", not "who is coming in". When
 * this stops being an empty array, return availability (a boolean or a count),
 * never the customer, and put the names behind the booking calendar in
 * google-calendar.js, which is staff-only. Same for available-times.js.
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
