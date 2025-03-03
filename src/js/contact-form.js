/**
 * Contact Form Handler
 * Manages contact form submission and validation
 */

class ContactForm {
  constructor(options = {}) {
    this.formSelector = options.formSelector || '.contact-form form';
    this.successMessage = options.successMessage || 'Thank you for contacting us! We will get back to you shortly.';
    this.errorMessage = options.errorMessage || 'There was a problem submitting your form. Please try again or contact us directly.';
    this.recaptchaEnabled = options.recaptchaEnabled || false;
    this.endpoint = options.endpoint || '/api/contact';
    
    this.initialize();
  }
  
  initialize() {
    const forms = document.querySelectorAll(this.formSelector);
    forms.forEach(form => {
      form.addEventListener('submit', this.handleSubmit.bind(this));
      this.initializeFormValidation(form);
    });

    // Add honeypot field to prevent spam
    this.addHoneypotField();
    
    // Initialize custom dropdowns if they exist
    this.initializeCustomDropdowns();

    // Initialize file uploads if they exist
    this.initializeFileUploads();
  }
  
  handleSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    if (!this.validateForm(form)) return;
    
    // Check honeypot field
    const honeypot = form.querySelector('.honeypot-field');
    if (honeypot && honeypot.value) {
      console.log('Honeypot field is filled, likely a bot submission');
      this.simulateSuccess(form);
      return;
    }
    
    // Show loading state
    const submitBtn = form.querySelector('[type="submit"]');
    let originalBtnText = '';
    if (submitBtn) {
      originalBtnText = submitBtn.textContent;
      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;
    }
    
    // Get form data
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Remove honeypot data
    if (data['website'] !== undefined) {
      delete data['website'];
    }

    // Check reCAPTCHA if enabled
    if (this.recaptchaEnabled && window.grecaptcha) {
      const recaptchaResponse = grecaptcha.getResponse();
      if (!recaptchaResponse) {
        this.showInputError(form.querySelector('.g-recaptcha'), null, 'Please complete the reCAPTCHA verification');
        
        // Reset button
        if (submitBtn) {
          submitBtn.textContent = originalBtnText;
          submitBtn.disabled = false;
        }
        return;
      }
      
      data['g-recaptcha-response'] = recaptchaResponse;
    }
    
