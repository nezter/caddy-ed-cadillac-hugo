// Import utilities
import "lazysizes";

// Import custom modules
import { initializeModals } from './utils';
import ContactForm from './contact-form';
import LeadGenerator from './lead-generator';

// Main site functionality
document.addEventListener("DOMContentLoaded", function() {
  // Mobile navigation toggle
  const menuToggle = document.querySelector('.mobile-nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  
  if (menuToggle && mainNav) {
    menuToggle.addEventListener('click', function() {
      this.classList.toggle('is-active');
      mainNav.classList.toggle('is-active');
      document.body.classList.toggle('nav-open');
    });
  }

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
