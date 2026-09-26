import { 
  parseApiError, 
  displayErrorMessage, 
  extractValidationErrors, 
  displayFieldErrors,
  preserveFormData,
  restoreFormData,
  createRetryFunction,
  logError
} from './utils/error-handler';

/**
 * Contact Form Handler
 * Handles the submission of the contact form with proper error handling.
 */
class ContactForm {
  constructor(formSelector = '#contact-form') {
    this.form = document.querySelector(formSelector);
    if (!this.form) return;
    
    this.submitButton = this.form.querySelector('button[type="submit"]');
    this.statusContainer = document.querySelector('#form-status');
    
    // Initialize the form
    this.init();
  }
  
  /**
   * Initialize the form with event listeners and restore any saved data
   */
  init() {
    // Add submit event listener
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
    
    // Restore form data if available (e.g., after a page refresh following an error)
    restoreFormData(this.form);
    
    // Add input validation listeners
    this.addInputValidation();
    
    console.log('Contact form initialized');
  }
  
  /**
   * Add input validation on blur for required fields
   */
  addInputValidation() {
    const requiredFields = this.form.querySelectorAll('[required]');
    
    requiredFields.forEach(field => {
      field.addEventListener('blur', (e) => {
        if (!e.target.value.trim()) {
          // Mark as invalid
          e.target.setAttribute('aria-invalid', 'true');
          
          // Add error message if not exists
          let errorEl = document.getElementById(`${e.target.name}-error`);
          if (!errorEl) {
            errorEl = document.createElement('div');
            errorEl.className = 'field-error-message';
            errorEl.id = `${e.target.name}-error`;
            errorEl.textContent = 'This field is required';
            
            // Add after the field
            e.target.parentNode.insertBefore(errorEl, e.target.nextSibling);
            
            // Connect with aria-describedby
            e.target.setAttribute('aria-describedby', errorEl.id);
          }
        } else {
          // Mark as valid
          e.target.removeAttribute('aria-invalid');
          
          // Remove error message if exists
          const errorEl = document.getElementById(`${e.target.name}-error`);
          if (errorEl) {
            errorEl.remove();
          }
        }
      });
    });
  }
  
  /**
   * Handle form submission with error handling
   * @param {Event} event - The submit event
   */
  async handleSubmit(event) {
    event.preventDefault();
    
    // Clear any existing status messages
    if (this.statusContainer) {
      this.statusContainer.innerHTML = '';
      this.statusContainer.classList.remove('success', 'error');
    }
    
    // Disable submit button and show loading state
    this.setLoading(true);
    
    try {
      // Save form data in case of error
      preserveFormData(this.form);
      
      // Get form data
      const formData = new FormData(this.form);
      const formJson = Object.fromEntries(formData.entries());
      
      // Create a retry function for the fetch call
      const submitWithRetry = createRetryFunction(
        this.submitFormData.bind(this, formJson),
        {
          maxAttempts: 2,
          delay: 1000,
          onRetry: (attempt) => {
            console.log(`Retrying form submission (attempt ${attempt})...`);
            if (this.statusContainer) {
              this.statusContainer.innerHTML = `<p>Connection issue. Retrying... (${attempt}/2)</p>`;
            }
          }
        }
      );
      
      // Submit the form with retry capability
      const response = await submitWithRetry();
      
      // Handle success
      this.handleSuccess(response);
    } catch (error) {
      // Handle error
      this.handleError(error);
    } finally {
      // Re-enable submit button
      this.setLoading(false);
    }
  }
  
  /**
   * Submit form data to the API
   * @param {Object} formData - The form data as JSON
   * @returns {Promise<Object>} The API response
   */
  async submitFormData(formData) {
    const response = await fetch('/api/contact-form', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formData)
    });
    
    if (!response.ok) {
      // Get response as text first to handle potential JSON parse errors
      const text = await response.text();
      let data;
      
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { message: text };
      }
      
      // Create error object with response details
      const error = new Error(data.message || 'Form submission failed');
      error.status = response.status;
      error.data = data;
      throw error;
    }
    
    return response.json();
  }
  
  /**
   * Handle successful form submission
   * @param {Object} response - The API response
   */
  handleSuccess(response) {
    // Reset the form
    this.form.reset();
    
    // Show success message
    if (this.statusContainer) {
      this.statusContainer.innerHTML = `<p>${response.message || 'Your message has been sent successfully!'}</p>`;
      this.statusContainer.classList.add('success');
    }
    
    // Track successful submission (optional)
    if (window.gtag) {
      window.gtag('event', 'form_submission', {
        'event_category': 'contact',
        'event_label': 'Contact Form'
      });
    }
  }
  
  /**
   * Handle form submission errors
   * @param {Error|Response} error - The error object
   */
  handleError(error) {
    // Parse the error
    const parsedError = parseApiError(error);
    logError(parsedError, 'Contact form submission');
    
    // Handle validation errors
    if (parsedError.type === 'validation') {
      // Extract and display field errors
      const fieldErrors = extractValidationErrors(parsedError);
      displayFieldErrors(this.form, fieldErrors);
      
      // Show general error message
      if (this.statusContainer) {
        this.statusContainer.innerHTML = `<p>Please correct the errors in the form.</p>`;
        this.statusContainer.classList.add('error');
      }
    } else {
      // For other types of errors, show a general error message
      if (this.statusContainer) {
        this.statusContainer.innerHTML = `<p>${parsedError.message}</p>`;
        this.statusContainer.classList.add('error');
      }
    }
  }
  
  /**
   * Set loading state for the form
   * @param {boolean} isLoading - Whether the form is in loading state
   */
  setLoading(isLoading) {
    if (this.submitButton) {
      this.submitButton.disabled = isLoading;
      if (isLoading) {
        this.submitButton.setAttribute('aria-busy', 'true');
        this.submitButton.innerHTML = 'Sending...';
      } else {
        this.submitButton.removeAttribute('aria-busy');
        this.submitButton.innerHTML = 'Send Message';
      }
    }
  }
}

// Initialize the contact form when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new ContactForm();
});

export default ContactForm;