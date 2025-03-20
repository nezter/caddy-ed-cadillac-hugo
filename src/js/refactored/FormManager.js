/**
 * FormManager
 * Handles form validation and submission
 */
class FormManager {
  /**
   * Create a new FormManager
   * @param {Calendar} calendar - The parent Calendar instance
   */
  constructor(calendar) {
    this.calendar = calendar;
    this.element = calendar.element;
    
    // Cache DOM elements
    this.customerForm = this.element.querySelector('.customer-info-form');
    this.confirmationContainer = this.element.querySelector('.confirmation-container');
    
    // Bind methods to maintain context
    this.update = this.update.bind(this);
    this.validateForm = this.validateForm.bind(this);
    this.showError = this.showError.bind(this);
    this.clearErrors = this.clearErrors.bind(this);
    this.confirmAppointment = this.confirmAppointment.bind(this);
    this.showConfirmation = this.showConfirmation.bind(this);
    this.handleFormSubmit = this.handleFormSubmit.bind(this);
  }
  
  /**
   * Initialize the form manager
   */
  init() {
    // Register as observer
    this.calendar.addObserver(this);
    
    // Set up form submission handler
    if (this.customerForm) {
      this.customerForm.addEventListener('submit', this.handleFormSubmit);
      
      // Add input validation on blur for required fields
      const requiredFields = this.customerForm.querySelectorAll('[required]');
      requiredFields.forEach(field => {
        field.addEventListener('blur', () => {
          this.validateField(field);
        });
        
        // Clear validation styling on input
        field.addEventListener('input', () => {
          field.classList.remove('error');
          const errorElement = field.parentNode.querySelector('.field-error');
          if (errorElement) {
            errorElement.remove();
          }
        });
      });
    }
  }
  
  /**
   * Update handler called when calendar state changes
   * @param {Object} state - Current calendar state
   */
  update(state) {
    // Update form visibility based on state
    if (state.selectedTime && !state.appointmentConfirmed) {
      this.showForm();
    } else if (!state.selectedTime) {
      this.hideForm();
    }
    
    // Show confirmation if appointment is confirmed
    if (state.appointmentConfirmed) {
      this.showConfirmation(state);
    }
    
    // Populate appointment summary in form
    if (state.selectedDate && state.selectedTime) {
      this.updateAppointmentSummary(state);
    }
    
    // Handle error states
    if (state.errors && state.errors.formSubmission) {
      this.showFormError(state.errors.formSubmission);
    }
  }
  
  /**
   * Show the customer form
   */
  showForm() {
    if (this.customerForm) {
      this.customerForm.classList.add('visible');
    }
  }
  
  /**
   * Hide the customer form
   */
  hideForm() {
    if (this.customerForm) {
      this.customerForm.classList.remove('visible');
    }
  }
  
  /**
   * Update the appointment summary in the form
   * @param {Object} state - Current calendar state
   */
  updateAppointmentSummary(state) {
    const summaryElement = this.element.querySelector('.appointment-summary');
    if (!summaryElement || !state.selectedDate || !state.selectedTime) return;
    
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = state.selectedDate.toLocaleDateString('en-US', dateOptions);
    
    summaryElement.innerHTML = `
      <p><strong>Date:</strong> ${formattedDate}</p>
      <p><strong>Time:</strong> ${state.selectedTime}</p>
    `;
    
    // Add vehicle info if available
    if (state.selectedVehicle) {
      summaryElement.innerHTML += `<p><strong>Vehicle:</strong> ${state.selectedVehicle}</p>`;
    }
    
    // Add appointment type if available
    if (state.appointmentType) {
      summaryElement.innerHTML += `<p><strong>Appointment Type:</strong> ${state.appointmentType}</p>`;
    }
    
    // Make summary visible
    summaryElement.classList.add('visible');
  }
  
  /**
   * Handle form submission
   * @param {Event} event - Form submission event
   */
  handleFormSubmit(event) {
    event.preventDefault();
    
    // Clear any existing errors
    this.clearErrors();
    
    // Get form data
    const form = event.target;
    const formData = new FormData(form);
    
    // Validate form
    const validation = this.validateForm(formData);
    
    if (!validation.isValid) {
      // Show validation errors
      Object.entries(validation.errors).forEach(([field, message]) => {
        const input = form.querySelector(`[name="${field}"]`);
        if (input) {
          this.showError(input, message);
        }
      });
      return;
    }
    
    // Set loading state
    this.setLoading(true);
    
    // Collect form data
    const state = this.calendar.getState();
    const appointmentData = {
      date: state.selectedDate,
      time: state.selectedTime,
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      message: formData.get('message') || '',
      vehicle: state.selectedVehicle || '',
      appointmentType: state.appointmentType || 'Test Drive'
    };
    
    // Confirm appointment
    this.confirmAppointment(appointmentData);
  }
  
