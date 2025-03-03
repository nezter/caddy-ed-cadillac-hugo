/**
 * Inventory Management System
 * Handles fetching, filtering, and displaying vehicle inventory
 */

class InventoryManager {
  constructor() {
    this.vehicles = [];
    this.filteredVehicles = [];
    this.currentPage = 1;
    this.vehiclesPerPage = 12;
    this.filters = {};
    this.sortOrder = 'year-desc';
    
    // DOM elements
    this.inventoryResults = document.getElementById('inventory-results');
    this.inventoryLoading = document.getElementById('inventory-loading');
    this.inventoryCount = document.getElementById('inventory-count');
    this.inventoryPagination = document.getElementById('inventory-pagination');
    this.searchInput = document.getElementById('inventory-search');
    this.sortSelect = document.getElementById('inventory-sort');
    this.filterForm = document.getElementById('inventory-filters');
    this.resetBtn = document.querySelector('.reset-filters');
    
    this.initEventListeners();
  }

  initEventListeners() {
    // Only initialize if we're on the inventory page
    if (!this.inventoryResults) return;
    
    // Sort change
    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', () => {
        this.sortOrder = this.sortSelect.value;
        this.currentPage = 1;
        this.renderVehicles();
      });
    }
    
    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener('input', () => {
        this.currentPage = 1;
        this.applyFilters();
      });
    }
    
    // Reset filters
    if (this.resetBtn) {
      this.resetBtn.addEventListener('click', () => {
        this.filterForm.reset();
        this.filters = {};
        this.currentPage = 1;
        this.applyFilters();
      });
    }
    
    // Filter form inputs
    if (this.filterForm) {
      const inputs = this.filterForm.querySelectorAll('input, select');
      inputs.forEach(input => {
        input.addEventListener('change', () => {
          this.currentPage = 1;
          this.applyFilters();
        });
      });
    }
    
    // Initialize
    this.fetchInventory();
  }
  
  async fetchInventory() {
    if (!this.inventoryLoading) return;
    
    this.inventoryLoading.style.display = 'flex';
    
    try {
      // Fetch from Netlify function proxy to avoid CORS issues
      const response = await fetch('/.netlify/functions/inventory-proxy');
      
      if (!response.ok) {
        throw new Error('Failed to fetch inventory');
      }
      
      const data = await response.json();
      this.vehicles = data.vehicles || [];
      this.applyFilters();
      
    } catch (error) {
      console.error('Error fetching inventory:', error);
      this.showErrorMessage('Failed to load inventory. Please try again later.');
    } finally {
      this.inventoryLoading.style.display = 'none';
    }
  }
  
  applyFilters() {
    // Get current filter values
    if (this.filterForm) {
      const formData = new FormData(this.filterForm);
      
      // Build filters object
      this.filters = {
        minPrice: formData.get('minPrice') ? Number(formData.get('minPrice')) : null,
        maxPrice: formData.get('maxPrice') ? Number(formData.get('maxPrice')) : null,
        minYear: formData.get('minYear') ? Number(formData.get('minYear')) : null,
        maxYear: formData.get('maxYear') ? Number(formData.get('maxYear')) : null,
        minMileage: formData.get('minMileage') ? Number(formData.get('minMileage')) : null,
        maxMileage: formData.get('maxMileage') ? Number(formData.get('maxMileage')) : null,
        bodyStyle: formData.get('bodyStyle') || null,
        drivetrain: formData.get('drivetrain') || null,
        features: {
          leatherSeats: formData.get('hasLeatherSeats') === 'true',
          navigation: formData.get('hasNavigation') === 'true',
          sunroof: formData.get('hasSunroof') === 'true',
          heatedSeats: formData.get('hasHeatedSeats') === 'true'
        }
      };
    }
    
    // Apply search filter
    const searchTerm = this.searchInput ? this.searchInput.value.toLowerCase() : '';
    
    // Filter vehicles
    this.filteredVehicles = this.vehicles.filter(vehicle => {
      // Search filter
      if (searchTerm) {
        const searchMatch = 
          vehicle.title?.toLowerCase().includes(searchTerm) || 
          vehicle.description?.toLowerCase().includes(searchTerm) ||
          vehicle.vin?.toLowerCase().includes(searchTerm) ||
          vehicle.stockNumber?.toLowerCase().includes(searchTerm);
        
        if (!searchMatch) return false;
      }
      
      // Price filters
      if (this.filters.minPrice && vehicle.price < this.filters.minPrice) return false;
      if (this.filters.maxPrice && vehicle.price > this.filters.maxPrice) return false;
      
      // Year filters
      if (this.filters.minYear && vehicle.year < this.filters.minYear) return false;
      if (this.filters.maxYear && vehicle.year > this.filters.maxYear) return false;
      
      // Mileage filters
      if (this.filters.minMileage && vehicle.mileage < this.filters.minMileage) return false;
      if (this.filters.maxMileage && vehicle.mileage > this.filters.maxMileage) return false;
      
      // Body style filter
      if (this.filters.bodyStyle && vehicle.bodyStyle !== this.filters.bodyStyle) return false;
      
      // Drivetrain filter
      if (this.filters.drivetrain && vehicle.drivetrain !== this.filters.drivetrain) return false;
      
      // Features filters
      if (this.filters.features.leatherSeats && !vehicle.features?.includes('Leather Seats')) return false;
      if (this.filters.features.navigation && !vehicle.features?.includes('Navigation')) return false;
      if (this.filters.features.sunroof && !vehicle.features?.includes('Sunroof')) return false;
      if (this.filters.features.heatedSeats && !vehicle.features?.includes('Heated Seats')) return false;
      
      return true;
    });
    
    this.renderVehicles();
  }
  
  sortVehicles() {
    const [sortBy, direction] = this.sortOrder.split('-');
    
    this.filteredVehicles.sort((a, b) => {
      if (sortBy === 'year') {
        return direction === 'asc' ? a.year - b.year : b.year - a.year;
      } else if (sortBy === 'price') {
        return direction === 'asc' ? a.price - b.price : b.price - a.price;
      } else if (sortBy === 'mileage') {
        return direction === 'asc' ? a.mileage - b.mileage : b.mileage - a.mileage;
      }
      return 0;
    });
  }
  
  renderVehicles() {
    if (!this.inventoryResults) return;
    
    // Sort vehicles
    this.sortVehicles();
    
    // Update count
    if (this.inventoryCount) {
      const count = this.filteredVehicles.length;
      this.inventoryCount.textContent = `${count} vehicle${count !== 1 ? 's' : ''}`;
    }
    
    // Get paginated subset
    const startIndex = (this.currentPage - 1) * this.vehiclesPerPage;
    const endIndex = startIndex + this.vehiclesPerPage;
    const paginatedVehicles = this.filteredVehicles.slice(startIndex, endIndex);
    
    // Clear previous results
    this.inventoryResults.innerHTML = '';
    
    if (paginatedVehicles.length === 0) {
      this.inventoryResults.innerHTML = `
        <div class="no-results">
          <h3>No vehicles match your criteria</h3>
          <p>Try adjusting your filters or search term.</p>
        </div>
      `;
      this.inventoryPagination.innerHTML = '';
      return;
    }
    
    // Create vehicle cards
    paginatedVehicles.forEach(vehicle => {
      const vehicleCard = this.createVehicleCard(vehicle);
      this.inventoryResults.appendChild(vehicleCard);
    });
    
    // Render pagination
    this.renderPagination();
  }
  
  createVehicleCard(vehicle) {
    const card = document.createElement('div');
    card.className = 'vehicle-card';
    
    const formattedPrice = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(vehicle.price);
    
    const formattedMileage = new Intl.NumberFormat('en-US').format(vehicle.mileage);
    
    card.innerHTML = `
      <div class="vehicle-image">
        <img src="${vehicle.imageUrl || '/img/vehicle-placeholder.jpg'}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" loading="lazy">
        ${vehicle.isCertified ? '<span class="certified-badge">Certified</span>' : ''}
      </div>
      <div class="vehicle-info">
        <h3 class="vehicle-title">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>
        <p class="vehicle-trim">${vehicle.trim || ''}</p>
        <div class="vehicle-specs">
          <span class="spec"><i class="icon-gauge"></i> ${formattedMileage} mi</span>
          <span class="spec"><i class="icon-gearshift"></i> ${vehicle.transmission || 'N/A'}</span>
          <span class="spec"><i class="icon-gas"></i> ${vehicle.fuelType || 'N/A'}</span>
          <span class="spec"><i class="icon-color"></i> ${vehicle.exteriorColor || 'N/A'}</span>
        </div>
        <div class="vehicle-pricing">
          <span class="vehicle-price">${formattedPrice}</span>
          ${vehicle.salePrice ? `<span class="vehicle-sale-price">${new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0}).format(vehicle.salePrice)}</span>` : ''}
        </div>
      </div>
      <div class="vehicle-actions">
        <a href="/inventory/${vehicle.id || vehicle.vin}" class="btn btn-primary">View Details</a>
        <button class="btn btn-secondary save-vehicle" data-vehicle-id="${vehicle.id || vehicle.vin}">Save</button>
      </div>
    `;
    
    return card;
  }
  
  renderPagination() {
    if (!this.inventoryPagination) return;
    
    const totalPages = Math.ceil(this.filteredVehicles.length / this.vehiclesPerPage);
    
    if (totalPages <= 1) {
      this.inventoryPagination.innerHTML = '';
      return;
    }
    
    let paginationHTML = '<ul class="pagination">';
    
    // Previous button
    paginationHTML += `
      <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
        <button class="page-link" data-page="${this.currentPage - 1}" ${this.currentPage === 1 ? 'disabled' : ''}>Previous</button>
      </li>
    `;
    
    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    if (startPage > 1) {
      paginationHTML += `
        <li class="page-item">
          <button class="page-link" data-page="1">1</button>
        </li>
      `;
      
      if (startPage > 2) {
        paginationHTML += '<li class="page-item disabled"><span class="page-link">...</span></li>';
      }
    }
    
    for (let i = startPage; i <= endPage; i++) {
      paginationHTML += `
        <li class="page-item ${i === this.currentPage ? 'active' : ''}">
          <button class="page-link" data-page="${i}">${i}</button>
        </li>
      `;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        paginationHTML += '<li class="page-item disabled"><span class="page-link">...</span></li>';
      }
      
      paginationHTML += `
        <li class="page-item">
          <button class="page-link" data-page="${totalPages}">${totalPages}</button>
        </li>
      `;
    }
    
    // Next button
    paginationHTML += `
      <li class="page-item ${this.currentPage === totalPages ? 'disabled' : ''}">
        <button class="page-link" data-page="${this.currentPage + 1}" ${this.currentPage === totalPages ? 'disabled' : ''}>Next</button>
      </li>
    `;
    
    paginationHTML += '</ul>';
    
    this.inventoryPagination.innerHTML = paginationHTML;
    
    // Add event listeners to pagination buttons
    const pageButtons = this.inventoryPagination.querySelectorAll('.page-link');
    pageButtons.forEach(button => {
      if (!button.hasAttribute('disabled') && button.dataset.page) {
        button.addEventListener('click', () => {
          this.currentPage = parseInt(button.dataset.page);
          this.renderVehicles();
          // Scroll to top of results
          this.inventoryResults.scrollIntoView({ behavior: 'smooth' });
        });
      }
    });
  }
  
  showErrorMessage(message) {
    if (!this.inventoryResults) return;
    
    this.inventoryResults.innerHTML = `
      <div class="error-message">
        <h3>Error</h3>
        <p>${message}</p>
        <button class="btn btn-primary retry-btn">Try Again</button>
      </div>
    `;
    
    const retryBtn = this.inventoryResults.querySelector('.retry-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.fetchInventory());
    }
    
    if (this.inventoryCount) {
      this.inventoryCount.textContent = '0 vehicles';
    }
    
    if (this.inventoryPagination) {
      this.inventoryPagination.innerHTML = '';
    }
  }
}

