/**
 * Input sanitization utilities for preventing XSS and other injection attacks
 */

/**
 * Sanitize string input by removing potentially dangerous characters
 * @param {string} input - Input string to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeString(input) {
  if (typeof input !== 'string') return '';

  return input
    .replace(/[<>\"'&]/g, '') // Remove HTML characters
    .trim()
    .substring(0, 1000); // Limit length
}

/**
 * Sanitize email input
 * @param {string} email - Email to sanitize
 * @returns {string} - Sanitized email
 */
function sanitizeEmail(email) {
  if (typeof email !== 'string') return '';

  // Basic email sanitization - remove dangerous characters
  return email
    .replace(/[<>\"'&\\]/g, '')
    .trim()
    .toLowerCase()
    .substring(0, 254); // RFC 5321 limit
}

/**
 * Sanitize phone number input
 * @param {string} phone - Phone number to sanitize
 * @returns {string} - Sanitized phone number
 */
function sanitizePhone(phone) {
  if (typeof phone !== 'string') return '';

  // Remove all non-digit characters except +, -, (, ), space, and .
  return phone
    .replace(/[^+\d\s\-\(\)\.]/g, '')
    .trim()
    .substring(0, 20);
}

/**
 * Sanitize general text input (allows some HTML for rich text)
 * @param {string} text - Text to sanitize
 * @returns {string} - Sanitized text
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return '';

  // Remove script tags and other dangerous elements
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '')
    .trim()
    .substring(0, 10000); // Reasonable limit
}

/**
 * Validate and sanitize customer data
 * @param {Object} data - Customer data to sanitize
 * @returns {Object} - Sanitized customer data
 */
function sanitizeCustomerData(data) {
  return {
    first_name: sanitizeString(data.first_name || ''),
    last_name: sanitizeString(data.last_name || ''),
    email: sanitizeEmail(data.email || ''),
    phone: sanitizePhone(data.phone || ''),
    address_line1: sanitizeString(data.address_line1 || ''),
    city: sanitizeString(data.city || ''),
    state: sanitizeString(data.state || ''),
    zip_code: sanitizeString(data.zip_code || ''),
    customer_type: ['prospect', 'customer', 'vip'].includes(data.customer_type) ? data.customer_type : 'prospect',
    source: sanitizeString(data.source || ''),
    vehicle_interest: sanitizeString(data.vehicle_interest || ''),
    preferred_contact_method: ['email', 'phone', 'sms'].includes(data.preferred_contact_method) ? data.preferred_contact_method : 'email',
    email_consent: Boolean(data.email_consent),
    sms_consent: Boolean(data.sms_consent),
    phone_consent: Boolean(data.phone_consent)
  };
}

/**
 * Validate and sanitize lead data
 * @param {Object} data - Lead data to sanitize
 * @returns {Object} - Sanitized lead data
 */
function sanitizeLeadData(data) {
  return {
    first_name: sanitizeString(data.first_name || ''),
    last_name: sanitizeString(data.last_name || ''),
    email: sanitizeEmail(data.email || ''),
    phone: sanitizePhone(data.phone || ''),
    source: sanitizeString(data.source || ''),
    vehicle_interest: sanitizeString(data.vehicle_interest || ''),
    budget_min: data.budget_min ? parseInt(data.budget_min) : null,
    budget_max: data.budget_max ? parseInt(data.budget_max) : null,
    timeline: ['immediate', '1-3_months', '3-6_months', '6+_months'].includes(data.timeline) ? data.timeline : null,
    preferred_contact_method: ['email', 'phone', 'sms'].includes(data.preferred_contact_method) ? data.preferred_contact_method : 'email',
    consent: Boolean(data.consent),
    notes: sanitizeText(data.notes || '')
  };
}

module.exports = {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeText,
  sanitizeCustomerData,
  sanitizeLeadData
};