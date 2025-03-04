/**
 * Inventory Management Module
 * Handles the fetching, filtering, and display of vehicle inventory
 */

const API_ENDPOINT = '/.netlify/functions/inventory';

/**
 * Initialize the inventory display
 * @param {string} containerId - The ID of the HTML container element
 * @param {Object} initialFilters - Initial filters to apply
 */
export function initInventory(containerId, initialFilters = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // State
  let inventory = [];
  let filters = initialFilters;
  let loading = true;
  let error = null;
  let currentPage = 1;
  const pageSize = 12;
  
  // Create UI components
  const loadingElement = document.createElement('div');
  loadingElement.className = 'loading-indicator';
  loadingElement.innerHTML = '<div class="spinner"></div><p>Loading vehicles...</p>';
  
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  
  const filtersContainer = document.createElement('div');
  filtersContainer.className = 'inventory-filters';
  
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'inventory-results';
  
  const vehicleGrid = document.createElement('div');
  vehicleGrid.className = 'vehicle-grid';
  
  const paginationContainer = document.createElement('div');
  paginationContainer.className = 'pagination';
  
  // Append components to container
  container.appendChild(loadingElement);
  container.appendChild(errorElement);
  container.appendChild(filtersContainer);
  container.appendChild(resultsContainer);
  resultsContainer.appendChild(vehicleGrid);
  resultsContainer.appendChild(paginationContainer);
  
  // Hide error initially
  errorElement.style.display = 'none';
  
  // Initialize UI
  createFilterUI(filtersContainer);
  
  // Load inventory data
  fetchInventory();
  
  /**
   * Create filter UI elements
   */
  function createFilterUI(container) {
    // Filter form
    const form = document.createElement('form');
    form.className = 'filters-form';
    
    // Status filter (New/Used)
    const statusGroup = document.createElement('div');
    statusGroup.className = 'filter-group';
    statusGroup.innerHTML = `
      <label>Vehicle Status</label>
      <select name="status" id="filter-status">
        <option value="">All Vehicles</option>
        <option value="new" ${filters.status === 'new' ? 'selected' : ''}>New</option>
        <option value="used" ${filters.status === 'used' ? 'selected' : ''}>Pre-Owned</option>
      </select>
    `;
    
    // Price filter
    const priceGroup = document.createElement('div');
    priceGroup.className = 'filter-group';
    priceGroup.innerHTML = `
      <label>Max Price</label>
      <select name="price" id="filter-price">
        <option value="">No Limit</option>
        <option value="40000">Under $40,000</option>
        <option value="60000">Under $60,000</option>
        <option value="80000">Under $80,000</option>
        <option value="100000">Under $100,000</option>
      </select>
    `;
    
    // Model filter
    const modelGroup = document.createElement('div');
    modelGroup.className = 'filter-group';
    modelGroup.innerHTML = `
      <label>Model</label>
      <select name="model" id="filter-model">
        <option value="">All Models</option>
        <option value="Escalade">Escalade</option>
        <option value="CT4">CT4</option>
        <option value="CT5">CT5</option>
        <option value="XT4">XT4</option>
        <option value="XT5">XT5</option>
        <option value="XT6">XT6</option>
      </select>
    `;
    
    // Filter button
    const filterButton = document.createElement('button');
    filterButton.type = 'submit';
    filterButton.className = 'btn btn-primary';
    filterButton.textContent = 'Apply Filters';
    
    // Add all to form
    form.appendChild(statusGroup);
    form.appendChild(modelGroup);
    form.appendChild(priceGroup);
    form.appendChild(filterButton);
    
    // Add to container
    container.appendChild(form);
    
    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Get filter values
      const newFilters = {
        status: document.getElementById('filter-status').value,
        model: document.getElementById('filter-model').value,
        price: document.getElementById('filter-price').value
      };
      
      // Update filters and reload
      filters = Object.fromEntries(
        Object.entries(newFilters).filter(([_, v]) => v !== '')
      );
      
      currentPage = 1;
      fetchInventory();
    });
  }
  
  /**
   * Fetch inventory from API
   */
  function fetchInventory() {
    loading = true;
    error = null;
    updateUI();
    
    // Build query string
    const queryParams = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) queryParams.append(key, value);
    });
    queryParams.append('page', currentPage);
    queryParams.append('pageSize', pageSize);
    
    fetch(`${API_ENDPOINT}?${queryParams.toString()}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to load inventory data');
        }
        return response.json();
      })
      .then(data => {
        inventory = data.vehicles;
        loading = false;
        updateUI();
        renderPagination(data.total, currentPage, pageSize);
      })
      .catch(err => {
        loading = false;
        error = err.message;
        updateUI();
      });
  }
  
  /**
   * Update UI based on state
   */
  function updateUI() {
    loadingElement.style.display = loading ? 'flex' : 'none';
    errorElement.style.display = error ? 'block' : 'none';
    
    if (error) {
      errorElement.textContent = error;
    }
    
    if (!loading && !error) {
      renderVehicles();
    }
  }
  
  /**
   * Render vehicle cards
   */
  function renderVehicles() {
    vehicleGrid.innerHTML = '';
    
    if (inventory.length === 0) {
      vehicleGrid.innerHTML = '<div class="no-results">No vehicles found matching your criteria. Please try different filters.</div>';
      return;
    }
    
    inventory.forEach(vehicle => {
      const card = document.createElement('div');
      card.className = 'vehicle-card';
      
      const status = vehicle.status === 'new' ? 'New' : 'Pre-Owned';
      const statusClass = vehicle.status === 'new' ? 'status-new' : 'status-used';
      const price = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(vehicle.price);
      
      card.innerHTML = `
        <div class="vehicle-image">
          <img src="${vehicle.images[0] || '/img/placeholder-vehicle.jpg'}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}">
          <span class="vehicle-status ${statusClass}">${status}</span>
        </div>
        <div class="vehicle-details">
          <h3>${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>
          <p class="vehicle-trim">${vehicle.trim}</p>
          <div class="vehicle-specs">
            <span><i class="icon icon-odometer"></i> ${vehicle.mileage.toLocaleString()} mi</span>
            <span><i class="icon icon-transmission"></i> ${vehicle.transmission}</span>
            <span><i class="icon icon-fuel"></i> ${vehicle.fuelType}</span>
            <span><i class="icon icon-color"></i> ${vehicle.exteriorColor}</span>
          </div>
          <div class="vehicle-price">${price}</div>
          <div class="vehicle-buttons">
            <a href="/inventory/${vehicle.id}" class="btn btn-primary">View Details</a>
            <button class="btn btn-secondary btn-cta" data-vehicle-id="${vehicle.id}">Contact About This Vehicle</button>
          </div>
        </div>
      `;
      
      vehicleGrid.appendChild(card);
      
      // Add event listener for quick contact buttons
      const ctaButton = card.querySelector('.btn-cta');
      ctaButton.addEventListener('click', () => {
        // Open contact form modal pre-filled with vehicle info
        openVehicleContactModal(vehicle);
      });
    });
  }
  
  /**
   * Render pagination controls
   */
  function renderPagination(total, current, size) {
    const pages = Math.ceil(total / size);
    paginationContainer.innerHTML = '';
    
    if (pages <= 1) return;
    
    const ul = document.createElement('ul');
    ul.className = 'pagination-list';
    
    // Previous button
    const prevLi = document.createElement('li');
    prevLi.className = current === 1 ? 'disabled' : '';
    const prevBtn = document.createElement('button');
    prevBtn.innerHTML = '&laquo; Previous';
    prevBtn.disabled = current === 1;
    prevBtn.addEventListener('click', () => {
      if (current > 1) {
        currentPage--;
        fetchInventory();
      }
    });
    prevLi.appendChild(prevBtn);
    ul.appendChild(prevLi);
    
    // Page numbers
    for (let i = 1; i <= pages; i++) {
      const li = document.createElement('li');
      li.className = i === current ? 'active' : '';
      const btn = document.createElement('button');
      btn.textContent = i;
      btn.addEventListener('click', () => {
        currentPage = i;
        fetchInventory();
      });
      li.appendChild(btn);
      ul.appendChild(li);
    }
    
    // Next button
    const nextLi = document.createElement('li');
    nextLi.className = current === pages ? 'disabled' : '';
    const nextBtn = document.createElement('button');
    nextBtn.innerHTML = 'Next &raquo;';
    nextBtn.disabled = current === pages;
    nextBtn.addEventListener('click', () => {
      if (current < pages) {
        currentPage++;
        fetchInventory();
      }
    });
    nextLi.appendChild(nextBtn);
    ul.appendChild(nextLi);
    
    paginationContainer.appendChild(ul);
  }
  
  /**
   * Open contact form modal pre-filled with vehicle information
   */
  function openVehicleContactModal(vehicle) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('vehicle-contact-modal');
    
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'vehicle-contact-modal';
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <span class="modal-close">&times;</span>
          <h2>Contact About This Vehicle</h2>
          <div class="vehicle-modal-info">
            <img class="modal-vehicle-image" src="" alt="">
            <div class="modal-vehicle-details">
              <h3 class="modal-vehicle-title"></h3>
              <p class="modal-vehicle-price"></p>
            </div>
          </div>
          <form id="vehicle-inquiry-form" data-form-type="vehicle-inquiry">
            <input type="hidden" name="vehicleId" id="inquiry-vehicle-id">
            <input type="hidden" name="vehicleInfo" id="inquiry-vehicle-info">
            
            <div class="form-group">
              <label for="inquiry-name">Your Name</label>
              <input type="text" id="inquiry-name" name="name" required>
            </div>
            
            <div class="form-group">
              <label for="inquiry-email">Email Address</label>
              <input type="email" id="inquiry-email" name="email" required>
            </div>
            
            <div class="form-group">
              <label for="inquiry-phone">Phone Number</label>
              <input type="tel" id="inquiry-phone" name="phone" required>
            </div>
            
            <div class="form-group">
              <label for="inquiry-message">Message</label>
              <textarea id="inquiry-message" name="message" rows="4" required></textarea>
            </div>
            
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Submit Inquiry</button>
              <button type="button" class="btn btn-secondary modal-cancel">Cancel</button>
            </div>
          </form>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // Close modal functionality
      const closeBtn = modal.querySelector('.modal-close');
      closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
      
      const cancelBtn = modal.querySelector('.modal-cancel');
      cancelBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
      
      // Close modal when clicking outside content
      window.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.style.display = 'none';
        }
      });
      
      // Form submission
      const form = modal.querySelector('#vehicle-inquiry-form');
      form.addEventListener('submit', handleInquirySubmit);
    }
    
    // Populate modal with vehicle info
    const modalImage = modal.querySelector('.modal-vehicle-image');
    modalImage.src = vehicle.images[0] || '/img/placeholder-vehicle.jpg';
    modalImage.alt = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    
    modal.querySelector('.modal-vehicle-title').textContent = 
      `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`;
    
    const price = new Intl.NumberFormat('en-US', 
      { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }
    ).format(vehicle.price);
    modal.querySelector('.modal-vehicle-price').textContent = price;
    
    // Set hidden field values
    modal.querySelector('#inquiry-vehicle-id').value = vehicle.id;
    modal.querySelector('#inquiry-vehicle-info').value = 
      `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim}`;
    
    // Pre-fill message
    modal.querySelector('#inquiry-message').value = 
      `I am interested in the ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim} listed for ${price}. Please contact me with more information.`;
    
    // Show modal
    modal.style.display = 'block';
  }
  
  /**
   * Handle inquiry form submission
   */
  async function handleInquirySubmit(e) {
    e.preventDefault();
    
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    
    const formData = new FormData(form);
    const formDataObj = {};
    formData.forEach((value, key) => {
      formDataObj[key] = value;
    });
    
    try {
      const response = await fetch('/.netlify/functions/lead-management', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          type: 'vehicle-inquiry',
          data: formDataObj
        })
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Replace form with success message
        form.innerHTML = `
          <div class="form-success">
            <h3>Inquiry Submitted!</h3>
            <p>${result.message || "Thank you for your inquiry. Ed will contact you shortly regarding this vehicle."}</p>
            <button type="button" class="btn btn-primary modal-close">Close</button>
          </div>
        `;
        
        // Add event listener to close button
        form.querySelector('.modal-close').addEventListener('click', () => {
          document.getElementById('vehicle-contact-modal').style.display = 'none';
        });
      } else {
        // Show error message
        const errorMsg = document.createElement('div');
        errorMsg.className = 'form-error';
        errorMsg.textContent = result.message || "There was an error submitting your inquiry. Please try again.";
        
        // Reset button
        submitBtn.textContent = originalBtnText;
        submitBtn.disabled = false;
        
        // Add error message before submit button
        form.querySelector('.form-actions').before(errorMsg);
      }
    } catch (error) {
      console.error('Error submitting form:', error);
      
      // Show error message
      const errorMsg = document.createElement('div');
      errorMsg.className = 'form-error';
      errorMsg.textContent = "There was an error submitting your inquiry. Please try again or contact Ed directly.";
      
      // Reset button
      submitBtn.textContent = originalBtnText;
      submitBtn.disabled = false;
      
      // Add error message before submit button
      form.querySelector('.form-actions').before(errorMsg);
    }
  }
}

// Auto-initialize on homepage for featured inventory
document.addEventListener('DOMContentLoaded', () => {
  const featuredInventory = document.getElementById('featured-inventory');
  
  if (featuredInventory) {
    initInventory('featured-inventory', { featured: 'true', limit: '3' });
  }
});