// Initialize inventory manager when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const inventoryManager = new InventoryManager();
});

export default InventoryManager;

document.addEventListener('DOMContentLoaded', () => {
  const inventoryContainer = document.getElementById('inventory-listing');
  const filterForm = document.getElementById('inventory-filter');
  const loadingSpinner = document.getElementById('loading-spinner');
  
  if (!inventoryContainer) return;

  // Initialize filters from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const filters = {
    make: urlParams.get('make') || 'Cadillac',
    model: urlParams.get('model') || '',
    year: urlParams.get('year') || '',
    priceMin: urlParams.get('priceMin') || '',
    priceMax: urlParams.get('priceMax') || '',
    condition: urlParams.get('condition') || 'new'
  };

  // Populate filter form if it exists
  if (filterForm) {
    Object.keys(filters).forEach(key => {
      const input = filterForm.querySelector(`[name="${key}"]`);
      if (input && filters[key]) {
        input.value = filters[key];
      }
    });

    filterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Update filters from form
      const formData = new FormData(filterForm);
      formData.forEach((value, key) => {
        filters[key] = value;
      });
      
      // Update URL with filter params
      const newParams = new URLSearchParams();
      Object.keys(filters).forEach(key => {
        if (filters[key]) {
          newParams.set(key, filters[key]);
        }
      });
      
      window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
      
      // Fetch new results
      fetchInventory();
    });
  }

  function fetchInventory() {
    if (loadingSpinner) loadingSpinner.style.display = 'block';
    if (inventoryContainer) inventoryContainer.innerHTML = '';
    
    // Build API URL with filters
    const apiParams = new URLSearchParams();
    Object.keys(filters).forEach(key => {
      if (filters[key]) {
        apiParams.set(key, filters[key]);
      }
    });
    
    fetch(`/api/inventory?${apiParams.toString()}`)
      .then(response => {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(data => {
        renderInventory(data);
        if (loadingSpinner) loadingSpinner.style.display = 'none';
      })
      .catch(error => {
        console.error('Error fetching inventory:', error);
        inventoryContainer.innerHTML = `
          <div class="error-message">
            <p>Sorry, we couldn't load the inventory at this time. Please try again later.</p>
          </div>
        `;
        if (loadingSpinner) loadingSpinner.style.display = 'none';
      });
  }

  function renderInventory(vehicles) {
    if (!vehicles || vehicles.length === 0) {
      inventoryContainer.innerHTML = `
        <div class="no-results">
          <h3>No vehicles found</h3>
          <p>Try adjusting your filters to see more results.</p>
        </div>
      `;
      return;
    }

    const html = vehicles.map(vehicle => `
      <div class="inventory-item" data-id="${vehicle.id}">
        <div class="inventory-image">
          <img src="${vehicle.image || '/img/placeholder-car.jpg'}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" loading="lazy">
        </div>
        <div class="inventory-details">
          <h3>${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>
          <p class="inventory-trim">${vehicle.trim}</p>
          <div class="inventory-specs">
            <span>${vehicle.mileage} miles</span>
            <span>${vehicle.transmission}</span>
            <span>${vehicle.extColor}</span>
          </div>
          <div class="inventory-price">
            <strong>$${formatNumber(vehicle.price)}</strong>
          </div>
          <div class="inventory-actions">
            <a href="/inventory/${vehicle.id}/" class="btn btn-primary">View Details</a>
            <a href="/contact/?vehicle=${vehicle.id}" class="btn btn-secondary">Inquire</a>
          </div>
        </div>
      </div>
    `).join('');

    inventoryContainer.innerHTML = html;
  }

  function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }

  // Initial inventory fetch
  fetchInventory();
});

