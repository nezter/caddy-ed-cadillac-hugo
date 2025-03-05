/**
 * Form handling for contact and lead generation forms
 */

class FormHandler {
  constructor() {
    this.forms = document.querySelectorAll('form.lead-form');
    this.init();
  }

  init() {
    if (!this.forms || this.forms.length === 0) return;
    
    this.forms.forEach(form => {
      form.addEventListener('submit', this.handleSubmit.bind(this));
      
      // Enable live validation
      form.querySelectorAll('input, textarea, select').forEach(field => {
        field.addEventListener('blur', () => this.validateField(field));
      });
    });
    
    // Handle any URL parameters to pre-fill forms
    this.populateFormFromUrlParams();
  }

  validateField(field) {
    const { value, required, type, name, pattern } = field;
    let isValid = true;
    let errorMessage = '';
    
    // Clear previous error
    this.clearFieldError(field);
    
    // Required check
    if (required && !value.trim()) {
      isValid = false;
      errorMessage = 'This field is required';
    } 
    // Email validation
    else if (type === 'email' && value.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value)) {
        isValid = false;
        errorMessage = 'Please enter a valid email address';
      }
    }
    // Phone validation
    else if (name === 'phone' && value.trim()) {
      const phoneRegex = /^\(?([0-9]{3})\)?[-. ]?([0-9]{3})[-. ]?([0-9]{4})$/;
      if (!phoneRegex.test(value)) {
        isValid = false;
        errorMessage = 'Please enter a valid phone number';
      }
    }
    // Pattern validation
    else if (pattern && value.trim()) {
      const regex = new RegExp(pattern);
      if (!regex.test(value)) {
        isValid = false;
        errorMessage = field.dataset.errorMsg || 'Please enter a valid value';
      }
    }
    
    if (!isValid) {
      this.showFieldError(field, errorMessage);
    }
    
    return isValid;
  }

  showFieldError(field, message) {
    const errorEl = document.createElement('div');
    errorEl.className = 'field-error';
    errorEl.textContent = message;
    field.classList.add('has-error');
    
    const parent = field.parentElement;
    parent.appendChild(errorEl);
  }

  clearFieldError(field) {
    const parent = field.parentElement;
    const errorEl = parent.querySelector('.field-error');
    
    field.classList.remove('has-error');
    if (errorEl) {
      errorEl.remove();
    }
  }

  validateForm(form) {
    const fields = form.querySelectorAll('input, textarea, select');
    let isValid = true;
    
    fields.forEach(field => {
      if (!this.validateField(field)) {
        isValid = false;
      }
    });
    
    return isValid;
  }

  async handleSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const formData = new FormData(form);
    const formType = form.dataset.formType || 'contact';
    
    // Validate form
    if (!this.validateForm(form)) {
      return;
    }
    
    // Disable submit button and show loading state
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner"></span> Sending...';
    }
    
    try {
      // Convert FormData to JSON object
      const jsonData = {};
      formData.forEach((value, key) => {
        jsonData[key] = value;
      });
      
      // Add form type to the data
      jsonData.formType = formType;
      
      // Submit to Netlify function
      const response = await fetch('/.netlify/functions/lead-management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(jsonData)
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.message || 'Form submission failed');
      }
      
      // Show success message
      form.innerHTML = `
        <div class="form-success">
          <h3>Thank You!</h3>
          <p>${result.message || 'Your message has been sent successfully. Ed will contact you shortly.'}</p>
        </div>
      `;
      
      // Trigger conversion tracking
      if (window.gtag) {
        gtag('event', 'form_submission', {
          'event_category': 'lead',
          'event_label': formType
        });
      }
      
    } catch (error) {
      console.error('Form submission error:', error);
      
      // Show error message
      const errorContainer = form.querySelector('.form-error') || document.createElement('div');
      errorContainer.className = 'form-error';
      errorContainer.innerHTML = `
        <p>Sorry, there was a problem submitting your information. Please try again or call us directly.</p>
        <p class="error-details">${error.message}</p>
      `;
      
      if (!form.querySelector('.form-error')) {
        form.prepend(errorContainer);
      }
      
      // Re-enable submit button
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit';
      }
    }
  }

  populateFormFromUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    
    this.forms.forEach(form => {
      // Loop through all URL parameters
      for (const [key, value] of urlParams.entries()) {
        const field = form.querySelector(`[name="${key}"]`);
        if (field) {
          field.value = value;
          // Trigger validation
          this.validateField(field);
        }
      }
    });
  }
}

// Initialize forms on page load
document.addEventListener('DOMContentLoaded', () => {
  new FormHandler();
});

export default FormHandler;
