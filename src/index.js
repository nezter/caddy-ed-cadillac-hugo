import 'lazysizes';
import './css/main.css';
import Glide from '@glidejs/glide';
import CookieConsent from 'vanilla-cookieconsent';

// Initialize sliders/carousels
document.addEventListener('DOMContentLoaded', () => {
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

  // Initialize hero slider if it exists
  const heroSlider = document.querySelector('.hero-slider');
  if (heroSlider) {
    new Glide('.hero-slider', {
      type: 'carousel',
      autoplay: 5000,
      animationDuration: 800,
      gap: 0
    }).mount();
  }

  // Initialize featured vehicles slider if it exists
  const featuredSlider = document.querySelector('.featured-vehicles-slider');
  if (featuredSlider) {
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

  // Initialize testimonials slider if it exists
  const testimonialSlider = document.querySelector('.testimonials-slider');
  if (testimonialSlider) {
    new Glide('.testimonials-slider', {
      type: 'carousel',
      perView: 1,
      autoplay: 8000
    }).mount();
  }
  
  // Form validation
  const forms = document.querySelectorAll('form');
  forms.forEach(form => {
    form.addEventListener('submit', handleFormSubmit);
  });
  
  // Cookie consent
  initCookieConsent();

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

// Form submission handler with Netlify integration
function handleFormSubmit(e) {
  const form = e.target;
  
  // Basic validation
  const requiredFields = form.querySelectorAll('[required]');
  let isValid = true;
  
  requiredFields.forEach(field => {
    if (!field.value.trim()) {
      isValid = false;
      field.classList.add('is-invalid');
    } else {
      field.classList.remove('is-invalid');
    }
  });
  
  if (!isValid) {
    e.preventDefault();
    form.querySelector('.form-error').textContent = 'Please fill in all required fields.';
  }
  
  // For non-Netlify environments (like dev), prevent actual submission
  if (isValid && window.location.hostname === 'localhost') {
    e.preventDefault();
    console.log('Form submission simulated in development');
    form.reset();
    form.querySelector('.form-success').textContent = 'Form submitted successfully (dev mode).';
  }
}

// Initialize cookie consent
function initCookieConsent() {
  CookieConsent.run({
    categories: {
      necessary: {
        enabled: true,
        readonly: true
      },
      analytics: {
        enabled: true
      },
      marketing: {
        enabled: false
      }
    },
    language: {
      default: 'en',
      translations: {
        en: {
          consentModal: {
            title: 'We use cookies',
            description: 'We use cookies to enhance your browsing experience, serve personalized content, and analyze our traffic.',
            acceptAllBtn: 'Accept all',
            acceptNecessaryBtn: 'Reject all',
            showPreferencesBtn: 'Manage preferences'
          },
          preferencesModal: {
            title: 'Cookie Preferences',
            acceptAllBtn: 'Accept all',
            acceptNecessaryBtn: 'Reject all',
            savePreferencesBtn: 'Save preferences',
            closeIconLabel: 'Close',
            sections: [
              {
                title: 'Cookie Usage',
                description: 'We use cookies to ensure the basic functionality of the website and to enhance your online experience.'
              },
              {
                title: 'Strictly Necessary Cookies',
                description: 'These cookies are essential for the proper functioning of the website.',
                cookieTable: {
                  headers: { name: 'Name', description: 'Description' },
                  body: [
                    { name: 'session', description: 'Used to maintain your session' },
                    { name: 'XSRF-TOKEN', description: 'Security token for forms' }
                  ]
                },
                toggle: {
                  value: 'necessary',
                  enabled: true,
                  readonly: true
                }
              },
              {
                title: 'Analytics Cookies',
                description: 'These cookies help us understand how visitors interact with our website.',
                toggle: {
                  value: 'analytics',
                  enabled: true,
                  readonly: false
                }
              },
              {
                title: 'Marketing Cookies',
                description: 'These cookies are used to track visitors across websites to display relevant advertisements.',
                toggle: {
                  value: 'marketing',
                  enabled: false,
                  readonly: false
                }
              }
            ]
          }
        }
      }
    }
  });
}

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
