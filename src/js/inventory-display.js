/**
 * Inventory Display
 * Displays vehicle inventory data with filtering and sorting
 */

import InventoryFetcher from './inventory-fetcher';

class InventoryDisplay {
  constructor(options = {}) {
    this.containerSelector = options.containerSelector || '#vehicle-inventory';
    this.itemsPerPage = options.itemsPerPage || 9;
    this.currentPage = 1;
    this.filterForm = document.querySelector(options.filterFormSelector || '#inventory-filter-form');
    this.sortSelect = document.querySelector(options.sortSelectSelector || '#inventory-sort');
    this.paginationContainer = document.querySelector(options.paginationSelector || '#inventory-pagination');
    
    this.inventoryFetcher = new InventoryFetcher({
      searchParams: {
        search: 'new',
        make: 'Cadillac',
        model: options.defaultModel || 'CT5'
      }
    });
    
    this.initialize();
  }
  
  async initialize() {
    this.container = document.querySelector(this.containerSelector);
    if (!this.container) return;
    
    this.container.innerHTML = '<div class="loading-spinner">Loading inventory data...</div>';
    
    try {
      // Fetch inventory data
      this.inventory = await this.inventoryFetcher.fetchInventory();
      
      // Set up filter and sort elements
      this.setupFilters();
      this.setupSorting();
      
      // Display inventory
      this.updateDisplay();
    } catch (error) {
      console.error('Error initializing inventory display:', error);
      this.container.innerHTML = `
        <div class="error-message">
          <p>Error loading inventory data. Please try again later.</p>
          <button id="retry-inventory" class="button">Retry</button>
        </div>
      `;
      
      document.getElementById('retry-inventory')?.addEventListener('click', () => {
        this.initialize();
      });
    }
  }
  
  setupFilters() {
    if (!this.filterForm) return;
    
    // Add event listeners to filter elements
    const filterInputs = this.filterForm.querySelectorAll('input, select');
    filterInputs.forEach(input => {
      input.addEventListener('change', () => {
        this.currentPage = 1; // Reset to first page when filter changes
        this.updateDisplay();
      });
    });
    
    // Populate filter options based on inventory
    this.populateFilterOptions();
  }
  
