/**
 * API Service
 * 
 * A centralized service for making API requests with built-in error handling
 * using the error event system.
 */

import ErrorEventSystem from '../utils/error-event-system';

/**
 * Make a fetch request with standardized error handling
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @param {string} context - Context for error handling
 * @returns {Promise<Object>} The parsed response
 */
async function fetchWithErrorHandling(url, options = {}, context = 'API Request') {
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      throw response;
    }
    
    return await response.json();
  } catch (error) {
    // Use the error event system to handle the error
    const parsedError = ErrorEventSystem.handleError(error, context, {
      // By default, don't show notifications for 404s
      notifyUser: !(error instanceof Response && error.status === 404)
    });
    
    // Re-throw the error for local handling if needed
    throw parsedError;
  }
}

/**
 * Make a GET request
 * @param {string} url - The URL to fetch
 * @param {Object} options - Additional fetch options
 * @param {string} context - Context for error handling
 * @returns {Promise<Object>} The parsed response
 */
function get(url, options = {}, context = 'GET Request') {
  return fetchWithErrorHandling(url, {
    method: 'GET',
    ...options
  }, context);
}

/**
 * Make a POST request
 * @param {string} url - The URL to fetch
 * @param {Object} data - The data to send
 * @param {Object} options - Additional fetch options
 * @param {string} context - Context for error handling
 * @returns {Promise<Object>} The parsed response
 */
function post(url, data, options = {}, context = 'POST Request') {
  const defaultOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };
  
  return fetchWithErrorHandling(url, {
    ...defaultOptions,
    ...options
  }, context);
}

/**
 * Make a PUT request
 * @param {string} url - The URL to fetch
 * @param {Object} data - The data to send
 * @param {Object} options - Additional fetch options
 * @param {string} context - Context for error handling
 * @returns {Promise<Object>} The parsed response
 */
function put(url, data, options = {}, context = 'PUT Request') {
  const defaultOptions = {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  };
  
  return fetchWithErrorHandling(url, {
    ...defaultOptions,
    ...options
  }, context);
}

/**
 * Make a DELETE request
 * @param {string} url - The URL to fetch
 * @param {Object} options - Additional fetch options
 * @param {string} context - Context for error handling
 * @returns {Promise<Object>} The parsed response
 */
function del(url, options = {}, context = 'DELETE Request') {
  return fetchWithErrorHandling(url, {
    method: 'DELETE',
    ...options
  }, context);
}

export default {
  fetchWithErrorHandling,
  get,
  post,
  put,
  delete: del
};
