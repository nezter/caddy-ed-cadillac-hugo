/**
 * Browser Compatibility Module
 * Provides polyfills and compatibility helpers
 */

/**
 * Check if the browser supports required features
 * @returns {boolean} True if browser is compatible
 */
export function checkBrowserCompatibility() {
  return 'fetch' in window &&
         'Promise' in window &&
         'querySelector' in document &&
         'classList' in document.createElement('div');
}

/**
 * Apply necessary polyfills
 */
export function applyPolyfills() {
  // Add any required polyfills here
  if (!Element.prototype.closest) {
    Element.prototype.closest = function(s) {
      let el = this;
      do {
        if (el.matches(s)) return el;
        el = el.parentElement || el.parentNode;
      } while (el !== null && el.nodeType === 1);
      return null;
    };
  }
  
  if (!Element.prototype.matches) {
    Element.prototype.matches = Element.prototype.msMatchesSelector || 
                               Element.prototype.webkitMatchesSelector;
  }
}

/**
 * Format a date as a string
 * @param {Date} date - The date to format
 * @param {string} format - Format string (YYYY-MM-DD, etc)
 * @returns {string} Formatted date string
 */
export function formatDate(date, format = 'YYYY-MM-DD') {
  if (!date) return '';
  
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  
  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day);
}

/**
 * Parse a date string into a Date object
 * @param {string} dateStr - Date string in YYYY-MM-DD format
 * @returns {Date|null} Date object or null if invalid
 */
export function parseDate(dateStr) {
  if (!dateStr) return null;
  
  const parts = dateStr.split('-');
  if (parts.length !== 3) return null;
  
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Month is 0-based
  const day = parseInt(parts[2], 10);
  
  return new Date(year, month, day);
}