  populateFilterOptions() {
    if (!this.filterForm) return;
    
    // Get unique values for models
    const models = [...new Set(this.inventory.map(vehicle => vehicle.model))];
    const modelSelect = this.filterForm.querySelector('[name="model"]');
    if (modelSelect && models.length > 0) {
      modelSelect.innerHTML = '<option value="">All Models</option>';
      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        modelSelect.appendChild(option);
      });
    }
    
    // Get unique values for years
    const years = [...new Set(this.inventory.map(vehicle => vehicle.year))].sort((a, b) => b - a);
    const yearSelect = this.filterForm.querySelector('[name="year"]');
    if (yearSelect && years.length > 0) {
      yearSelect.innerHTML = '<option value="">All Years</option>';
      years.forEach(year => {
        const option = document.createElement('option');
        option.value = year;
        option.textContent = year;
        yearSelect.appendChild(option);
      });
    }
  }
  
  setupSorting() {
    if (!this.sortSelect) return;
    
    this.sortSelect.addEventListener('change', () => {
      this.updateDisplay();
    });
  }
  
  updateDisplay() {
    // Filter inventory
    const filteredInventory = this.filterInventory();
    
    // Sort inventory
    const sortedInventory = this.sortInventory(filteredInventory);
    
    // Paginate inventory
    const paginatedInventory = this.paginateInventory(sortedInventory);
    
    // Render inventory
    this.renderInventory(paginatedInventory, filteredInventory.length);
    
    // Update pagination
    this.renderPagination(filteredInventory.length);
  }
  
  filterInventory() {
    if (!this.filterForm) return this.inventory;
    
    return this.inventory.filter(vehicle => {
      // Get all active filters
      const formData = new FormData(this.filterForm);
      const filters = {};
      
      for (const [key, value] of formData.entries()) {
        if (value) filters[key] = value;
      }
      
      // Check each filter against vehicle
      return Object.entries(filters).every(([key, value]) => {
        // Price range filter
        if (key === 'minPrice') {
          return vehicle.price >= parseInt(value);
        }
        if (key === 'maxPrice') {
          return vehicle.price <= parseInt(value);
        }
        
        // Other filters (exact match)
        return !value || String(vehicle[key]) === String(value);
      });
    });
  }
  
  sortInventory(inventory) {
    if (!this.sortSelect || !this.sortSelect.value) return inventory;
    
    const sortValue = this.sortSelect.value;
    
    return [...inventory].sort((a, b) => {
      switch (sortValue) {
        case 'price-asc':
          return a.price - b.price;
        case 'price-desc':
          return b.price - a.price;
        case 'year-desc':
          return b.year - a.year;
        case 'year-asc':
          return a.year - b.year;
        case 'model-asc':
          return a.model.localeCompare(b.model);
        case 'model-desc':
          return b.model.localeCompare(a.model);
        default:
          return 0;
      }
    });
  }
  
  paginateInventory(inventory) {
    const startIdx = (this.currentPage - 1) * this.itemsPerPage;
    const endIdx = startIdx + this.itemsPerPage;
    
    return inventory.slice(startIdx, endIdx);
  }
  
  renderInventory(vehicles, totalCount) {
    if (!this.container) return;
    
    if (vehicles.length === 0) {
      this.container.innerHTML = `
        <div class="no-results">
          <h3>No vehicles found</h3>
          <p>Please adjust your filters and try again.</p>
        </div>
      `;
      return;
    }
    
    let html = `
      <div class="results-count">Showing ${vehicles.length} of ${totalCount} vehicles</div>
      <div class="vehicle-grid">
    `;
    
    vehicles.forEach(vehicle => {
      html += `
        <div class="vehicle-card" data-id="${vehicle.id}" data-year="${vehicle.year}" data-make="${vehicle.make}" data-model="${vehicle.model}" data-price="${vehicle.price}" data-mileage="${vehicle.mileage}">
          <div class="vehicle-image">
            <img src="${vehicle.image || '/images/vehicle-placeholder.jpg'}" alt="${vehicle.title}" loading="lazy">
          </div>
          <div class="vehicle-details">
            <h3 class="vehicle-title">${vehicle.title}</h3>
            <p class="vehicle-price">${vehicle.priceRaw || `$${vehicle.price.toLocaleString()}`}</p>
            <div class="vehicle-specs">
              <span class="vehicle-year">${vehicle.year}</span>
              <span class="vehicle-mileage">${vehicle.mileageRaw || `${vehicle.mileage.toLocaleString()} miles`}</span>
            </div>
            <div class="vehicle-features">
              ${(vehicle.features || []).slice(0, 3).map(feature => `<span class="feature">${feature}</span>`).join('')}
            </div>
            <div class="vehicle-actions">
              <a href="${vehicle.link}" class="button primary-button">View Details</a>
              <button class="button outline-button favorite-toggle" aria-label="Add to favorites" aria-checked="false">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
              </button>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    this.container.innerHTML = html;
    
    // Initialize favorites
    this.initializeFavorites();
  }
  
  renderPagination(totalCount) {
    if (!this.paginationContainer) return;
    
    const totalPages = Math.ceil(totalCount / this.itemsPerPage);
    
    if (totalPages <= 1) {
      this.paginationContainer.innerHTML = '';
      return;
    }
    
    let html = `<div class="pagination">`;
    
    // Previous button
    html += `
      <button class="page-button prev-button" ${this.currentPage === 1 ? 'disabled' : ''} data-page="prev">
        Previous
      </button>
    `;
    
    // Page numbers
    const maxPages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
    const endPage = Math.min(totalPages, startPage + maxPages - 1);
    
    // Adjust start page if needed
    startPage = Math.max(1, endPage - maxPages + 1);
    
    if (startPage > 1) {
      html += `<button class="page-button" data-page="1">1</button>`;
      if (startPage > 2) html += `<span class="page-ellipsis">...</span>`;
    }
    
    for (let i = startPage; i <= endPage; i++) {
      html += `
        <button class="page-button ${i === this.currentPage ? 'active' : ''}" data-page="${i}">
          ${i}
        </button>
      `;
    }
    
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) html += `<span class="page-ellipsis">...</span>`;
      html += `<button class="page-button" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    // Next button
    html += `
      <button class="page-button next-button" ${this.currentPage === totalPages ? 'disabled' : ''} data-page="next">
        Next
      </button>
    `;
    
    html += `</div>`;
    this.paginationContainer.innerHTML = html;
    
    // Add event listeners
    this.paginationContainer.querySelectorAll('.page-button').forEach(button => {
      button.addEventListener('click', () => {
        if (button.hasAttribute('disabled')) return;
        
        const page = button.dataset.page;
        
        if (page === 'prev') {
          this.currentPage--;
        } else if (page === 'next') {
          this.currentPage++;
        } else {
          this.currentPage = parseInt(page);
        }
        
        this.updateDisplay();
        
        // Scroll to top of inventory
        this.container.scrollIntoView({ behavior: 'smooth' });
      });
    });
  }
  
  initializeFavorites() {
    const savedFavorites = localStorage.getItem('favoriteVehicles');
    const favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
    
    const toggleButtons = document.querySelectorAll('.favorite-toggle');
    toggleButtons.forEach(button => {
      const card = button.closest('.vehicle-card');
      const vehicleId = card.dataset.id;
      
      // Set initial state
      if (favorites.includes(vehicleId)) {
        button.classList.add('active');
        button.setAttribute('aria-checked', 'true');
      }
      
      button.addEventListener('click', () => {
        button.classList.toggle('active');
        const isActive = button.classList.contains('active');
        button.setAttribute('aria-checked', isActive ? 'true' : 'false');
        
        // Update favorites in localStorage
        const updatedFavorites = isActive 
          ? [...favorites, vehicleId] 
          : favorites.filter(id => id !== vehicleId);
        
        localStorage.setItem('favoriteVehicles', JSON.stringify(updatedFavorites));
      });
    });
  }
}

export default InventoryDisplay;