// Inventory management component for Caddy Ed website

const CACHE_DURATION = 3600 * 1000; // 1 hour in milliseconds
let cachedInventory = null;
let lastFetchTime = 0;

/**
 * Fetch inventory data from the Netlify function
 * @param {Object} options - Search filter options
 * @returns {Promise<Array>} - Array of inventory items
 */
export async function fetchInventory(options = {}) {
  const now = Date.now();
  
  // Use cached data if available and not expired
  if (cachedInventory && now - lastFetchTime < CACHE_DURATION) {
    return filterInventory(cachedInventory, options);
  }
  
  try {
    // Build query parameters
    const params = new URLSearchParams();
    if (options.status) params.append('search', options.status); // new, used, certified
    if (options.make) params.append('make', options.make);
    if (options.model) params.append('model', options.model);
    if (options.year) params.append('year', options.year);
    if (options.priceRange) {
      params.append('minPrice', options.priceRange[0]);
      params.append('maxPrice', options.priceRange[1]);
    }
    
    // Fetch data from Netlify function
    const response = await fetch(`/.netlify/functions/inventory-proxy?${params.toString()}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch inventory: ${response.statusText}`);
    }
    
    const data = await response.json();
    
    // Update cache
    cachedInventory = data;
    lastFetchTime = now;
    
    return filterInventory(data, options);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    // Return cached data as fallback even if expired
    return cachedInventory ? filterInventory(cachedInventory, options) : [];
  }
}

