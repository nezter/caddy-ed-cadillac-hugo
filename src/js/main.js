// Import required libraries
import "lazysizes";
import "./carousel";
import Splide from '@splidejs/splide';

// Main JS file for site functionality

document.addEventListener("DOMContentLoaded", function() {
  // Handle mobile navigation toggle
  const menuToggle = document.querySelector('.mobile-nav-toggle');
  const mainNav = document.querySelector('.main-nav');
  
  if (menuToggle) {
    menuToggle.addEventListener('click', function() {
      this.classList.toggle('is-active');
      mainNav.classList.toggle('is-active');
    });
  }

  // Handle vehicle inventory filtering
  const filterForms = document.querySelectorAll('.vehicle-filter-form');
  filterForms.forEach(form => {
    form.addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(this);
      const params = new URLSearchParams(formData);
      window.location.href = `/inventory/?${params.toString()}`;
    });
  });

  // Handle lazy loaded images with fade-in effect
  document.addEventListener('lazyloaded', function(e) {
    e.target.parentNode.classList.add('loaded');
  });

  // Initialize contact form validation
  const contactForm = document.getElementById('contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(this);
      
      fetch('/.netlify/functions/contact-submission', {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        if (data.success) {
          contactForm.reset();
          document.getElementById('contact-success').style.display = 'block';
        } else {
          document.getElementById('contact-error').style.display = 'block';
        }
      })
      .catch(error => {
        console.error('Error:', error);
        document.getElementById('contact-error').style.display = 'block';
      });
    });
  }

  // Mobile menu functionality
  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const nav = document.querySelector('nav');
  
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', () => {
      mobileMenuToggle.classList.toggle('active');
      nav.classList.toggle('active');
    });
  }

  // Handle form submissions
  const forms = document.querySelectorAll('form.validate-form');
  forms.forEach(form => {
    form.addEventListener('submit', formSubmitHandler);
  });

  // Initialize vehicle gallery
  initVehicleGallery();

  // Add smooth scrolling to all links
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach(link => {
    link.addEventListener('click', smoothScroll);
  });

  // Initialize the inventory filter if it exists
  initInventoryFilter();

  // Setup search functionality
  const searchForm = document.querySelector(".search-form");
  if (searchForm) {
    searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const searchTerm = e.target.querySelector("input").value.trim();
      if (searchTerm) {
        window.location.href = `/inventory/?q=${encodeURIComponent(searchTerm)}`;
      }
    });
  }

  // Initialize any carousels
  const heroSlider = document.querySelector(".hero-slider");
  if (heroSlider && window.Glide) {
    new Glide('.hero-slider', {
      type: 'carousel',
      autoplay: 5000,
      animationDuration: 600,
      gap: 0
    }).mount();
  }

  // Initialize mobile navigation menu
  initMobileMenu();
  // Handle sticky header on scroll
  initStickyHeader();
  // Initialize vehicle image sliders
  initVehicleSliders();
  // Set up modal functionality
  initModals();
  // Load vehicle details on details page
  loadVehicleDetails();
  
  // Initialize AOS animations if available
  if (window.AOS) {
    AOS.init({
      duration: 800,
      easing: 'ease-in-out',
      once: true
    });
  }
});

// Form validation and submission handler
function formSubmitHandler(e) {
  const form = e.target;
  const formFields = form.querySelectorAll('input, textarea, select');
  let isValid = true;
  
  formFields.forEach(field => {
    if (field.hasAttribute('required') && !field.value.trim()) {
      isValid = false;
      field.classList.add('error');
      
      // Add error message if it doesn't exist
      let errorMsg = field.parentNode.querySelector('.error-message');
      if (!errorMsg) {
        errorMsg = document.createElement('div');
        errorMsg.className = 'error-message';
        errorMsg.textContent = 'This field is required';
        field.parentNode.appendChild(errorMsg);
      }
    } else {
      field.classList.remove('error');
      const errorMsg = field.parentNode.querySelector('.error-message');
      if (errorMsg) errorMsg.remove();
    }
    
    // Email validation
    if (field.type === 'email' && field.value) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(field.value)) {
        isValid = false;
        field.classList.add('error');
        
        let errorMsg = field.parentNode.querySelector('.error-message');
        if (!errorMsg) {
          errorMsg = document.createElement('div');
          errorMsg.className = 'error-message';
          errorMsg.textContent = 'Please enter a valid email address';
          field.parentNode.appendChild(errorMsg);
        }
      }
    }
  });
  
  if (!isValid) {
    e.preventDefault();
    return false;
  }
}

// Vehicle gallery carousel
function initVehicleGallery() {
  const gallery = document.querySelector('.vehicle-gallery');
  if (!gallery) return;
  
  const slides = gallery.querySelectorAll('.vehicle-slide');
  if (slides.length <= 1) return;
  
  let currentSlide = 0;
  const prevButton = gallery.querySelector('.gallery-prev');
  const nextButton = gallery.querySelector('.gallery-next');
  
  function showSlide(index) {
    slides.forEach(slide => slide.style.display = 'none');
    
    if (index >= slides.length) currentSlide = 0;
    if (index < 0) currentSlide = slides.length - 1;
    else currentSlide = index;
    
    slides[currentSlide].style.display = 'block';
  }
  
  showSlide(0);
  
  if (prevButton) {
    prevButton.addEventListener('click', () => {
      showSlide(currentSlide - 1);
    });
  }
  
  if (nextButton) {
    nextButton.addEventListener('click', () => {
      showSlide(currentSlide + 1);
    });
  }
}

