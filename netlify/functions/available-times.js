/**
 * available-times -- returns bookable time slots for a given date.
 *
 * WHY THIS EXISTS
 * ---------------
 * site/assets/js/refactored/TimeSlotManager.js fetches /api/available-times
 * when a date is selected. Like /api/available-dates, this endpoint did not
 * exist, so the fetch 404'd and the catch block fell back to generated slots.
 *
 * It returns an empty array -- "no slots are defined yet" -- which is true:
 * there is no booking system, so the calendar generates its own slots
 * client-side. When real availability lands, replace this file's body with a
 * query for that day's slots.
 */

'use strict';

exports.handler = async function (event) => {
  // The client sends ?date=YYYY-MM-DD. It is logged for diagnosis and ignored
  // for now: with no booking system there is nothing to look up.
  const date = event.queryStringParameters && event.queryStringParameters.date;

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify({
      date: date || null,
      timeSlots: [],
      source: 'none'
    })
  };
};
