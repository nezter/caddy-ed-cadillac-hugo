// Main JS entry point

// Import CSS
import './css/main.css';

// Import JS dependencies
import 'lazysizes';

// Initialize service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

// Vehicle inventory filtering
document.addEventListener('DOMContentLoaded', () => {
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
