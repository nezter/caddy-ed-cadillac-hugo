// Import main CSS file
import "./css/main.css";

// Import lazysizes for image loading
import "lazysizes";

// Main JavaScript functionality
document.addEventListener("DOMContentLoaded", function() {
  // Mobile menu toggle
  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  
  if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener('click', function() {
      mobileMenu.classList.toggle('active');
      mobileMenuToggle.classList.toggle('active');
      document.body.classList.toggle('menu-open');
    });
  }

  // Initialize sliders/carousels if present on the page
  if (typeof Glide !== 'undefined') {
    const heroSlider = document.querySelector('.hero-slider');
    if (heroSlider) {
      new Glide('.hero-slider', {
        type: 'carousel',
        autoplay: 5000,
        animationDuration: 800,
        gap: 0
      }).mount();
    }

    const testimonialsSlider = document.querySelector('.testimonials-slider');
    if (testimonialsSlider) {
      new Glide('.testimonials-slider', {
        type: 'carousel',
        perView: 1,
        autoplay: 6000,
        animationDuration: 800
      }).mount();
    }
    
    const featuredVehiclesSlider = document.querySelector('.featured-vehicles-slider');
    if (featuredVehiclesSlider) {
      new Glide('.featured-vehicles-slider', {
        type: 'carousel',
        perView: 3,
        gap: 30,
        breakpoints: {
          992: { perView: 2 },
          768: { perView: 1 }
        }
      }).mount();
    }
  }
  
  // Handle form submissions
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', function(event) {
      const requiredFields = form.querySelectorAll('[required]');
      let isValid = true;
      
      requiredFields.forEach(field => {
        if (!field.value.trim()) {
          isValid = false;
          field.classList.add('error');
        } else {
          field.classList.remove('error');
        }
      });
      
      if (!isValid) {
        event.preventDefault();
        const errorMessage = document.createElement('div');
        errorMessage.classList.add('form-error');
        errorMessage.textContent = 'Please fill in all required fields.';
        
        const existingError = form.querySelector('.form-error');
        if (existingError) {
          form.removeChild(existingError);
        }
        
        form.insertBefore(errorMessage, form.firstChild);
      }
    });
  });

  // Vehicle inventory filtering
  const filterForm = document.querySelector('.inventory-filter-form');
  if (filterForm) {
    filterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(filterForm);
      const params = new URLSearchParams();
      
      for (const [key, value] of formData.entries()) {
        if (value) {
          params.append(key, value);
        }
      }
      
      window.location.href = `/inventory/?${params.toString()}`;
    });
  }

  // Initialize lazy loading for images
  document.querySelectorAll('.lazy-load').forEach(img => {
    img.classList.add('lazyload');
  });

  // Mobile menu toggle
  const menuToggle = document.querySelector(".navbar-burger");
  const mobileMenu = document.querySelector(".navbar-menu");
  
  if (menuToggle) {
    menuToggle.addEventListener("click", () => {
      menuToggle.classList.toggle("is-active");
      mobileMenu.classList.toggle("is-active");
    });
  }

  // Vehicle image gallery functionality
  const galleryThumbs = document.querySelectorAll(".vehicle-thumbnail");
  const mainImage = document.querySelector(".vehicle-main-image img");
  
  if (galleryThumbs.length > 0 && mainImage) {
    galleryThumbs.forEach(thumb => {
      thumb.addEventListener("click", () => {
        mainImage.src = thumb.dataset.fullsize;
        mainImage.alt = thumb.alt;
        
        // Update active state
        galleryThumbs.forEach(t => t.classList.remove("is-active"));
        thumb.classList.add("is-active");
      });
    });
  }
});

// Enable service worker for offline support
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('Service Worker registered: ', registration);
    }).catch(error => {
      console.log('Service Worker registration failed: ', error);
    });
  });
}