    // Submit the form data using fetch API
    fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Network response was not ok');
      }
      return response.json();
    })
    .then(result => {
      this.showSuccess(form);
    })
    .catch(error => {
      console.error('Form submission error:', error);
      this.showError(form);
      
      // Reset button
      if (submitBtn) {
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      }
    });
  }
  
  simulateSuccess(form) {
    // This gives the illusion of successful submission to bots
    setTimeout(() => {
      this.showSuccess(form);
    }, 1000);
  }
  
  showSuccess(form) {
    // Clear the form
    form.reset();
    
    // Show success message
    const formResponse = document.createElement('div');
    formResponse.className = 'form-success';
    formResponse.innerHTML = `<p>${this.successMessage}</p>`;
    
    // Replace form content or append message
    const formContainer = form.closest('.form-container') || form.parentNode;
    if (formContainer) {
      // Keep the heading if it exists
      const heading = formContainer.querySelector('h1, h2, h3, h4, h5, h6');
      if (heading) {
        formContainer.innerHTML = '';
        formContainer.appendChild(heading.cloneNode(true));
        formContainer.appendChild(formResponse);
      } else {
        formContainer.innerHTML = '';
        formContainer.appendChild(formResponse);
      }
    } else {
      // If we can't find a container, just append to the form
      form.innerHTML = '';
      form.appendChild(formResponse);
    }

    // Scroll to success message
    formResponse.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Optional: Add animation
    formResponse.style.opacity = '0';
    formResponse.style.transition = 'opacity 0.5s ease-in-out';
    setTimeout(() => {
      formResponse.style.opacity = '1';
    }, 10);

    // Reset reCAPTCHA if it exists
    if (this.recaptchaEnabled && window.grecaptcha) {
      grecaptcha.reset();
    }
  }
  
  showError(form) {
    // Remove any existing error messages
    const existingError = form.querySelector('.form-error');
    if (existingError) {
      existingError.remove();
    }
    
    // Create and show error message
    const errorMsg = document.createElement('div');
    errorMsg.className = 'form-error';
    errorMsg.innerHTML = `<p>${this.errorMessage}</p>`;
    form.prepend(errorMsg);
    
    // Scroll to error
    errorMsg.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Optional: Add animation
    errorMsg.style.opacity = '0';
    errorMsg.style.transition = 'opacity 0.5s ease-in-out';
    setTimeout(() => {
      errorMsg.style.opacity = '1';
    }, 10);
  }
  
  addHoneypotField() {
    const forms = document.querySelectorAll(this.formSelector);
    forms.forEach(form => {
      const honeypotField = document.createElement('div');
      honeypotField.style.opacity = '0';
      honeypotField.style.position = 'absolute';
      honeypotField.style.top = '0';
      honeypotField.style.left = '0';
      honeypotField.style.height = '0';
      honeypotField.style.width = '0';
      honeypotField.style.zIndex = '-1';
      honeypotField.style.overflow = 'hidden';
      honeypotField.innerHTML = `
        <label>Website (Leave this empty)
          <input class="honeypot-field" type="text" name="website" tabindex="-1" autocomplete="off">
        </label>
      `;
      form.appendChild(honeypotField);
    });
  }
  
  initializeFormValidation(form) {
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      // Skip honeypot field
      if (input.classList.contains('honeypot-field')) return;
      
      input.addEventListener('blur', () => {
        this.validateInput(input);
      });
      
      // For select elements, also check on change
      if (input.tagName === 'SELECT') {
        input.addEventListener('change', () => {
          this.validateInput(input);
        });
      }

      // For checkboxes and radios
      if (input.type === 'checkbox' || input.type === 'radio') {
        input.addEventListener('change', () => {
          this.validateInput(input);
        });
      }
    });

    // Add real-time validation for inputs marked as 'data-validate-live'
    const liveValidationInputs = form.querySelectorAll('[data-validate-live]');
    liveValidationInputs.forEach(input => {
      input.addEventListener('input', () => {
        this.validateInput(input);
      });
    });
  }
  
  validateInput(input) {
    const isRequired = input.hasAttribute('required');
    const value = input.value.trim();
    let isValid = true;
    const errorMessage = input.nextElementSibling?.classList.contains('error-message') 
      ? input.nextElementSibling 
      : null;
    
    // Skip validation for honeypot
    if (input.classList.contains('honeypot-field')) return true;
    
    // Handle different input types
    if (input.type === 'checkbox' || input.type === 'radio') {
      // For checkbox groups with the same name, check if at least one is checked
      if (isRequired) {
        const checkboxGroup = document.querySelectorAll(`input[name="${input.name}"]`);
        const anyChecked = Array.from(checkboxGroup).some(cb => cb.checked);
        
        // Find the container for the group
        const groupContainer = input.closest('.checkbox-group') || input.closest('.radio-group');
        
        if (!anyChecked) {
          isValid = false;
          if (groupContainer) {
            this.showInputError(groupContainer, null, 'Please select at least one option');
          } else {
            this.showInputError(input, errorMessage, 'This selection is required');
          }
          return false;
        } else if (groupContainer) {
          // Clear any group errors
          const groupError = groupContainer.querySelector('.error-message');
          if (groupError) {
            groupError.remove();
          }
          groupContainer.classList.remove('invalid');
        }
      }
      return true;
    }
    
    // Check if field is required and empty
    if (isRequired && value === '') {
      isValid = false;
      this.showInputError(input, errorMessage, 'This field is required');
      return false;
    }
    
    // Validate based on input type
    switch(input.type) {
      case 'email':
        if (value !== '') {
          const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailPattern.test(value)) {
            isValid = false;
            this.showInputError(input, errorMessage, 'Please enter a valid email address');
            return false;
          }
        }
        break;
        
      case 'tel':
        if (value !== '') {
          const phonePattern = /^[0-9\-\+\s\(\)]{10,15}$/;
          if (!phonePattern.test(value)) {
            isValid = false;
            this.showInputError(input, errorMessage, 'Please enter a valid phone number');
            return false;
          }
        }
        break;
        
      case 'number':
        if (value !== '') {
          const min = input.hasAttribute('min') ? parseFloat(input.getAttribute('min')) : null;
          const max = input.hasAttribute('max') ? parseFloat(input.getAttribute('max')) : null;
          const numValue = parseFloat(value);
          
          if (isNaN(numValue)) {
            isValid = false;
            this.showInputError(input, errorMessage, 'Please enter a valid number');
            return false;
          }
          
          if (min !== null && numValue < min) {
            isValid = false;
            this.showInputError(input, errorMessage, `Value must be at least ${min}`);
            return false;
          }
          
          if (max !== null && numValue > max) {
            isValid = false;
            this.showInputError(input, errorMessage, `Value cannot exceed ${max}`);
            return false;
          }
        }
        break;
        
      case 'url':
        if (value !== '') {
          try {
            new URL(value);
          } catch {
            isValid = false;
            this.showInputError(input, errorMessage, 'Please enter a valid URL');
            return false;
          }
        }
        break;
        
      case 'date':
        if (value !== '') {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            isValid = false;
            this.showInputError(input, errorMessage, 'Please enter a valid date');
            return false;
          }
          
          // Check min/max dates
          if (input.min) {
            const minDate = new Date(input.min);
            if (date < minDate) {
              isValid = false;
              this.showInputError(input, errorMessage, `Date must be on or after ${input.min}`);
              return false;
            }
          }
          
          if (input.max) {
            const maxDate = new Date(input.max);
            if (date > maxDate) {
              isValid = false;
              this.showInputError(input, errorMessage, `Date must be on or before ${input.max}`);
              return false;
            }
          }
        }
        break;
    }
    
    // Check for custom validation pattern
    if (input.pattern && value !== '') {
      const pattern = new RegExp(input.pattern);
      if (!pattern.test(value)) {
        isValid = false;
        this.showInputError(input, errorMessage, input.title || 'Please match the requested format');
        return false;
      }
    }
    
    // Check for data-min-length and data-max-length attributes
    if (value !== '') {
      const minLength = input.getAttribute('data-min-length');
      const maxLength = input.getAttribute('data-max-length');
      
      if (minLength && value.length < parseInt(minLength)) {
        isValid = false;
        this.showInputError(input, errorMessage, `Must be at least ${minLength} characters`);
        return false;
      }
      
      if (maxLength && value.length > parseInt(maxLength)) {
        isValid = false;
        this.showInputError(input, errorMessage, `Cannot exceed ${maxLength} characters`);
        return false;
      }
    }
    
    // Clear error if valid
    if (isValid) {
      input.classList.remove('invalid');
      if (errorMessage) {
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';
      }
    }
    
    return isValid;
  }
  
  showInputError(input, errorMessage, text) {
    input.classList.add('invalid');
    
    if (!errorMessage) {
      errorMessage = document.createElement('div');
      errorMessage.className = 'error-message';
      input.parentNode.insertBefore(errorMessage, input.nextSibling);
    }
    
    errorMessage.textContent = text;
    errorMessage.style.display = 'block';
  }
  
  validateForm(form) {
    const inputs = form.querySelectorAll('input, select, textarea');
    let isFormValid = true;
    
    inputs.forEach(input => {
      // Skip honeypot field
      if (input.classList.contains('honeypot-field')) return;
      
      if (!this.validateInput(input)) {
        isFormValid = false;
      }
    });
    
    return isFormValid;
  }
  
  initializeCustomDropdowns() {
    const customDropdowns = document.querySelectorAll('.custom-dropdown');
    
    customDropdowns.forEach(dropdown => {
      const select = dropdown.querySelector('select');
      if (!select) return;
      
      // Create custom dropdown elements
      const selectedValue = document.createElement('div');
      selectedValue.className = 'selected-value';
      selectedValue.textContent = select.options[select.selectedIndex].text;
      
      const dropdownOptions = document.createElement('div');
      dropdownOptions.className = 'dropdown-options';
      
      // Create options
      Array.from(select.options).forEach((option, index) => {
        const optionElement = document.createElement('div');
        optionElement.className = 'dropdown-option';
        optionElement.setAttribute('data-value', option.value);
        optionElement.textContent = option.text;
        
        optionElement.addEventListener('click', () => {
          select.selectedIndex = index;
          selectedValue.textContent = option.text;
          dropdownOptions.classList.remove('show');
          
          // Trigger a change event on the select
          const event = new Event('change', { bubbles: true });
          select.dispatchEvent(event);
          
          this.validateInput(select);
        });
        
        dropdownOptions.appendChild(optionElement);
      });
      
      // Add click handler to show/hide options
      selectedValue.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownOptions.classList.toggle('show');
      });
      
      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        dropdownOptions.classList.remove('show');
      });
      
      // Hide the original select
      select.style.display = 'none';
      
      // Add custom elements
      dropdown.appendChild(selectedValue);
      dropdown.appendChild(dropdownOptions);
    });
  }
  
  initializeFileUploads() {
    const fileInputs = document.querySelectorAll('input[type="file"]');
    
    fileInputs.forEach(input => {
      const container = document.createElement('div');
      container.className = 'file-upload-container';
      
      const label = document.createElement('label');
      label.className = 'file-upload-label';
      label.htmlFor = input.id || `file-${Math.random().toString(36).substr(2, 9)}`;
      
      const button = document.createElement('span');
      button.className = 'file-upload-button';
      button.textContent = 'Choose File';
      
      const fileNameDisplay = document.createElement('span');
      fileNameDisplay.className = 'file-name-display';
      fileNameDisplay.textContent = 'No file chosen';
      
      // Set ID if it doesn't exist
      if (!input.id) {
        input.id = label.htmlFor;
      }
      
      // Handle file selection
      input.addEventListener('change', () => {
        if (input.files.length) {
          fileNameDisplay.textContent = input.files[0].name;
        } else {
          fileNameDisplay.textContent = 'No file chosen';
        }
        this.validateInput(input);
      });
      
      // Replace input with styled version
      label.appendChild(button);
      label.appendChild(fileNameDisplay);
      
      const parent = input.parentNode;
      parent.insertBefore(container, input);
      container.appendChild(input);
      container.appendChild(label);
    });
  }
}

// Initialize all contact forms on the page
document.addEventListener('DOMContentLoaded', () => {
  new ContactForm({
    // You can customize these options as needed
    formSelector: '.contact-form form, .vehicle-inquiry-form form, .newsletter-form form',
    recaptchaEnabled: false // Set to true if using reCAPTCHA
  });
});

export default ContactForm;