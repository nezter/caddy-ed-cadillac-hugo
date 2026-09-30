// `libphonenumber-js/min`, not `libphonenumber-js`.
//
// The bare entry carries the full metadata for every numbering plan on earth:
// 13 MB on disk, and the Netlify bundler copies the whole package directory
// rather than tree-shaking it, so all 13 MB shipped in every function bundle
// that transitively required this file. The `min` entry is 6 KB of code plus
// the same metadata, minified -- the parsing is identical.
//
// It is used for exactly one thing (normalizePhone, E.164 for lead
// deduplication), which is worth knowing: a 13 MB dependency answering one
// question about ten-digit US numbers is a dependency to keep an eye on.
const { parsePhoneNumberFromString } = require('libphonenumber-js/min');

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

    // The fallback used to be `phone.replace(/\D/g, '')`, which returns
    // whatever digits were there -- and that is the wrong answer for the only
    // thing this function is used for.
    //
    // This normalises phone numbers so lead DEDUPLICATION can tell whether two
    // leads are the same person. A fallback of "8034316180" does not achieve
    // that: the same customer entered as "(803) 431-6180" elsewhere produces
    // "+18034316180", and the two strings differ, so the one duplicate this
    // function exists to find is the one it misses. It also stores a value that
    // looks normalised and is not, which is worse than an empty one because
    // nothing downstream can tell the difference.
    //
    // So: reconstruct E.164 for the unambiguous lengths, and return NOTHING for
    // the ambiguous ones. An empty string means "no key", which cannot merge two
    // different people. A seven-digit local number has no area code, so keying
    // it as if it were a full number WOULD merge two different people.
    const digits = String(phone).replace(/\D/g, '');
    if (digits.length === 10) return '+1' + digits;
    if (digits.length === 11 && digits[0] === '1') return '+' + digits;
    return '';
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