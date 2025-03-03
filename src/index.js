// Import styles
import "./css/main.css";

// Import JavaScript dependencies
import "./js/main";

// Import Lazysizes for image loading
import "lazysizes";

// Registration for Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(registration => {
        console.log("SW registered: ", registration);
      })
      .catch(error => {
        console.log("SW registration failed: ", error);
      });
  });
}

// Dynamic content loading for inventory
document.addEventListener("DOMContentLoaded", () => {
  // Initialize forms with validation
  initForms();
  
  // Load inventory data if on inventory page
  if (document.querySelector(".inventory-container")) {
    loadInventory();
  }
  
  // Handle vehicle filter changes
  const filterForm = document.querySelector(".vehicle-filters");
  if (filterForm) {
    filterForm.addEventListener("change", handleFilterChange);
  }
});

// Form initialization and validation
function initForms() {
  const forms = document.querySelectorAll("form[data-form-type]");
  
  forms.forEach(form => {
    form.addEventListener("submit", handleFormSubmit);
  });
}

// Form submission handler
async function handleFormSubmit(event) {
  event.preventDefault();
  
  const form = event.target;
  const formType = form.getAttribute("data-form-type");
  const submitButton = form.querySelector('button[type="submit"]');
  const statusMessage = form.querySelector(".form-status");
  
  // Disable button during submission
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.innerHTML = "Sending...";
  }
  
  // Get form data
  const formData = new FormData(form);
  const formObject = {};
  formData.forEach((value, key) => {
    formObject[key] = value;
  });
  formObject.formType = formType;
  
  try {
    // Submit based on form type
    let endpoint;
    switch (formType) {
      case "contact":
        endpoint = "/.netlify/functions/contact-form";
        break;
      case "testDrive":
      case "tradeIn":
        endpoint = "/.netlify/functions/lead-management";
        break;
      default:
        endpoint = "/.netlify/functions/contact-form";
    }
    
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formObject),
    });
    
    const result = await response.json();
    
    if (response.ok) {
      // Success
      if (statusMessage) {
        statusMessage.innerHTML = `<div class="success-message">${result.message}</div>`;
      }
      form.reset();
    } else {
      // API error
      if (statusMessage) {
        statusMessage.innerHTML = `<div class="error-message">${result.message}</div>`;
      }
    }
  } catch (error) {
    console.error("Form submission error:", error);
    if (statusMessage) {
      statusMessage.innerHTML = `<div class="error-message">An unexpected error occurred. Please try again later.</div>`;
    }
  } finally {
    // Re-enable button
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.innerHTML = "Submit";
    }
  }
}

// Load inventory data from API
async function loadInventory() {
  const inventoryContainer = document.querySelector(".inventory-container");
  const loadingElement = document.querySelector(".loading-indicator");
  
  if (loadingElement) {
    loadingElement.style.display = "block";
  }
  
  try {
    // Get current URL parameters for filtering
    const urlParams = new URLSearchParams(window.location.search);
    const searchParams = {};
    
    // Build search parameters
    for (const [key, value] of urlParams) {
      searchParams[key] = value;
    }
    
    // Add default search type if not present
    if (!searchParams.search) {
      const inventoryType = document.querySelector("[data-inventory-type]");
      if (inventoryType) {
        searchParams.search = inventoryType.getAttribute("data-inventory-type") || "new";
      }
    }
    
    // Create query string
    const queryString = new URLSearchParams(searchParams).toString();
    
    // Fetch inventory data
    const response = await fetch(`/.netlify/functions/inventory-proxy?${queryString}`);
    
    if (response.ok) {
      const html = await response.text();
      
      // Parse and extract vehicle data
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const vehicles = doc.querySelectorAll(".vehicle-card");
      
      // Clear existing inventory
      inventoryContainer.innerHTML = "";
      
      if (vehicles.length > 0) {
        vehicles.forEach(vehicle => {
          inventoryContainer.appendChild(vehicle);
        });
      } else {
        inventoryContainer.innerHTML = "<div class='no-results'>No vehicles found matching your criteria. Please adjust your filters and try again.</div>";
      }
    } else {
      throw new Error("Failed to load inventory");
    }
  } catch (error) {
    console.error("Error loading inventory:", error);
    inventoryContainer.innerHTML = "<div class='error-message'>There was a problem loading the inventory. Please try again later.</div>";
  } finally {
    if (loadingElement) {
      loadingElement.style.display = "none";
    }
  }
}

// Handle filter changes
function handleFilterChange() {
  const form = document.querySelector(".vehicle-filters");
  const formData = new FormData(form);
  const params = new URLSearchParams();
  
  for (const [key, value] of formData.entries()) {
    if (value) {
      params.append(key, value);
    }
  }
  
  // Update URL and reload inventory
  const newUrl = `${window.location.pathname}?${params.toString()}`;
  window.history.pushState({}, '', newUrl);
  
  loadInventory();
}
