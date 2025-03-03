// Main entry file for the Caddy Ed website

import './css/main.css';
import 'lazysizes';
import { initForms } from './js/forms';
import { initInventory } from './js/inventory';

// Initialize components when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  console.log('Caddy Ed website initialized');
  
  // Initialize forms with validation and submission handling
  initForms();
  
  // Initialize inventory on inventory pages
  const inventoryContainer = document.getElementById('inventory-container');
  if (inventoryContainer) {
    initInventory('inventory-container', { status: 'new' });
  }
  
  // Initialize mobile navigation
  initMobileNav();
  
  // Initialize lazy loading for images
  document.querySelectorAll('img.lazyload').forEach(img => {
    img.addEventListener('load', () => {
      img.classList.add('loaded');
    });
  });
  
  // Register service worker for offline support
  registerServiceWorker();
});

/**
 * Initialize mobile navigation menu
 */
function initMobileNav() {
  const menuButton = document.querySelector('.nav-toggle');
  const mobileMenu = document.querySelector('.mobile-nav');
  
  if (menuButton && mobileMenu) {
    menuButton.addEventListener('click', () => {
      menuButton.classList.toggle('active');
      mobileMenu.classList.toggle('active');
      document.body.classList.toggle('nav-open');
    });
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', (event) => {
      if (
        mobileMenu.classList.contains('active') && 
        !mobileMenu.contains(event.target) && 
        !menuButton.contains(event.target)
      ) {
        menuButton.classList.remove('active');
        mobileMenu.classList.remove('active');
        document.body.classList.remove('nav-open');
      }
    });
  }
}

/**
 * Register service worker for offline functionality
 */
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('ServiceWorker registration successful');
        })
        .catch(error => {
          console.error('ServiceWorker registration failed:', error);
        });
    });
  }
}
