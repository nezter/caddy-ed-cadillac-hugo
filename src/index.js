// Main JavaScript file
import "./css/main.css";
import "lazysizes";

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(error => {
      console.log('SW registration failed: ', error);
    });
  });
}

// Initialize any global scripts
document.addEventListener('DOMContentLoaded', () => {
  // Mobile menu toggle
  const menuToggle = document.querySelector('.navbar-burger');
  const menu = document.querySelector('.navbar-menu');
  
  if (menuToggle && menu) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('is-active');
      menu.classList.toggle('is-active');
    });
  }
  
  // Initialize form handling
  const forms = document.querySelectorAll('form[data-netlify="true"]');
  
  forms.forEach(form => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(form);
      const formObject = Object.fromEntries(formData);
      const formType = form.dataset.formType || 'contact';
      
      try {
        // Send to our lead management function
        const response = await fetch('/.netlify/functions/lead-management', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...formObject,
            formType
          })
        });
        
        const result = await response.json();
        
        if (response.ok) {
          // Show success message
          const successMessage = form.querySelector('.form-success') || document.createElement('div');
          successMessage.className = 'form-success notification is-success';
          successMessage.textContent = result.message || 'Thank you! Your form was submitted successfully.';
          
          if (!form.querySelector('.form-success')) {
            form.appendChild(successMessage);
          }
          
          // Reset form
          form.reset();
        } else {
          throw new Error(result.message || 'Something went wrong!');
        }
      } catch (error) {
        // Show error message
        const errorMessage = form.querySelector('.form-error') || document.createElement('div');
        errorMessage.className = 'form-error notification is-danger';
        errorMessage.textContent = error.message || 'There was a problem submitting the form. Please try again.';
        
        if (!form.querySelector('.form-error')) {
          form.appendChild(errorMessage);
        }
      }
    });
  });
  
  // Initialize inventory filter if on inventory page
  if (document.querySelector('#inventory-filter')) {
    initInventoryFilter();
  }
});

// Inventory filter functionality
function initInventoryFilter() {
  const filterForm = document.querySelector('#inventory-filter');
  const inventoryContainer = document.querySelector('#inventory-results');
  
  if (!filterForm || !inventoryContainer) return;
  
  filterForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(filterForm);
    const params = new URLSearchParams();
    
    for (const [key, value] of formData.entries()) {
      if (value) params.append(key, value);
    }
    
    inventoryContainer.innerHTML = '<div class="loading">Loading inventory...</div>';
    
    try {
      const response = await fetch(`/.netlify/functions/inventory-proxy?${params.toString()}`);
      if (!response.ok) throw new Error('Failed to fetch inventory');
      
      const data = await response.json();
      
      if (data.vehicles && data.vehicles.length > 0) {
        inventoryContainer.innerHTML = data.vehicles.map(vehicle => `
          <div class="inventory-item">
            <div class="inventory-image">
              <img src="${vehicle.primaryPhotoUrl || '/img/no-image.jpg'}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}">
            </div>
            <div class="inventory-details">
              <h3>${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}</h3>
              <p class="price">$${vehicle.price.toLocaleString()}</p>
              <p class="specs">
                <span>Stock: ${vehicle.stockNumber}</span>
                <span>Mileage: ${vehicle.mileage.toLocaleString()}</span>
              </p>
              <a href="/inventory/${vehicle.stockNumber}" class="button is-primary">View Details</a>
            </div>
          </div>
        `).join('');
      } else {
        inventoryContainer.innerHTML = '<div class="no-results">No vehicles found matching your criteria.</div>';
      }
    } catch (error) {
      inventoryContainer.innerHTML = `<div class="error">Error loading inventory: ${error.message}</div>`;
    }
  });
  
  // Initialize with default results
  filterForm.dispatchEvent(new Event('submit'));
}
