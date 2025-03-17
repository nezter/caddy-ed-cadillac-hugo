// Import utilities
import "lazysizes";
import 'lazysizes/plugins/blur-up/ls.blur-up';
import 'lazysizes/plugins/native-loading/ls.native-loading';

// Import custom modules
import { initializeModals } from './utils';
import ContactForm from './contact-form';
import LeadGenerator from './lead-generator';

// Main site functionality
document.addEventListener("DOMContentLoaded", function() {
  // Configure lazysizes
  window.lazySizesConfig = window.lazySizesConfig || {};
  window.lazySizesConfig.loadMode = 1; // Load immediately when entering viewport
  window.lazySizesConfig.expFactor = 2; // Load earlier (double distance from viewport)
  window.lazySizesConfig.nativeLoading = {
    setLoadingAttribute: true, // Use loading="lazy" where supported
    disableListeners: true // Disable event listeners where native lazy loading is supported
  };

  // Improved mobile navigation toggle
  initMobileNavigation();

  // Initialize common UI elements
  initializeModals();
  
  // Initialize contact forms
  new ContactForm({
    formSelector: '.contact-form form, .vehicle-inquiry-form form, .newsletter-form form',
    recaptchaEnabled: false
  });
  
  // Initialize lead generation system
  new LeadGenerator({
    popupDelay: 45000, // 45 seconds
    exitIntentEnabled: true,
    scrollDepthTrigger: 65 // 65% scroll depth
  });

  // Handle lazy loaded images with fade-in effect
  document.addEventListener('lazyloaded', function(e) {
    e.target.parentNode.classList.add('loaded');
  });

  // Add responsive image class to content images
  const contentImages = document.querySelectorAll(".content img");
  contentImages.forEach(img => {
    if (!img.classList.contains("inline")) {
      img.classList.add("responsive-img");
    }
  });

  // Add sticky header behavior
  const header = document.querySelector('header');
  if (header) {
    window.addEventListener('scroll', function() {
      if (window.pageYOffset > 50) {
        header.classList.add('sticky');
      } else {
        header.classList.remove('sticky');
      }
    });
  }
});

/**
 * Initialize mobile navigation with improved functionality
 */
function initMobileNavigation() {
  const navbarBurgers = document.querySelectorAll('.navbar-burger');
  
  if (navbarBurgers.length === 0) return;
  
  navbarBurgers.forEach(burger => {
    burger.addEventListener('click', function() {
      // Get the target menu
      const targetId = burger.dataset.target;
      const targetMenu = document.getElementById(targetId);
      
      if (!targetMenu) return;
      
      // Toggle active class
      burger.classList.toggle('is-active');
      targetMenu.classList.toggle('is-active');
      
      // Update aria-expanded attribute
      const isExpanded = burger.classList.contains('is-active');
      burger.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
      burger.setAttribute('aria-label', isExpanded ? 'Close main menu' : 'Open main menu');
      
      // Toggle body class to prevent scrolling when menu is open
      document.body.classList.toggle('nav-open', isExpanded);
    });
  });
  
  // Close menu when clicking on navigation links
  const navLinks = document.querySelectorAll('.navbar-menu .navbar-item');
  navLinks.forEach(link => {
    link.addEventListener('click', function() {
      // Close any open mobile menus
      const openMenus = document.querySelectorAll('.navbar-menu.is-active');
      const openBurgers = document.querySelectorAll('.navbar-burger.is-active');
      
      if (openMenus.length > 0) {
        openMenus.forEach(menu => menu.classList.remove('is-active'));
        openBurgers.forEach(burger => {
          burger.classList.remove('is-active');
          burger.setAttribute('aria-expanded', 'false');
          burger.setAttribute('aria-label', 'Open main menu');
        });
        
        // Re-enable scrolling
        document.body.classList.remove('nav-open');
      }
    });
  });
  
  // Handle ESC key press to close menu
  document.addEventListener('keyup', function(event) {
    if (event.key === 'Escape') {
      const openMenus = document.querySelectorAll('.navbar-menu.is-active');
      const openBurgers = document.querySelectorAll('.navbar-burger.is-active');
      
      if (openMenus.length > 0) {
        openMenus.forEach(menu => menu.classList.remove('is-active'));
        openBurgers.forEach(burger => {
          burger.classList.remove('is-active');
          burger.setAttribute('aria-expanded', 'false'); 
          burger.setAttribute('aria-label', 'Open main menu');
        });
        
        // Re-enable scrolling
        document.body.classList.remove('nav-open');
      }
    }
  });
}
