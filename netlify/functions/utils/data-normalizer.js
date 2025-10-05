const { parsePhoneNumberFromString } = require('libphonenumber-js');

/**
 * Data normalization utilities for lead deduplication
 */
class DataNormalizer {
  /**
   * Normalize email address
   * @param {string} email - Email to normalize
   * @returns {string} Normalized email
   */
  static normalizeEmail(email) {
    if (!email) return '';

    return email
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '') // Remove spaces
      .replace(/\+.*@/, '@'); // Remove Gmail-style aliases
  }

  /**
   * Normalize phone number
   * @param {string} phone - Phone number to normalize
   * @param {string} country - Default country code (default: 'US')
   * @returns {string} Normalized phone number in E.164 format
   */
  static normalizePhone(phone, country = 'US') {
    if (!phone) return '';

    try {
      const phoneNumber = parsePhoneNumberFromString(phone, country);
      if (phoneNumber && phoneNumber.isValid()) {
        return phoneNumber.format('E.164');
      }
    } catch (error) {
      console.warn('Phone number parsing error:', error.message);
    }

    // Fallback: basic cleaning
    return phone.replace(/\D/g, '');
  }

  /**
   * Normalize name for comparison
   * @param {string} name - Name to normalize
   * @returns {string} Normalized name
   */
  static normalizeName(name) {
    if (!name) return '';

    return name
      .toLowerCase()
      .trim()
      .replace(/\s+/g, ' ') // Normalize spaces
      .replace(/[^a-z\s]/g, '') // Remove non-alphabetic characters
      .split(' ')
      .filter(word => word.length > 0)
      .join(' ');
  }

  /**
   * Get name components
   * @param {string} fullName - Full name
   * @returns {Object} { firstName, lastName }
   */
  static getNameComponents(fullName) {
    if (!fullName) return { firstName: '', lastName: '' };

    const normalized = this.normalizeName(fullName);
    const parts = normalized.split(' ');

    return {
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || ''
    };
  }

  /**
   * Normalize complete lead data
   * @param {Object} leadData - Raw lead data
   * @returns {Object} Normalized lead data
   */
  static normalizeLeadData(leadData) {
    const normalized = { ...leadData };

    if (leadData.email) {
      normalized.normalizedEmail = this.normalizeEmail(leadData.email);
    }

    if (leadData.phone) {
      normalized.normalizedPhone = this.normalizePhone(leadData.phone);
    }

    if (leadData.name) {
      normalized.normalizedName = this.normalizeName(leadData.name);
      const nameComponents = this.getNameComponents(leadData.name);
      normalized.firstName = nameComponents.firstName;
      normalized.lastName = nameComponents.lastName;
    }

    return normalized;
  }
}

module.exports = DataNormalizer;