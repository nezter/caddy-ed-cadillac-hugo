/**
 * Form handling functionality for the website
 */

// Form validation helpers
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(String(email).toLowerCase());
}

function validatePhone(phone) {
  const re = /^[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}$/;
  return re.test(String(phone).replace(/\s/g, ''));
}

function validateRequired(value) {
  return value.trim() !== '';
}

// Initialize all forms with client-side validation
export function initForms() {
  const forms = document.querySelectorAll('form[data-form-type]');
  
  forms.forEach(form => {
    const requiredFields = form.querySelectorAll('[required]');
    const submitButton = form.querySelector('[type="submit"]');
    
    // Add validation on blur for each required field
    requiredFields.forEach(field => {
      field.addEventListener('blur', () => {
        validateField(field);
      });
      
      field.addEventListener('input', () => {
        // Remove error state on input
        field.classList.remove('error');
        const errorMsg = field.parentNode.querySelector('.error-message');
        if (errorMsg) errorMsg.remove();
      });
    });
    
    // Add form submission handler
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Validate all fields
      let isValid = true;
      requiredFields.forEach(field => {
        if (!validateField(field)) {
          isValid = false;
        }
      });
      
      if (isValid) {
        submitForm(form);
      }
    });
  });
  
  // Initialize datepicker if available
  const datePickers = document.querySelectorAll('.datepicker');
  if (datePickers.length > 0 && window.flatpickr) {
    datePickers.forEach(picker => {
      flatpickr(picker, {
        minDate: "today",
        dateFormat: "m/d/Y"
      });
    });
  }
}

function validateField(field) {
  const value = field.value;
  const fieldType = field.type;
  const name = field.name;
  
  let isValid = true;
  let errorMessage = '';
  
  // Remove any existing error message
  const existingError = field.parentNode.querySelector('.error-message');
  if (existingError) existingError.remove();
  
  // Validate based on field type
  if (fieldType === 'email') {
    isValid = validateEmail(value);
    errorMessage = 'Please enter a valid email address';
  } else if (name === 'phone' || fieldType === 'tel') {
    isValid = validatePhone(value);
    errorMessage = 'Please enter a valid phone number';
  } else if (field.hasAttribute('required')) {
    isValid = validateRequired(value);
    errorMessage = 'This field is required';
  }
  
  // Show error if invalid
  if (!isValid) {
    field.classList.add('error');
    const errorSpan = document.createElement('span');
    errorSpan.className = 'error-message';
    errorSpan.textContent = errorMessage;
    field.parentNode.appendChild(errorSpan);
  } else {
    field.classList.remove('error');
  }
  
  return isValid;
}

// Submit form to Netlify function
function submitForm(form) {
  const formType = form.dataset.formType;
  const submitButton = form.querySelector('[type="submit"]');
  const originalButtonText = submitButton.textContent;
  
  // Show loading state
  submitButton.textContent = 'Sending...';
  submitButton.disabled = true;
  
  // Create form data object
  const formData = new FormData(form);
  const data = Object.fromEntries(formData);
  data.formType = formType;
  
  // Submit to appropriate endpoint
  let endpoint = '/.netlify/functions/lead-management';
  if (formType === 'contact') {
    endpoint = '/.netlify/functions/contact-form';
  }
  
  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  })
  .then(response => response.json())
  .then(result => {
    if (result.success) {
      form.reset();
      showFormSuccess(form, result.message);
    } else {
      showFormError(form, result.message || 'There was an error submitting the form. Please try again.');
    }
  })
  .catch(error => {
    showFormError(form, 'There was an error submitting the form. Please try again later.');
    console.error('Form submission error:', error);
  })
  .finally(() => {
    // Restore button state
    submitButton.textContent = originalButtonText;
    submitButton.disabled = false;
  });
}

// Show form submission responses
function showFormSuccess(form, message) {
  const responseContainer = getResponseContainer(form);
  responseContainer.className = 'form-response success';
  responseContainer.textContent = message;
  
  // Scroll to response
  responseContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showFormError(form, message) {
  const responseContainer = getResponseContainer(form);
  responseContainer.className = 'form-response error';
  responseContainer.textContent = message;
}

function getResponseContainer(form) {
  let responseContainer = form.querySelector('.form-response');
  
  if (!responseContainer) {
    responseContainer = document.createElement('div');
    responseContainer.className = 'form-response';
    form.prepend(responseContainer);
  }
  
  return responseContainer;
}

// Initialize forms on page load
document.addEventListener('DOMContentLoaded', initForms);
