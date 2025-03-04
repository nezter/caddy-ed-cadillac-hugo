// Main JS entry point
import "./css/main.css";

// Lazy loading for images
import "lazysizes";

// Service worker registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

// Lead form handling
document.addEventListener('DOMContentLoaded', () => {
  const leadForms = document.querySelectorAll('.lead-form');
  
  leadForms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalBtnText = submitBtn.textContent;
      submitBtn.textContent = 'Sending...';
      submitBtn.disabled = true;
      
      const formData = new FormData(form);
      const formObject = {};
      
      formData.forEach((value, key) => {
        formObject[key] = value;
      });
      
      try {
        const response = await fetch('/.netlify/functions/lead-management', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formObject)
        });
        
        const result = await response.json();
        
        if (response.ok) {
          form.reset();
          form.innerHTML = `<div class="success-message"><p>${result.message}</p></div>`;
        } else {
          throw new Error(result.message || 'Form submission failed');
        }
      } catch (error) {
        console.error('Error submitting form:', error);
        const errorElement = form.querySelector('.form-error') || document.createElement('div');
        errorElement.className = 'form-error';
        errorElement.textContent = error.message || 'Something went wrong. Please try again later.';
        
        if (!form.querySelector('.form-error')) {
          form.appendChild(errorElement);
        }
        
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
      }
    });
  });
});