/**
 * Filter inventory based on user-selected options
 * @param {Array} inventory - Full inventory data
 * @param {Object} options - Filter options
 * @returns {Array} - Filtered inventory
 */
function filterInventory(inventory, options) {
  if (!inventory || !Array.isArray(inventory)) {
    return [];
  }
  
  return inventory.filter(item => {
    // Apply all filters
    if (options.bodyType && item.bodyType !== options.bodyType) return false;
    if (options.color && item.exteriorColor !== options.color) return false;
    if (options.minMileage && item.mileage < options.minMileage) return false;
    if (options.maxMileage && item.mileage > options.maxMileage) return false;
    
    return true;
  });
}

/**
 * Renders inventory item to DOM
 * @param {Object} item - Vehicle inventory item
 * @param {HTMLElement} container - Container element
 */
export function renderInventoryItem(item, container) {
  const itemElement = document.createElement('div');
  itemElement.className = 'inventory-item';
  
  itemElement.innerHTML = `
    <div class="inventory-image">
      <img src="${item.images[0] || '/images/no-image.jpg'}" alt="${item.year} ${item.make} ${item.model}">
    </div>
    <div class="inventory-details">
      <h3>${item.year} ${item.make} ${item.model}</h3>
      <p class="price">$${item.price.toLocaleString()}</p>
      <p class="specs">
        <span>${item.mileage.toLocaleString()} mi</span> | 
        <span>${item.exteriorColor}</span> | 
        <span>${item.transmission}</span>
      </p>
      <div class="inventory-actions">
        <a href="/inventory/${item.id}" class="btn btn-primary">View Details</a>
        <button class="btn btn-secondary test-drive-btn" data-vehicle="${item.id}">Schedule Test Drive</button>
      </div>
    </div>
  `;
  
  // Add event listener for test drive button
  const testDriveBtn = itemElement.querySelector('.test-drive-btn');
  testDriveBtn.addEventListener('click', () => {
    window.location.href = `/test-drive?vehicle=${item.id}`;
  });
  
  container.appendChild(itemElement);
}

