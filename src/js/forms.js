// Form management component for Caddy Ed website

/**
 * Initialize all forms on the website with validation and submission handling
 */
export function initForms() {
  const forms = document.querySelectorAll('.ed-form');
  forms.forEach(form => {
    const formType = form.dataset.formType || 'contact';
    
    // Add validation and submission handling
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      
      if (validateForm(form)) {
        submitForm(form, formType);
      }
    });
    
    // Add field validation on blur
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.addEventListener('blur', () => {
        validateField(input);
      });
    });
  });
  
  // Initialize test drive form if present with date picker
  initTestDriveForm();
  
  // Initialize trade-in form if present with vehicle selection
  initTradeInForm();
}

/**
 * Initialize the test drive scheduling form with date and time selection
 */
function initTestDriveForm() {
  const testDriveForm = document.querySelector('.ed-form[data-form-type="testDrive"]');
  if (!testDriveForm) return;
  
  // Set up date picker for preferred date
  const dateInput = testDriveForm.querySelector('input[name="preferredDate"]');
  if (dateInput) {
    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
    
    // Set max date to 30 days from today
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    dateInput.setAttribute('max', maxDate.toISOString().split('T')[0]);
  }
  
  // Populate time slots
  const timeSelect = testDriveForm.querySelector('select[name="preferredTime"]');
  if (timeSelect) {
    // Clear existing options
    timeSelect.innerHTML = '<option value="">Select a time</option>';
    
    // Add time slots from 9 AM to 6 PM, every 30 minutes
    for (let hour = 9; hour <= 18; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        if (hour === 18 && minute > 0) continue; // Don't go past 6 PM
        
        const period = hour < 12 ? 'AM' : 'PM';
        const displayHour = hour <= 12 ? hour : hour - 12;
        const displayMinute = minute === 0 ? '00' : minute;
        const timeValue = `${displayHour}:${displayMinute} ${period}`;
        
        const option = document.createElement('option');
        option.value = timeValue;
        option.textContent = timeValue;
        timeSelect.appendChild(option);
      }
    }
  }
  
  // Check if there's a vehicle parameter in the URL
  const urlParams = new URLSearchParams(window.location.search);
  const vehicleId = urlParams.get('vehicle');
  
  if (vehicleId) {
    const vehicleInput = testDriveForm.querySelector('input[name="vehicle"]');
    if (vehicleInput) {
      vehicleInput.value = vehicleId;
    }
  }
}

/**
 * Initialize the trade-in form with vehicle condition options
 */
function initTradeInForm() {
  const tradeInForm = document.querySelector('.ed-form[data-form-type="tradeIn"]');
  if (!tradeInForm) return;
  
  // Set up current year as max for vehicle year
  const yearInput = tradeInForm.querySelector('input[name="currentYear"]');
  if (yearInput) {
    const currentYear = new Date().getFullYear();
    yearInput.setAttribute('max', currentYear.toString());
    yearInput.setAttribute('min', (currentYear - 30).toString());
  }
}

/**
 * Validate a single form field
 * @param {HTMLElement} field - Form field element
 * @returns {boolean} - True if valid, false otherwise
 */
function validateField(field) {
  // Remove existing validation messages
  const existingMessage = field.parentNode.querySelector('.validation-message');
  if (existingMessage) {
    existingMessage.remove();
  }
  
  // Check if field is required and empty
  if (field.required && !field.value.trim()) {
    showValidationError(field, 'This field is required');
    return false;
  }
  
  // Email validation
  if (field.type === 'email' && field.value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(field.value)) {
      showValidationError(field, 'Please enter a valid email address');
      return false;
    }
  }
  
  // Phone validation
  if (field.name === 'phone' && field.value) {
    const phoneRegex = /^\(?(\d{3})\)?[- ]?(\d{3})[- ]?(\d{4})$/;
    if (!phoneRegex.test(field.value)) {
      showValidationError(field, 'Please enter a valid phone number');
      return false;
    }
  }
  
  // Valid field
  field.classList.remove('invalid');
  field.classList.add('valid');
  return true;
}

/**
 * Display validation error for a field
 * @param {HTMLElement} field - Form field with error
 * @param {string} message - Error message
 */
function showValidationError(field, message) {
  field.classList.remove('valid');
  field.classList.add('invalid');
  
  const errorElement = document.createElement('div');
  errorElement.className = 'validation-message';
  errorElement.textContent = message;
  
  field.parentNode.appendChild(errorElement);
}

/**
 * Validate the entire form before submission
 * @param {HTMLFormElement} form - Form to validate
 * @returns {boolean} - True if all fields are valid
 */
function validateForm(form) {
  const fields = form.querySelectorAll('input, select, textarea');
  let isValid = true;
  
  fields.forEach(field => {
    if (!validateField(field)) {
      isValid = false;
    }
  });
  
  return isValid;
}

/**
 * Submit form data to the appropriate Netlify function
 * @param {HTMLFormElement} form - Form to submit
 * @param {string} formType - Type of form (contact, testDrive, tradeIn)
 */
async function submitForm(form, formType) {
  // Show loading state
  form.classList.add('loading');
  const submitButton = form.querySelector('button[type="submit"]');
  const originalText = submitButton.textContent;
  submitButton.textContent = 'Sending...';
  submitButton.disabled = true;
  
  // Clear any existing response messages
  const existingResponse = form.querySelector('.form-response');
  if (existingResponse) {
    existingResponse.remove();
  }
  
  // Collect form data
  const formData = new FormData(form);
  const formDataObj = {};
  formData.forEach((value, key) => {
    formDataObj[key] = value;
  });
  
  // Add form type to data
  formDataObj.formType = formType;
  
  try {
    let endpoint;
    
    // Determine which endpoint to use based on form type
    switch (formType) {
      case 'testDrive':
      case 'tradeIn':
        endpoint = '/.netlify/functions/lead-management';
        break;
      case 'contact':
      default:
        endpoint = '/.netlify/functions/contact-form';
        break;
    }
    
    // Submit form data
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(formDataObj)
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // Show success message
      showFormResponse(form, result.message, 'success');
      form.reset(); // Clear the form
    } else {
      // Show error message
      showFormResponse(form, result.message || 'Something went wrong. Please try again.', 'error');
    }
    
  } catch (error) {
    console.error('Error submitting form:', error);
    showFormResponse(form, 'Failed to submit form. Please try again later.', 'error');
  } finally {
    // Reset form loading state
    form.classList.remove('loading');
    submitButton.textContent = originalText;
    submitButton.disabled = false;
  }
}

/**
 * Display response message after form submission
 * @param {HTMLFormElement} form - Form element
 * @param {string} message - Response message
 * @param {string} type - Message type (success/error)
 */
function showFormResponse(form, message, type) {
  const responseElement = document.createElement('div');
  responseElement.className = `form-response ${type}`;
  responseElement.textContent = message;
  
  // Insert after form or append to form
  if (form.nextElementSibling) {
    form.parentNode.insertBefore(responseElement, form.nextElementSibling);
  } else {
    form.parentNode.appendChild(responseElement);
  }
  
  // If success, scroll to response message
  if (type === 'success') {
    responseElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
