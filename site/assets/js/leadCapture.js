/**
 * Lead Capture System
 * Helps sales professionals collect and manage potential customer leads
 */
class LeadCapture {
  constructor() {
    this.forms = document.querySelectorAll('.lead-capture-form');
    this.popupTriggers = document.querySelectorAll('[data-lead-popup]');
    this.exitIntentEnabled = document.body.hasAttribute('data-exit-intent');
    this.sessionStorage = window.sessionStorage;
    
    this.init();
  }
  
  init() {
    // Initialize all lead capture forms
    this.forms.forEach(form => this.initForm(form));
    
    // Initialize popup triggers
    this.popupTriggers.forEach(trigger => this.initPopupTrigger(trigger));
    
    // Setup exit intent detection if enabled
    if (this.exitIntentEnabled) {
      this.setupExitIntent();
    }
    
    // Setup scroll-based lead forms
    this.setupScrollBasedForms();
  }
  
  initForm(form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleFormSubmission(form);
    });
    
    // Add input validation
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.addEventListener('blur', () => {
        this.validateInput(input);
      });
    });
    
    // Setup privacy policy toggle if present
    const privacyToggle = form.querySelector('.privacy-toggle');
    if (privacyToggle) {
      const privacyContent = form.querySelector('.privacy-content');
      privacyToggle.addEventListener('click', (e) => {
        e.preventDefault();
        privacyContent.classList.toggle('hidden');
      });
    }
  }
  
  validateInput(input) {
    const value = input.value.trim();
    let isValid = true;
    const errorElement = input.parentElement.querySelector('.error-message');
    
    // Remove existing error message
    if (errorElement) {
      errorElement.remove();
    }
    
    // Required field validation
    if (input.hasAttribute('required') && !value) {
      this.showInputError(input, 'This field is required');
      isValid = false;
    }
    
    // Email validation
    if (input.type === 'email' && value && !this.isValidEmail(value)) {
      this.showInputError(input, 'Please enter a valid email address');
      isValid = false;
    }
    
    // Phone validation
    if (input.type === 'tel' && value && !this.isValidPhone(value)) {
      this.showInputError(input, 'Please enter a valid phone number');
      isValid = false;
    }
    
    // Validate specific input types
    if (input.id === 'zip' && value && !this.isValidZip(value)) {
      this.showInputError(input, 'Please enter a valid ZIP code');
      isValid = false;
    }
    
    return isValid;
  }
  
  showInputError(input, message) {
    const error = document.createElement('div');
    error.className = 'error-message';
    error.textContent = message;
    input.parentElement.appendChild(error);
    input.classList.add('input-error');
    
    // Remove error on input focus
    input.addEventListener('focus', () => {
      input.classList.remove('input-error');
      const errorMsg = input.parentElement.querySelector('.error-message');
      if (errorMsg) {
        errorMsg.remove();
      }
    }, { once: true });
  }
  
  isValidEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
  }
  
  isValidPhone(phone) {
    // Allow for various formats: (123) 456-7890, 123-456-7890, 1234567890
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 11;
  }
  
  isValidZip(zip) {
    // US ZIP code validation (5 digits or ZIP+4)
    return /^\d{5}(-\d{4})?$/.test(zip);
  }
  
  handleFormSubmission(form) {
    // Validate all inputs
    const inputs = form.querySelectorAll('input, select, textarea');
    let isFormValid = true;
    
    inputs.forEach(input => {
      if (!this.validateInput(input)) {
        isFormValid = false;
      }
    });
    
    if (!isFormValid) {
      return;
    }
    
    // Show loading state
    const submitButton = form.querySelector('[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.textContent = 'Sending...';
    submitButton.disabled = true;
    
    // Get form data
    const formData = new FormData(form);
    const formType = form.dataset.formType || 'general';
    const leadSource = form.dataset.leadSource || window.location.pathname;
    
    // Add additional tracking info
    formData.append('formType', formType);
    formData.append('leadSource', leadSource);
    formData.append('pageUrl', window.location.href);
    formData.append('timestamp', new Date().toISOString());
    
    // Convert to JSON
    const data = {};
    formData.forEach((value, key) => {
      data[key] = value;
    });
    
    // Send form data
    fetch('/api/leads', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Form submission failed');
      }
      return response.json();
    })
    .then(result => {
      // Show success message
      this.showFormSuccess(form, result);
      
      // Store lead info in session storage to prevent multiple popups
      this.sessionStorage.setItem('leadSubmitted', 'true');
      this.sessionStorage.setItem('leadTimestamp', Date.now());
      
      // Track conversion
      if (typeof gtag === 'function') {
        gtag('event', 'lead_submission', {
          'event_category': 'Lead',
          'event_label': formType,
          'value': 1
        });
      }
    })
    .catch(error => {
      console.error('Error submitting form:', error);
      this.showFormError(form);
    })
    .finally(() => {
      // Restore button state
      submitButton.textContent = originalText;
      submitButton.disabled = false;
    });
  }
  
  showFormSuccess(form, result) {
    const successMessage = document.createElement('div');
    successMessage.className = 'form-success';
    successMessage.innerHTML = `
      <h3>Thank You!</h3>
      <p>Your information has been received. A member of our sales team will contact you shortly.</p>
      ${result.leadId ? `<p>Reference ID: ${result.leadId}</p>` : ''}
    `;
    
    // Replace form with success message
    form.innerHTML = '';
    form.appendChild(successMessage);
    
    // If form is in modal, close it after delay
    const modal = form.closest('.lead-modal');
    if (modal) {
      setTimeout(() => {
        modal.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(modal);
        }, 500);
      }, 3000);
    }
  }
  
  showFormError(form) {
    const errorMessage = document.createElement('div');
    errorMessage.className = 'form-error';
    errorMessage.innerHTML = `
      <h3>Submission Error</h3>
      <p>Sorry, there was a problem submitting your information. Please try again later or call us directly.</p>
      <button class="retry-button">Try Again</button>
    `;
    
    // Add retry button functionality
    const retryButton = errorMessage.querySelector('.retry-button');
    retryButton.addEventListener('click', () => {
      errorMessage.remove();
      form.classList.remove('hidden');
    });
    
    // Show error message
    form.after(errorMessage);
    form.classList.add('hidden');
  }
  
  initPopupTrigger(trigger) {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Don't show popup if already submitted a lead
      if (this.sessionStorage.getItem('leadSubmitted') === 'true') {
        return;
      }
      
      const popupId = trigger.dataset.leadPopup;
      const popupTemplate = document.getElementById(`${popupId}-template`);
      
      if (popupTemplate) {
        this.showPopup(popupTemplate.innerHTML);
      }
    });
  }
  
  showPopup(content) {
    const modal = document.createElement('div');
    modal.className = 'lead-modal';
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-container">
        <button class="modal-close">&times;</button>
        <div class="modal-content">
          ${content}
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add animation
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
    
    // Close button functionality
    const closeButton = modal.querySelector('.modal-close');
    closeButton.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 500);
    });
    
    // Close on overlay click
    const overlay = modal.querySelector('.modal-overlay');
    overlay.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 500);
    });
    
    // Initialize form in popup
    const form = modal.querySelector('.lead-capture-form');
    if (form) {
      this.initForm(form);
    }
  }
  
  setupExitIntent() {
    // Don't setup if already submitted a lead
    if (this.sessionStorage.getItem('leadSubmitted') === 'true') {
      return;
    }
    
    let showOnce = false;
    
    document.addEventListener('mouseout', (e) => {
      // If the mouse leaves the top of the page
      if (!showOnce && e.clientY < 20) {
        const exitTemplate = document.getElementById('exit-intent-template');
        if (exitTemplate) {
          showOnce = true;
          this.showPopup(exitTemplate.innerHTML);
        }
      }
    });
  }
  
  setupScrollBasedForms() {
    const scrollForms = document.querySelectorAll('[data-scroll-reveal]');
    
    if (scrollForms.length === 0) return;
    
    // Don't show if already submitted a lead
    if (this.sessionStorage.getItem('leadSubmitted') === 'true') {
      return;
    }
    
    // Setup intersection observer
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      threshold: 0.2
    });
    
    // Observe each form
    scrollForms.forEach(form => {
      observer.observe(form);
    });
  }
}

// Initialize lead capture system
document.addEventListener('DOMContentLoaded', () => {
  new LeadCapture();
});

export default LeadCapture;
