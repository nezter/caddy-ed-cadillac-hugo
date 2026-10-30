'use strict';

/**
 * vehicle-details -- RETIRED.
 *
 * This endpoint used to proxy a live vehicle feed by stock number. The public
 * inventory has been removed from the site, so the endpoint is closed rather
 * than left as an unlinked but callable source of vehicle data.
 *
 * It remains on disk (and in the function manifest) so the deployment keeps a
 * stable, explicit 410 instead of resolving to an unrelated 404.
 */
exports.handler = async function () {
  return {
    statusCode: 410,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify({
      success: false,
      error: 'Gone',
      message: 'Vehicle inventory is no longer published.',
    }),
  };
};
