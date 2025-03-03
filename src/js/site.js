// Main site JavaScript functionality

import { formatDistance, parseISO } from 'date-fns';

// Initialize site functionality when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  initNavbar();
  initImageLazyLoading();
  initFormValidation();
  initInventoryFilter();
  initDateFormatting();
  initScrollAnimations();
});

// Mobile navigation toggle
function initNavbar() {
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');
  
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navMenu.classList.toggle('is-active');
      navToggle.classList.toggle('is-active');
    });
  }

  // Close menu when clicking outside
  document.addEventListener('click', (event) => {
    if (navMenu && navMenu.classList.contains('is-active') && 
        !event.target.closest('.nav-menu') && 
        !event.target.closest('.nav-toggle')) {
      navMenu.classList.remove('is-active');
      navToggle.classList.remove('is-active');
    }
  });
}

// Enhance lazy loading with fade-in effect
function initImageLazyLoading() {
  document.addEventListener('lazyloaded', function(e) {
    e.target.parentNode.classList.add('image-loaded');
  });
}

// Form validation for contact forms
function initFormValidation() {
  const forms = document.querySelectorAll('form[data-validate]');
  
  forms.forEach(form => {
    form.addEventListener('submit', event => {
      const requiredFields = form.querySelectorAll('[required]');
      let isValid = true;
      
      requiredFields.forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          field.classList.add('is-invalid');
          
          const errorMessage = document.createElement('div');
          errorMessage.className = 'error-message';
          errorMessage.textContent = 'This field is required';
          
          // Remove any existing error message
          const existingError = field.parentNode.querySelector('.error-message');
          if (existingError) {
            existingError.remove();
          }
          
          field.parentNode.appendChild(errorMessage);
        } else {
          field.classList.remove('is-invalid');
          const existingError = field.parentNode.querySelector('.error-message');
          if (existingError) {
            existingError.remove();
          }
        }
      });
      
      if (!isValid) {
        event.preventDefault();
      }
    });
    
    // Clear error on input
    form.querySelectorAll('input, textarea, select').forEach(input => {
      input.addEventListener('input', () => {
        input.classList.remove('is-invalid');
        const existingError = input.parentNode.querySelector('.error-message');
        if (existingError) {
          existingError.remove();
        }
      });
    });
  });
}

// Inventory filtering and sorting functionality
function initInventoryFilter() {
  const filterForm = document.querySelector('.inventory-filter');
  
  if (filterForm) {
    filterForm.addEventListener('submit', event => {
      event.preventDefault();
      
      const formData = new FormData(filterForm);
      const params = new URLSearchParams();
      
      for (const [key, value] of formData.entries()) {
        if (value) {
          params.append(key, value);
        }
      }
      
      // Fetch filtered inventory
      fetchInventory(params.toString());
    });

    // Initialize filter dropdowns
    const filterSelects = document.querySelectorAll('.inventory-filter select');
    filterSelects.forEach(select => {
      select.addEventListener('change', () => {
        // Auto-submit form on change
        filterForm.dispatchEvent(new Event('submit'));
      });
    });
  }
}

// Fetch inventory data from Netlify function
async function fetchInventory(queryString) {
  const inventoryContainer = document.querySelector('.inventory-results');
  
  if (inventoryContainer) {
    inventoryContainer.innerHTML = '<div class="loading">Loading inventory...</div>';
    
    try {
      const response = await fetch(`/.netlify/functions/inventory-proxy?${queryString}`);
      const data = await response.text();
      
      // Parse HTML response and extract vehicle listings
      const parser = new DOMParser();
      const doc = parser.parseFromString(data, 'text/html');
      const vehicles = doc.querySelectorAll('.vehicle-card');
      
      if (vehicles.length > 0) {
        inventoryContainer.innerHTML = '';
        vehicles.forEach(vehicle => {
          inventoryContainer.appendChild(vehicle);
        });
      } else {
        inventoryContainer.innerHTML = '<div class="no-results">No vehicles found matching your criteria</div>';
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      inventoryContainer.innerHTML = '<div class="error">Failed to load inventory. Please try again later.</div>';
    }
  }
}

// Format dates using date-fns
function initDateFormatting() {
  document.querySelectorAll('[data-date]').forEach(element => {
    const dateStr = element.getAttribute('data-date');
    if (dateStr) {
      try {
        const date = parseISO(dateStr);
        element.textContent = formatDistance(date, new Date(), { addSuffix: true });
      } catch (error) {
        console.error('Error formatting date:', error);
      }
    }
  });
}

// Scroll animations
function initScrollAnimations() {
  const animatedElements = document.querySelectorAll('.animate-on-scroll');
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animated');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.1
  });
  
  animatedElements.forEach(el => {
    observer.observe(el);
  });
}
