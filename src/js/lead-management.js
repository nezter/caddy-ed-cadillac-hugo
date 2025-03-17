/**
 * Lead Management System
 * Handles capture and processing of sales leads from various website forms
 */
class LeadManagement {
  constructor(options = {}) {
    this.options = Object.assign({
      apiEndpoint: '/.netlify/functions/lead-management',
      trackingEnabled: true,
      debug: false
    }, options);
    
    this.forms = document.querySelectorAll('form[data-lead-form]');
    
    if (this.forms.length > 0) {
      this.init();
    }
  }
  
  init() {
    // Add submission handling to all lead forms
    this.forms.forEach(form => {
      form.addEventListener('submit', this.handleSubmit.bind(this));
      
      // Set up field validation
      const requiredFields = form.querySelectorAll('[required]');
      requiredFields.forEach(field => {
        field.addEventListener('blur', () => this.validateField(field));
      });
    });
    
    if (this.options.debug) {
      console.log(`LeadManagement initialized: found ${this.forms.length} lead forms`);
    }
  }
  
  validateField(field) {
    const errorClass = 'field-error';
    
    // Remove any existing error messages
    const existingError = field.parentNode.querySelector(`.${errorClass}`);
    if (existingError) {
      existingError.remove();
    }
    
    // Skip validation if field is empty and not required
    if (!field.hasAttribute('required') && field.value.trim() === '') {
      return true;
    }
    
    // Check if field is valid
    if (!field.checkValidity()) {
      // Create and append error message
      const errorMessage = document.createElement('div');
      errorMessage.className = errorClass;
      errorMessage.setAttribute('aria-live', 'polite');
      errorMessage.textContent = field.validationMessage || 'This field is invalid';
      
      field.parentNode.appendChild(errorMessage);
      
      // Add error class to field
      field.classList.add('invalid');
      
      return false;
    }
    
    // Field is valid
    field.classList.remove('invalid');
    field.classList.add('valid');
    return true;
  }
  
  validateForm(form) {
    let isValid = true;
    
    // Validate all required fields
    const requiredFields = form.querySelectorAll('[required]');
    requiredFields.forEach(field => {
      if (!this.validateField(field)) {
        isValid = false;
      }
    });
    
    return isValid;
  }
  
  async handleSubmit(event) {
    event.preventDefault();
    const form = event.target;
    
    // Don't submit if form is invalid
    if (!this.validateForm(form)) {
      return;
    }
    
    // Get form data
    const formData = new FormData(form);
    const leadData = {};
    
    // Convert FormData to object
    formData.forEach((value, key) => {
      leadData[key] = value;
    });
    
    // Add lead source information
    leadData.source = form.dataset.source || 'Website';
    leadData.timestamp = new Date().toISOString();
    
    // Add UTM parameters if present
    const urlParams = new URLSearchParams(window.location.search);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(param => {
      const value = urlParams.get(param);
      if (value) {
        leadData[param] = value;
      }
    });
    
    // Show loading state
    this.setFormState(form, 'loading');
    
    try {
      // Submit lead data to API
      const response = await fetch(this.options.apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(leadData)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error?.message || 'Failed to submit form');
      }
      
      // Track successful submission
      if (this.options.trackingEnabled) {
        this.trackSubmission(leadData);
      }
      
      // Show success message
      this.setFormState(form, 'success', result.message || 'Thank you! We\'ll be in touch soon.');
      form.reset();
      
    } catch (error) {
      // Log error
      console.error('Lead submission error:', error);
      
      // Show error message
      this.setFormState(form, 'error', error.message || 'Unable to submit form. Please try again later.');
    }
  }
  
  setFormState(form, state, message = '') {
    // Remove any previous state classes
    form.classList.remove('form-loading', 'form-success', 'form-error');
    
    // Remove previous messages
    const previousMessages = form.querySelectorAll('.form-message');
    previousMessages.forEach(el => el.remove());
    
    switch (state) {
      case 'loading':
        form.classList.add('form-loading');
        
        // Disable submit button
        const submitButton = form.querySelector('button[type="submit"]');
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.innerHTML = '<span class="spinner"></span> Sending...';
        }
        break;
        
      case 'success':
        form.classList.add('form-success');
        
        // Create success message
        const successMessage = document.createElement('div');
        successMessage.className = 'form-message success-message';
        successMessage.setAttribute('role', 'alert');
        successMessage.setAttribute('aria-live', 'polite');
        successMessage.innerHTML = `
          <h3>Thank You!</h3>
          <p>${message}</p>
        `;
        
        form.insertAdjacentElement('afterbegin', successMessage);
        break;
        
      case 'error':
        form.classList.add('form-error');
        
        // Re-enable submit button
        const errorSubmitButton = form.querySelector('button[type="submit"]');
        if (errorSubmitButton) {
          errorSubmitButton.disabled = false;
          errorSubmitButton.textContent = 'Try Again';
        }
        
        // Create error message
        const errorMessage = document.createElement('div');
        errorMessage.className = 'form-message error-message';
        errorMessage.setAttribute('role', 'alert');
        errorMessage.setAttribute('aria-live', 'assertive');
        errorMessage.innerHTML = `
          <h3>Submission Error</h3>
          <p>${message}</p>
        `;
        
        form.insertAdjacentElement('afterbegin', errorMessage);
        break;
    }
  }
  
  trackSubmission(leadData) {
    // Google Analytics tracking
    if (typeof gtag === 'function') {
      gtag('event', 'lead_submission', {
        'event_category': leadData.source || 'Website',
        'event_label': leadData.vehicleInterest || 'General'
      });
    }
    
    // Facebook Pixel tracking
    if (typeof fbq === 'function') {
      fbq('track', 'Lead', {
        source: leadData.source || 'Website',
        vehicle: leadData.vehicleInterest || 'General'
      });
    }
  }
}

// Export for use in other files
export default LeadManagement;

// Initialize automatically when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new LeadManagement();
});

