// Import main CSS
import "./css/main.css";

// Import JavaScript dependencies
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

// Custom scripts
document.addEventListener("DOMContentLoaded", () => {
  // Mobile menu toggle
  const mobileMenuToggle = document.querySelector('.navbar-burger');
  const mobileMenu = document.querySelector('.navbar-menu');
  
  if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener('click', () => {
      mobileMenuToggle.classList.toggle('is-active');
      mobileMenu.classList.toggle('is-active');
    });
  }

  // Contact form handling
  const contactForm = document.querySelector('#contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      
      const formData = new FormData(contactForm);
      const formObject = {};
      formData.forEach((value, key) => {
        formObject[key] = value;
      });

      try {
        const response = await fetch('/.netlify/functions/contact-form', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(formObject)
        });

        const result = await response.json();
        
        if (result.success) {
          // Show success message
          document.querySelector('#form-success').classList.remove('hidden');
          contactForm.reset();
        } else {
          // Show error message
          document.querySelector('#form-error').textContent = result.message;
          document.querySelector('#form-error').classList.remove('hidden');
        }
      } catch (error) {
        console.error('Form submission error:', error);
        document.querySelector('#form-error').textContent = 'An unexpected error occurred. Please try again.';
        document.querySelector('#form-error').classList.remove('hidden');
      }
    });
  }

  // Handle responsive images
  const images = document.querySelectorAll(".content img");
  images.forEach(img => {
    img.classList.add("lazyload");
    
    // Add responsive image class
    if (!img.classList.contains("inline")) {
      img.classList.add("responsive-img");
    }
  });
  
  // Initialize any interactive elements
  initializeSliders();
  initializeModals();
});

// Slider initialization
function initializeSliders() {
  const sliders = document.querySelectorAll('.slider');
  
  if (sliders.length === 0) return;
  
  // Basic slider functionality
  sliders.forEach(slider => {
    const slides = slider.querySelectorAll('.slide');
    const prevBtn = slider.querySelector('.slider-prev');
    const nextBtn = slider.querySelector('.slider-next');
    
    let currentSlide = 0;
    
    function showSlide(n) {
      slides.forEach(slide => slide.style.display = 'none');
      currentSlide = (n + slides.length) % slides.length;
      slides[currentSlide].style.display = 'block';
    }
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => showSlide(currentSlide - 1));
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => showSlide(currentSlide + 1));
    }
    
    // Initialize first slide
    showSlide(0);
  });
}

// Modal initialization
function initializeModals() {
  const modalTriggers = document.querySelectorAll('[data-toggle="modal"]');
  
  modalTriggers.forEach(trigger => {
    const targetId = trigger.getAttribute('data-target');
    const modal = document.querySelector(targetId);
    
    if (modal) {
      const closeBtn = modal.querySelector('.modal-close');
      
      trigger.addEventListener('click', (e) => {
        e.preventDefault();
        modal.classList.add('is-active');
      });
      
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          modal.classList.remove('is-active');
        });
      }
      
      // Close modal when clicking background
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.remove('is-active');
        }
      });
    }
  });
}