  /**
   * Set loading state for the form
   * @param {boolean} isLoading - Whether to show loading state
   */
  setLoading(isLoading) {
    const submitButton = this.customerForm?.querySelector('button[type="submit"]');
    if (!submitButton) return;
    
    if (isLoading) {
      submitButton.disabled = true;
      submitButton.setAttribute('aria-busy', 'true');
      submitButton.innerHTML = '<span class="spinner"></span> Confirming...';
    } else {
      submitButton.disabled = false;
      submitButton.removeAttribute('aria-busy');
      submitButton.innerHTML = 'Confirm Appointment';
    }
  }
  
  /**
   * Validate form data
   * @param {FormData} formData - The form data to validate
   * @returns {Object} Validation result with errors object and isValid flag
   */
  validateForm(formData) {
    const errors = {};
    
    // Name validation
    const name = formData.get('name');
    if (!name || name.trim() === '') {
      errors.name = 'Name is required';
    }
    
    // Email validation
    const email = formData.get('email');
    if (!email || !this.validateEmail(email)) {
      errors.email = 'Valid email is required';
    }
    
    // Phone validation
    const phone = formData.get('phone');
    if (!phone || !this.validatePhone(phone)) {
      errors.phone = 'Valid phone number is required';
    }
    
    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
  
  /**
   * Validate a specific form field
   * @param {HTMLElement} field - The field to validate
   * @returns {boolean} Whether the field is valid
   */
  validateField(field) {
    // Skip if no field
    if (!field) return true;
    
    let isValid = true;
    let errorMessage = '';
    
    // Check required fields
    if (field.hasAttribute('required') && !field.value.trim()) {
      isValid = false;
      errorMessage = 'This field is required';
    } 
    // Email validation
    else if (field.type === 'email' && field.value.trim()) {
      if (!this.validateEmail(field.value)) {
        isValid = false;
        errorMessage = 'Please enter a valid email address';
      }
    }
    // Phone validation
    else if (field.name === 'phone' && field.value.trim()) {
      if (!this.validatePhone(field.value)) {
        isValid = false;
        errorMessage = 'Please enter a valid phone number';
      }
    }
    
    // Show or clear error
    if (!isValid) {
      this.showError(field, errorMessage);
      return false;
    } else {
      field.classList.remove('error');
      const errorElement = field.parentNode.querySelector('.field-error');
      if (errorElement) {
        errorElement.remove();
      }
      return true;
    }
  }
  
  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} Whether the email is valid
   */
  validateEmail(email) {
    // Basic email validation regex
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  /**
   * Validate phone number format
   * @param {string} phone - Phone number to validate
   * @returns {boolean} Whether the phone number is valid
   */
  validatePhone(phone) {
    // Basic phone validation - accepts various formats
    const phoneRegex = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }
  
  /**
   * Display an error message for a form field
   * @param {HTMLElement} input - The input element
   * @param {string} message - The error message
   */
  showError(input, message) {
    // Add error class to input
    input.classList.add('error');
    
    // Check if error message already exists
    let errorElement = input.parentNode.querySelector('.field-error');
    
    // Create error message if it doesn't exist
    if (!errorElement) {
      errorElement = document.createElement('div');
      errorElement.className = 'field-error';
      input.parentNode.insertBefore(errorElement, input.nextSibling);
    }
    
    // Set error message
    errorElement.textContent = message;
    
    // Set aria attributes for accessibility
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', `${input.name}-error`);
    errorElement.id = `${input.name}-error`;
  }
  
  /**
   * Display a general form error message
   * @param {string} message - Error message to display
   */
  showFormError(message) {
    if (!this.customerForm) return;
    
    // Check if error container exists
    let errorContainer = this.customerForm.querySelector('.form-error-message');
    
    // Create it if it doesn't exist
    if (!errorContainer) {
      errorContainer = document.createElement('div');
      errorContainer.className = 'form-error-message';
      this.customerForm.insertBefore(errorContainer, this.customerForm.firstChild);
    }
    
    // Set error message
    errorContainer.textContent = message;
    errorContainer.setAttribute('role', 'alert');
    
    // Reset loading state
    this.setLoading(false);
  }
  
  /**
   * Clear all form errors
   */
  clearErrors() {
    if (!this.customerForm) return;
    
    // Remove field errors
    const errorFields = this.customerForm.querySelectorAll('.error');
    errorFields.forEach(field => {
      field.classList.remove('error');
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    });
    
    // Remove error messages
    const errorMessages = this.customerForm.querySelectorAll('.field-error');
    errorMessages.forEach(el => el.remove());
    
    // Remove form error message
    const formError = this.customerForm.querySelector('.form-error-message');
    if (formError) {
      formError.remove();
    }
  }
  
  /**
   * Process appointment confirmation
   * @param {Object} appointmentData - The appointment data
   */
  confirmAppointment(appointmentData) {
    // Submit appointment data to API
    this.submitAppointment(appointmentData)
      .then(response => {
        // Update calendar state with confirmation
        this.calendar.updateState({
          appointmentConfirmed: true,
          appointmentDetails: appointmentData,
          confirmationNumber: response.confirmationNumber || this.generateConfirmationNumber()
        });
        
        // Reset loading state
        this.setLoading(false);
      })
      .catch(error => {
        console.error('Error confirming appointment:', error);
        
        // Update state with error
        this.calendar.updateState({
          errors: {
            ...this.calendar.getState().errors,
            formSubmission: 'Failed to confirm appointment. Please try again or call us directly.'
          }
        });
        
        // Reset loading state
        this.setLoading(false);
      });
  }
  
  /**
   * Submit appointment data to API
   * @param {Object} appointmentData - The appointment data
   * @returns {Promise} Promise resolving to API response
   */
  async submitAppointment(appointmentData) {
    try {
      // Prepare data for API
      const formattedData = {
        ...appointmentData,
        date: appointmentData.date.toISOString().split('T')[0],
      };
      
      // Make API request
      const response = await fetch('/api/schedule-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formattedData)
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      // For demo/development, create a simulated success response
      if (this.calendar.options.debug || process.env.NODE_ENV === 'development') {
        console.warn('Using simulated appointment confirmation due to API error:', error);
        return new Promise(resolve => {
          setTimeout(() => {
            resolve({
              success: true,
              confirmationNumber: this.generateConfirmationNumber()
            });
          }, 1000);
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Generate a random confirmation number (for fallback/testing)
   * @returns {string} Random confirmation number
   */
  generateConfirmationNumber() {
    return 'CONF-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  }
  
  /**
   * Show confirmation message
   * @param {Object} state - Current calendar state
   */
  showConfirmation(state) {
    if (!this.confirmationContainer) return;
    
    // Hide the form
    this.hideForm();
    
    // Format date for display
    const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const formattedDate = state.selectedDate.toLocaleDateString('en-US', dateOptions);
    
    // Build confirmation HTML
    this.confirmationContainer.innerHTML = `
      <div class="confirmation-content">
        <h2>Your appointment is confirmed!</h2>
        <p class="confirmation-number">Confirmation #: <strong>${state.confirmationNumber}</strong></p>
        <div class="appointment-details">
          <p><strong>Date:</strong> ${formattedDate}</p>
          <p><strong>Time:</strong> ${state.selectedTime}</p>
          <p><strong>Name:</strong> ${state.appointmentDetails.name}</p>
          <p><strong>Email:</strong> ${state.appointmentDetails.email}</p>
          <p><strong>Phone:</strong> ${state.appointmentDetails.phone}</p>
        </div>
        <p class="confirmation-message">
          We'll send a confirmation email with these details shortly.
          If you need to make any changes, please contact us directly.
        </p>
        <button class="btn reset-scheduler">Schedule Another Appointment</button>
      </div>
    `;
    
    // Show the confirmation
    this.confirmationContainer.classList.add('visible');
    
    // Add event listener to reset button
    const resetButton = this.confirmationContainer.querySelector('.reset-scheduler');
    if (resetButton) {
      resetButton.addEventListener('click', () => {
        this.calendar.reset();
        this.confirmationContainer.classList.remove('visible');
      });
    }
  }
}

export default FormManager;
