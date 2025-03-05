const nodemailer = require('nodemailer');
const axios = require('axios');

exports.handler = async function(event, context) {
  // Only allow POST requests for lead submission
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  try {
    // Parse the lead data
    const leadData = JSON.parse(event.body);
    
    // Basic validation
    if (!leadData.name || !leadData.email || !leadData.phone) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          success: false, 
          message: 'Missing required fields: name, email, and phone' 
        })
      };
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
    await fetch('/.netlify/functions/submission-created', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        form_name: 'lead',
        form_data: leadData
      })
    });
    
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
        // We don't return an error to the user if CRM submission fails
        // as we've already saved the lead to Netlify forms
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: 'Thank you for your interest. A member of our sales team will contact you shortly.'
      })
    };
    
  } catch (error) {
    console.error('Error processing lead:', error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: 'We encountered an error processing your request. Please try again or call us directly.'
      })
    };
  }
};
