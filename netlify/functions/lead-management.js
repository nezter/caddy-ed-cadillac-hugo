const nodemailer = require('nodemailer');
const axios = require('axios');
const errorHandler = require('./utils/error-handler');

exports.handler = async function(event, context) {
  // Only allow POST requests for lead submission
  if (event.httpMethod !== 'POST') {
    return errorHandler.forbiddenError('Method not allowed');
  }
  
  try {
    // Parse the lead data
    let leadData;
    try {
      leadData = JSON.parse(event.body);
    } catch (e) {
      return errorHandler.validationError('Invalid JSON in request body');
    }
    
    // Basic validation
    if (!leadData.name || !leadData.email || !leadData.phone) {
      return errorHandler.validationError('Missing required fields', {
        name: !leadData.name ? 'Name is required' : null,
        email: !leadData.email ? 'Email is required' : null,
        phone: !leadData.phone ? 'Phone is required' : null
      });
    }
    
    // Format data for CRM integration
    const crmData = {
      lead: {
        firstName: leadData.name.split(' ')[0],
        lastName: leadData.name.split(' ').slice(1).join(' '),
        email: leadData.email,
        phone: leadData.phone,
        message: leadData.message || '',
        source: leadData.source || 'Website',
        vehicleInterest: leadData.vehicleId || leadData.vehicleModel || '',
        utm: {
          source: leadData.utm_source || '',
          medium: leadData.utm_medium || '',
          campaign: leadData.utm_campaign || '',
          term: leadData.utm_term || '',
          content: leadData.utm_content || ''
        }
      }
    };
    
    // Submit to Netlify forms for backup
    try {
      await fetch('/.netlify/functions/submission-created', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          form_name: 'lead',
          form_data: leadData
        })
      });
    } catch (netlifyError) {
      console.error('Error sending to Netlify forms:', netlifyError);
      // Continue execution even if Netlify form submission fails
    }
    
    // Integration with dealer CRM system
    const crmApiKey = process.env.CRM_API_KEY;
    const crmUrl = process.env.CRM_API_URL;
    
    if (crmApiKey && crmUrl) {
      try {
        await axios.post(crmUrl, crmData, {
          headers: {
            'Authorization': `Bearer ${crmApiKey}`,
            'Content-Type': 'application/json'
          }
        });
      } catch (crmError) {
        console.error('Error sending lead to CRM:', crmError);
        // Log the error but don't return an error response to the user
        // as we've already saved the lead to Netlify forms
      }
    }
    
    return errorHandler.createSuccessResponse(
      { leadId: Date.now().toString() },
      'Thank you for your interest. A member of our sales team will contact you shortly.'
    );
  } catch (error) {
    return errorHandler.serverError('Error processing lead submission', error);
  }
};
