// Import main CSS
import './css/main.css';

// Import JavaScript dependencies
import 'lazysizes';

// Register service worker for offline capabilities
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }).catch(error => {
      console.log('ServiceWorker registration failed: ', error);
    });
  });
}

// Initialize site functionality
document.addEventListener('DOMContentLoaded', () => {
  // Initialize navigation
  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  
  if (mobileMenuToggle && mobileMenu) {
    mobileMenuToggle.addEventListener('click', () => {
      mobileMenu.classList.toggle('active');
      mobileMenuToggle.classList.toggle('active');
    });
  }

  // Handle form submissions
  const forms = document.querySelectorAll("form[data-ajax='true']");
  forms.forEach(form => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const formObject = {};
      
      formData.forEach((value, key) => {
        formObject[key] = value;
      });

      // Add form type based on form ID
      formObject.formType = form.getAttribute("id") || "contact";
      
      try {
        const response = await fetch("/.netlify/functions/lead-management", {
          method: "POST",
          body: JSON.stringify(formObject),
          headers: {
            "Content-Type": "application/json"
          }
        });
        
        const result = await response.json();
        
        if (response.ok) {
          // Show success message
          const messageElement = form.querySelector(".form-message") || 
            document.createElement("div");
          
          if (!form.querySelector(".form-message")) {
            messageElement.className = "form-message success";
            form.appendChild(messageElement);
          }
          
          messageElement.textContent = result.message || "Form submitted successfully";
          messageElement.className = "form-message success";
          form.reset();
        } else {
          throw new Error(result.message || "Something went wrong");
        }
      } catch (error) {
        // Show error message
        const messageElement = form.querySelector(".form-message") || 
          document.createElement("div");
        
        if (!form.querySelector(".form-message")) {
          messageElement.className = "form-message error";
          form.appendChild(messageElement);
        }
        
        messageElement.textContent = error.message || "An error occurred. Please try again.";
        messageElement.className = "form-message error";
      }
    });
  });

  // Initialize inventory filtering if on inventory page
  if (document.querySelector(".inventory-filter")) {
    initInventoryFilter();
  }

  // Initialize any carousels
  initializeCarousels();
});

// Inventory filtering functionality
function initInventoryFilter() {
  const filterForm = document.querySelector(".inventory-filter");
  const inventoryItems = document.querySelectorAll(".inventory-item");
  
  filterForm.addEventListener("change", () => {
    const formData = new FormData(filterForm);
    const filters = {
      make: formData.get("make") || "",
      model: formData.get("model") || "",
      year: formData.get("year") || "",
      priceMin: parseFloat(formData.get("price-min") || 0),
      priceMax: parseFloat(formData.get("price-max") || 999999)
    };
    
    inventoryItems.forEach(item => {
      const itemData = {
        make: item.dataset.make,
        model: item.dataset.model,
        year: item.dataset.year,
        price: parseFloat(item.dataset.price || 0)
      };
      
      const isVisible = 
        (!filters.make || filters.make === itemData.make) &&
        (!filters.model || filters.model === itemData.model) &&
        (!filters.year || filters.year === itemData.year) &&
        (itemData.price >= filters.priceMin && itemData.price <= filters.priceMax);
      
      item.classList.toggle("hidden", !isVisible);
    });
  });
}

// Initialize carousels
function initializeCarousels() {
  const carousels = document.querySelectorAll('.vehicle-carousel');
  carousels.forEach(carousel => {
    // Simple carousel implementation
    // Could be replaced with a library like Swiper
    const slides = carousel.querySelectorAll('.carousel-item');
    if (slides.length > 0) {
      let currentSlide = 0;
      
      const showSlide = (index) => {
        slides.forEach((slide, i) => {
          slide.style.display = i === index ? 'block' : 'none';
        });
      };
      
      const nextSlide = () => {
        currentSlide = (currentSlide + 1) % slides.length;
        showSlide(currentSlide);
      };
      
      // Initialize with first slide
      showSlide(0);
      
      // Auto-advance slides every 5 seconds
      setInterval(nextSlide, 5000);
    }
  });
}