// Smooth scrolling function
function smoothScroll(e) {
  e.preventDefault();
  const targetId = this.getAttribute('href');
  const targetElement = document.querySelector(targetId);
  if (targetElement) {
    const headerHeight = document.querySelector('header').offsetHeight;
    const targetPosition = targetElement.getBoundingClientRect().top + window.scrollY - headerHeight;
    
    window.scrollTo({
      top: targetPosition,
      behavior: 'smooth'
    });
  }
}

// Inventory filter functionality
function initInventoryFilter() {
  const filterForm = document.getElementById('inventory-filter');
  if (!filterForm) return;
  
  filterForm.addEventListener('submit', filterInventory);
  
  // Initialize range sliders if they exist
  const ranges = document.querySelectorAll('.range-slider');
  ranges.forEach(range => {
    const minInput = range.querySelector('input[data-type="min"]');
    const maxInput = range.querySelector('input[data-type="max"]');
    const minLabel = range.querySelector('.min-value');
    const maxLabel = range.querySelector('.max-value');
    
    if (minInput && maxInput) {
      minInput.addEventListener('input', () => {
        if (parseInt(minInput.value) > parseInt(maxInput.value)) {
          minInput.value = maxInput.value;
        }
        if (minLabel) minLabel.textContent = formatNumber(minInput.value);
      });
      
      maxInput.addEventListener('input', () => {
        if (parseInt(maxInput.value) < parseInt(minInput.value)) {
          maxInput.value = minInput.value;
        }
        if (maxLabel) maxLabel.textContent = formatNumber(maxInput.value);
      });
    }
  });
}

function filterInventory(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const params = new URLSearchParams();
  
  for (let [key, value] of formData.entries()) {
    if (value) {
      params.append(key, value);
    }
  }
  
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.location.href = newUrl;
}

function formatNumber(num) {
  return Number(num).toLocaleString('en-US');
}

// Initialize mobile navigation menu
function initMobileMenu() {
  const navToggle = document.querySelector('.nav-toggle');
  const navMenu = document.querySelector('.nav-menu');
  
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('is-active');
      navMenu.classList.toggle('is-active');
    });
  }
}

// Handle sticky header on scroll
function initStickyHeader() {
  const header = document.querySelector('.site-header');
  const scrollThreshold = 100;
  
  if (header) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > scrollThreshold) {
        header.classList.add('sticky');
      } else {
        header.classList.remove('sticky');
      }
    });
  }
}

// Initialize vehicle image sliders
function initVehicleSliders() {
  const sliders = document.querySelectorAll('.vehicle-gallery-slider');
  
  if (sliders.length && window.Splide) {
    sliders.forEach(slider => {
      new Splide(slider, {
        type: 'loop',
        perPage: 1,
        autoplay: true,
        interval: 5000,
        pagination: true,
        arrows: true
      }).mount();
    });
  }
}

// Set up modal functionality
function initModals() {
  const modalTriggers = document.querySelectorAll('[data-modal-trigger]');
  const modalCloseButtons = document.querySelectorAll('.modal-close');
  const modals = document.querySelectorAll('.modal');
  
  modalTriggers.forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = trigger.getAttribute('data-modal-trigger');
      const targetModal = document.getElementById(targetId);
      
      if (targetModal) {
        targetModal.classList.add('is-active');
        document.body.classList.add('modal-open');
      }
    });
  });
  
  modalCloseButtons.forEach(button => {
    button.addEventListener('click', () => {
      const modal = button.closest('.modal');
      if (modal) {
        modal.classList.remove('is-active');
        document.body.classList.remove('modal-open');
      }
    });
  });
  
  // Close modal on outside click
  modals.forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('is-active');
        document.body.classList.remove('modal-open');
      }
    });
  });
}

// Load vehicle details on details page
async function loadVehicleDetails() {
  const vehicleDetails = document.querySelector('.vehicle-details');
  
  if (!vehicleDetails) return;
  
  const vin = vehicleDetails.getAttribute('data-vin');
  if (!vin) return;
  
  try {
    const response = await fetch(`/.netlify/functions/vehicle-details?vin=${vin}`);
    const data = await response.json();
    
    if (data) {
      // Update vehicle details with fetched data
      updateVehicleDetailsDOM(data);
    }
  } catch (error) {
    console.error('Error loading vehicle details:', error);
  }
}

// Update vehicle details in the DOM
function updateVehicleDetailsDOM(data) {
  // Update price
  const priceElement = document.querySelector('.vehicle-price');
  if (priceElement && data.price) {
    priceElement.textContent = formatCurrency(data.price);
  }
  
  // Update specs
  const specElements = document.querySelectorAll('[data-spec]');
  specElements.forEach(element => {
    const specKey = element.getAttribute('data-spec');
    if (data[specKey]) {
      element.textContent = data[specKey];
    }
  });
  
  // Update gallery if images available
  if (data.images && data.images.length > 0) {
    updateGallery(data.images);
  }
}

// Format currency for display
function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(value);
}

// Update gallery with new images
function updateGallery(images) {
  const galleryContainer = document.querySelector('.vehicle-gallery');
  if (!galleryContainer) return;
  
  // Clear existing images
  galleryContainer.innerHTML = '';
  
  // Add new images
  images.forEach(image => {
    const slide = document.createElement('div');
    slide.classList.add('splide__slide');
    
    const img = document.createElement('img');
    img.src = image.url;
    img.alt = image.alt || 'Vehicle image';
    img.classList.add('vehicle-image');
    
    slide.appendChild(img);
    galleryContainer.appendChild(slide);
  });
  
  // Reinitialize slider
  if (window.Splide) {
    const slider = new Splide('.vehicle-gallery-slider', {
      type: 'loop',
      perPage: 1,
      pagination: true,
      arrows: true
    });
    slider.mount();
  }
}
