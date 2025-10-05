const axios = require('axios');

/**
 * CRM Service for handling lead submissions to external CRM systems
 * Supports multiple CRM providers with proper error handling and fallbacks
 */
class CRMService {
  constructor() {
    this.crmType = process.env.CRM_TYPE || 'generic'; // 'salesforce', 'hubspot', 'zoho', 'generic'
    this.apiKey = process.env.CRM_API_KEY;
    this.apiUrl = process.env.CRM_API_URL;
    this.timeout = 10000; // 10 seconds timeout
  }

  /**
   * Submit lead to CRM system
   * @param {Object} leadData - Formatted lead data
   * @returns {Promise<Object>} - Result object with success status and details
   */
  async submitLead(leadData) {
    if (!this.apiKey || !this.apiUrl) {
      console.warn('CRM API credentials not configured');
      return { success: false, reason: 'CRM not configured' };
    }

    try {
      const response = await this._sendToCRM(leadData);
      return {
        success: true,
        crmType: this.crmType,
        leadId: response.leadId || response.id,
        response: response
      };
    } catch (error) {
      console.error(`CRM submission failed for ${this.crmType}:`, error.message);
      return {
        success: false,
        crmType: this.crmType,
        error: error.message,
        statusCode: error.response?.status
      };
    }
  }

  /**
   * Send data to specific CRM based on type
   * @private
   */
  async _sendToCRM(leadData) {
    switch (this.crmType.toLowerCase()) {
      case 'salesforce':
        return await this._submitToSalesforce(leadData);
      case 'hubspot':
        return await this._submitToHubspot(leadData);
      case 'zoho':
        return await this._submitToZoho(leadData);
      case 'pipedrive':
        return await this._submitToPipedrive(leadData);
      default:
        return await this._submitGeneric(leadData);
    }
  }

  /**
   * Submit to Salesforce CRM
   * @private
   */
  async _submitToSalesforce(leadData) {
    const sfData = {
      FirstName: leadData.firstName,
      LastName: leadData.lastName,
      Email: leadData.email,
      Phone: leadData.phone,
      Company: leadData.vehicleInterest || 'Prospect',
      LeadSource: leadData.source,
      Description: leadData.message,
      // Add UTM tracking if available
      utm_source__c: leadData.utm?.source,
      utm_medium__c: leadData.utm?.medium,
      utm_campaign__c: leadData.utm?.campaign
    };

    const response = await axios.post(
      `${this.apiUrl}/services/data/v58.0/sobjects/Lead`,
      sfData,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      }
    );

    return {
      leadId: response.data.id,
      success: response.data.success
    };
  }

  /**
   * Submit to HubSpot CRM
   * @private
   */
  async _submitToHubspot(leadData) {
    const hsData = {
      properties: [
        { property: 'firstname', value: leadData.firstName },
        { property: 'lastname', value: leadData.lastName },
        { property: 'email', value: leadData.email },
        { property: 'phone', value: leadData.phone },
        { property: 'message', value: leadData.message },
        { property: 'lead_source', value: leadData.source },
        { property: 'vehicle_interest', value: leadData.vehicleInterest },
        // UTM parameters
        { property: 'utm_source', value: leadData.utm?.source },
        { property: 'utm_medium', value: leadData.utm?.medium },
        { property: 'utm_campaign', value: leadData.utm?.campaign }
      ]
    };

    const response = await axios.post(
      `${this.apiUrl}/contacts/v1/contact`,
      hsData,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      }
    );

    return {
      leadId: response.data.vid,
      success: true
    };
  }

  /**
   * Submit to Zoho CRM
   * @private
   */
  async _submitToZoho(leadData) {
    const zohoData = {
      data: [{
        First_Name: leadData.firstName,
        Last_Name: leadData.lastName,
        Email: leadData.email,
        Phone: leadData.phone,
        Description: leadData.message,
        Lead_Source: leadData.source,
        // Custom field for vehicle interest
        Vehicle_Interest: leadData.vehicleInterest
      }]
    };

    const response = await axios.post(
      `${this.apiUrl}/crm/v2/Leads`,
      zohoData,
      {
        headers: {
          'Authorization': `Zoho-oauthtoken ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      }
    );

    return {
      leadId: response.data.data[0].details.id,
      success: true
    };
  }

  /**
   * Submit to Pipedrive CRM
   * @private
   */
  async _submitToPipedrive(leadData) {
    const pdData = {
      name: `${leadData.firstName} ${leadData.lastName}`,
      email: leadData.email,
      phone: leadData.phone,
      // Add custom fields as needed
      custom_fields: {
        message: leadData.message,
        source: leadData.source,
        vehicle_interest: leadData.vehicleInterest,
        utm_source: leadData.utm?.source,
        utm_medium: leadData.utm?.medium,
        utm_campaign: leadData.utm?.campaign
      }
    };

    const response = await axios.post(
      `${this.apiUrl}/v1/persons`,
      pdData,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      }
    );

    return {
      leadId: response.data.data.id,
      success: true
    };
  }

  /**
   * Generic CRM submission (fallback)
   * @private
   */
  async _submitGeneric(leadData) {
    const response = await axios.post(
      this.apiUrl,
      leadData,
      {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.timeout
      }
    );

    return {
      leadId: response.data.id || response.data.leadId || Date.now().toString(),
      success: true
    };
  }

  /**
   * Test CRM connection
   * @returns {Promise<boolean>} - Connection status
   */
  async testConnection() {
    if (!this.apiKey || !this.apiUrl) {
      return false;
    }

    try {
      // Simple test request - adjust based on CRM API
      const testUrl = this._getTestEndpoint();
      await axios.get(testUrl, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        timeout: 5000
      });
      return true;
    } catch (error) {
      console.error('CRM connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get appropriate test endpoint for CRM type
   * @private
   */
  _getTestEndpoint() {
    switch (this.crmType.toLowerCase()) {
      case 'salesforce':
        return `${this.apiUrl}/services/data/v58.0/limits`;
      case 'hubspot':
        return `${this.apiUrl}/contacts/v1/lists/all/contacts/all`;
      case 'zoho':
        return `${this.apiUrl}/crm/v2/users`;
      case 'pipedrive':
        return `${this.apiUrl}/v1/users/me`;
      default:
        return this.apiUrl;
    }
  }
}

module.exports = new CRMService();