/**
 * Initialize inventory display on the page
 * @param {string} containerId - HTML ID of container element
 * @param {Object} defaultOptions - Default filter options
 */
export function initInventory(containerId = 'inventory-container', defaultOptions = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  // Create filter form
  const filterForm = document.createElement('form');
  filterForm.className = 'inventory-filters';
  filterForm.innerHTML = `
    <div class="filter-group">
      <label for="status-filter">Status</label>
      <select id="status-filter" name="status">
        <option value="new" ${defaultOptions.status === 'new' ? 'selected' : ''}>New</option>
        <option value="used" ${defaultOptions.status === 'used' ? 'selected' : ''}>Used</option>
        <option value="certified" ${defaultOptions.status === 'certified' ? 'selected' : ''}>Certified Pre-Owned</option>
      </select>
    </div>
    <div class="filter-group">
      <label for="model-filter">Model</label>
      <select id="model-filter" name="model">
        <option value="">All Models</option>
        <option value="Escalade">Escalade</option>
        <option value="CT4">CT4</option>
        <option value="CT5">CT5</option>
        <option value="XT4">XT4</option>
        <option value="XT5">XT5</option>
        <option value="XT6">XT6</option>
      </select>
    </div>
    <div class="filter-group">
      <button type="submit" class="btn btn-primary">Apply Filters</button>
      <button type="reset" class="btn btn-secondary">Reset</button>
    </div>
  `;
  
  // Create inventory results container
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'inventory-results';
  
  // Loading indicator
  const loadingElement = document.createElement('div');
  loadingElement.className = 'loading-indicator';
  loadingElement.textContent = 'Loading inventory...';
  
  // Add elements to container
  container.appendChild(filterForm);
  container.appendChild(loadingElement);
  container.appendChild(resultsContainer);
  
  // Load initial inventory
  loadInventory(defaultOptions, resultsContainer, loadingElement);
  
  // Add event listeners
  filterForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(filterForm);
    const options = {
      status: formData.get('status'),
      model: formData.get('model')
    };
    
    loadInventory(options, resultsContainer, loadingElement);
  });
  
  filterForm.addEventListener('reset', () => {
    setTimeout(() => {
      loadInventory(defaultOptions, resultsContainer, loadingElement);
    }, 0);
  });
}

/**
 * Load inventory with specified options
 * @param {Object} options - Filter options
 * @param {HTMLElement} container - Results container
 * @param {HTMLElement} loadingElement - Loading indicator element
 */
async function loadInventory(options, container, loadingElement) {
  // Show loading
  loadingElement.style.display = 'block';
  container.innerHTML = '';
  
  try {
    const inventory = await fetchInventory(options);
    
    // Hide loading
    loadingElement.style.display = 'none';
    
    if (inventory.length === 0) {
      container.innerHTML = '<div class="no-results">No vehicles found matching your criteria.</div>';
      return;
    }
    
    // Render each item
    inventory.forEach(item => {
      renderInventoryItem(item, container);
    });
    
  } catch (error) {
    loadingElement.style.display = 'none';
    container.innerHTML = '<div class="error-message">Failed to load inventory. Please try again later.</div>';
    console.error('Failed to load inventory:', error);
  }
}
