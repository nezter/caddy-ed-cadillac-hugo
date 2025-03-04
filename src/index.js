// CSS
import "./css/main.css";

// JS
import "lazysizes";

// Register service worker
if (navigator.serviceWorker) {
  navigator.serviceWorker.register('/sw.js')
    .then(registration => {
      console.log('Service Worker registered with scope:', registration.scope);
    })
    .catch(error => {
      console.error('Service Worker registration failed:', error);
    });
}

// DOM Ready
document.addEventListener("DOMContentLoaded", function() {
  // Mobile menu toggle
  const menuToggle = document.querySelector('.navbar-burger');
  const menu = document.querySelector('.navbar-menu');
  
  if (menuToggle && menu) {
    menuToggle.addEventListener('click', () => {
      menuToggle.classList.toggle('is-active');
      menu.classList.toggle('is-active');
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
        });
      });
    }
  });
}
