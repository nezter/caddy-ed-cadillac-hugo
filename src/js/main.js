// Import required libraries
import "lazysizes";
import "./carousel";

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
    const targetPosition = targetElement.getBoundingClientRect().top + window.pageYOffset - headerHeight;
    
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
