/**
 * InventoryFilters - Main class to handle vehicle inventory filtering
 * 
 * This class integrates FilterUI and FilterManager with the inventory display,
 * providing a complete filtering solution for vehicle inventory
 */

import FilterUI from './FilterUI';

class InventoryFilters {
  /**
   * Create a new InventoryFilters instance
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      filterContainer: '#inventory-filters',
      filterToggle: '.filter-toggle',
      resultsContainer: '#vehicle-inventory',
      loadingClass: 'filters-loading',
      resultsCountSelector: '.results-count',
      inventoryFetchEndpoint: '/api/inventory', // API endpoint to fetch inventory
      ...options
    };
    
    this.inventory = []; // Will store the full inventory
    this.filteredInventory = []; // Will store filtered results
    this.isLoading = false;

    // Initialize FilterUI with a callback for filter changes
    this.filterUI = new FilterUI({
      filterContainer: this.options.filterContainer,
      filterToggle: this.options.filterToggle,
      resultsContainer: this.options.resultsContainer,
      onFilterChange: this.handleFilterChange.bind(this)
    });
    
    // Reference to filter manager
    this.filterManager = this.filterUI.filterManager;
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the component
   */
  async init() {
    try {
      // Show loading state
      this.setLoading(true);
      
      // Fetch inventory data
      await this.fetchInventory();
      
      // Apply initial filters
      this.applyFilters();
      
      // Set up sort change event listener
      this.setupSortHandler();
      
    } catch (error) {
      console.error('Failed to initialize inventory filters:', error);
      this.showError('Failed to load inventory data. Please try again later.');
    } finally {
      this.setLoading(false);
    }
  }
  
  /**
   * Fetch inventory data
   */
  async fetchInventory() {
    try {
      const response = await fetch(this.options.inventoryFetchEndpoint);
      
      if (!response.ok) {
        throw new Error(`API responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.success && Array.isArray(data.vehicles)) {
        this.inventory = data.vehicles;
        return data.vehicles;
      } else {
        throw new Error('Invalid API response format');
      }
    } catch (error) {
      console.error('Error fetching inventory:', error);
      this.inventory = []; // Reset to empty array on error
      throw error;
    }
  }
  
  /**
   * Apply filters to the inventory
   */
  applyFilters() {
    // Get filter state from the filter manager
    const filterState = this.filterManager.getFilterState();
    
    // Apply filters to get filtered inventory
    this.filteredInventory = this.filterManager.applyFilters(this.inventory);
    
    // Apply sorting
    this.filteredInventory = this.filterManager.sortItems(this.filteredInventory);
    
    // Update the UI with filtered results
    this.renderResults(this.filteredInventory);
  }
  
  /**
   * Handle filter changes
   * @param {Object} state - New filter state
   */
  handleFilterChange(state) {
    this.setLoading(true);
    
    // Apply filters and render results
    this.applyFilters();
    
    // Wait a bit before removing loading state for UI feedback
    setTimeout(() => {
      this.setLoading(false);
    }, 300);
  }
  
  /**
   * Setup sort change handler
   */
  setupSortHandler() {
    const sortSelect = document.querySelector('#inventory-sort');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this.filterManager.filterState.sort = sortSelect.value;
        this.handleFilterChange(this.filterManager.filterState);
      });
    }
  }
  
  /**
   * Render inventory results
   * @param {Array} vehicles - Filtered vehicles to display
   */
  renderResults(vehicles) {
    if (!this.options.resultsContainer) return;
    
    const container = document.querySelector(this.options.resultsContainer);
    if (!container) return;
    
    // Update results count if element exists
    const countEl = document.querySelector(this.options.resultsCountSelector);
    if (countEl) {
      countEl.textContent = `${vehicles.length} vehicle${vehicles.length !== 1 ? 's' : ''} found`;
    }
    
    // If no results, show empty state
    if (vehicles.length === 0) {
      container.innerHTML = `
        <div class="empty-results">
          <h3>No vehicles match your search</h3>
          <p>Try adjusting your filters or <button type="button" class="reset-search-btn">reset all filters</button></p>
        </div>
      `;
      
      // Add event listener to reset button
      const resetBtn = container.querySelector('.reset-search-btn');
      if (resetBtn) {
        resetBtn.addEventListener('click', () => {
          this.filterManager.resetFilters();
        });
      }
      
      return;
    }
    
    // Generate HTML for results
    let html = '<div class="vehicle-grid">';
    
    vehicles.forEach(vehicle => {
      html += this.generateVehicleCardHTML(vehicle);
    });
    
    html += '</div>';
    
    // Add pagination if needed
    const pageSize = this.filterManager.filterState.limit;
    const totalPages = Math.ceil(vehicles.length / pageSize);
    
    if (totalPages > 1) {
      html += this.generatePaginationHTML(totalPages, this.filterManager.filterState.page);
    }
    
    container.innerHTML = html;
    
    // Add event listeners to pagination
    this.setupPaginationHandlers();
  }
  
  /**
   * Generate HTML for a vehicle card
   * @param {Object} vehicle - Vehicle data
   * @return {string} HTML for the vehicle card
   */
  generateVehicleCardHTML(vehicle) {
    const { make, model, year, price, mileage, exteriorColor, image, vin, trim, description, features } = vehicle;
    
    const formattedPrice = typeof price === 'number' 
      ? '$' + price.toLocaleString()
      : price;
    
    const formattedMileage = typeof mileage === 'number'
      ? mileage.toLocaleString() + ' miles'
      : mileage;
      
    const truncatedDescription = description?.length > 120
      ? description.substring(0, 120) + '...'
      : description || '';
    
    // Get top 3 features to display
    const topFeatures = Array.isArray(features) ? features.slice(0, 3) : [];
      
    return `
      <div class="vehicle-card">
        <div class="vehicle-image">
          <a href="/inventory/${vin || 'detail'}">
            <img 
              src="${image || '/img/placeholder-vehicle.jpg'}" 
              alt="${year} ${make} ${model} ${trim || ''}" 
              loading="lazy"
            >
          </a>
        </div>
        <div class="vehicle-info">
          <h3 class="vehicle-title">
            <a href="/inventory/${vin || 'detail'}">${year} ${make} ${model} ${trim || ''}</a>
          </h3>
          <div class="vehicle-price">${formattedPrice}</div>
          <div class="vehicle-meta">
            <span class="vehicle-mileage">${formattedMileage}</span>
            ${exteriorColor ? `<span class="vehicle-color">${exteriorColor}</span>` : ''}
          </div>
          <div class="vehicle-description">${truncatedDescription}</div>
          ${topFeatures.length > 0 ? `
            <div class="vehicle-features">
              ${topFeatures.map(feature => `
                <span class="vehicle-feature">${feature}</span>
              `).join('')}
            </div>
          ` : ''}
          <div class="vehicle-actions">
            <a href="/inventory/${vin || 'detail'}" class="btn btn-details">View Details</a>
          </div>
        </div>
      </div>
    `;
  }
  
  /**
   * Generate HTML for pagination
   * @param {number} totalPages - Total number of pages
   * @param {number} currentPage - Current page number
   * @return {string} HTML for the pagination component
   */
  generatePaginationHTML(totalPages, currentPage) {
    let html = '<div class="inventory-pagination">';
    
    // Previous button
    html += `
      <button 
        type="button" 
        class="pagination-btn prev-btn ${currentPage === 1 ? 'disabled' : ''}" 
        data-page="${currentPage - 1}" 
        ${currentPage === 1 ? 'disabled' : ''}
      >
        <span aria-hidden="true">&laquo;</span> Previous
      </button>
    `;
    
    // Page numbers
    html += '<div class="pagination-pages">';
    
    const maxPagesToShow = 5;
    const pagesBefore = Math.floor(maxPagesToShow / 2);
    const pagesAfter = Math.ceil(maxPagesToShow / 2) - 1;
    
    let startPage = Math.max(1, currentPage - pagesBefore);
    let endPage = Math.min(totalPages, currentPage + pagesAfter);
    
    // Adjust if we're near the start or end
    if (startPage <= 1) {
      endPage = Math.min(totalPages, maxPagesToShow);
    }
    if (endPage >= totalPages) {
      startPage = Math.max(1, totalPages - maxPagesToShow + 1);
    }
    
    // First page and ellipsis if needed
    if (startPage > 1) {
      html += `<button type="button" class="pagination-btn page-number" data-page="1">1</button>`;
      if (startPage > 2) {
        html += '<span class="pagination-ellipsis">&hellip;</span>';
      }
    }
    
    // Page numbers
    for (let i = startPage; i <= endPage; i++) {
      html += `
        <button 
          type="button" 
          class="pagination-btn page-number ${i === currentPage ? 'active' : ''}" 
          data-page="${i}"
        >
          ${i}
        </button>
      `;
    }
    
    // Last page and ellipsis if needed
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        html += '<span class="pagination-ellipsis">&hellip;</span>';
      }
      html += `<button type="button" class="pagination-btn page-number" data-page="${totalPages}">${totalPages}</button>`;
    }
    
    html += '</div>'; // End pagination-pages
    
    // Next button
    html += `
      <button 
        type="button" 
        class="pagination-btn next-btn ${currentPage === totalPages ? 'disabled' : ''}" 
        data-page="${currentPage + 1}" 
        ${currentPage === totalPages ? 'disabled' : ''}
      >
        Next <span aria-hidden="true">&raquo;</span>
      </button>
    `;
    
    html += '</div>'; // End inventory-pagination
    
    return html;
  }
  
  /**
   * Set up event handlers for pagination
   */
  setupPaginationHandlers() {
    const paginationBtns = document.querySelectorAll('.pagination-btn');
    
    paginationBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        
        const page = parseInt(btn.dataset.page, 10);
        
        // Update filter state
        this.filterManager.filterState.page = page;
        
        // Apply filters
        this.handleFilterChange(this.filterManager.filterState);
        
        // Scroll to top of results
        const container = document.querySelector(this.options.resultsContainer);
        if (container) {
          container.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }
  
  /**
   * Show loading state
   * @param {boolean} isLoading - Whether the component is loading
   */
  setLoading(isLoading) {
    this.isLoading = isLoading;
    
    if (this.options.resultsContainer) {
      const container = document.querySelector(this.options.resultsContainer);
      if (container) {
        if (isLoading) {
          container.classList.add(this.options.loadingClass);
        } else {
          container.classList.remove(this.options.loadingClass);
        }
      }
    }
  }
  
  /**
   * Show error message
   * @param {string} message - Error message to display
   */
  showError(message) {
    if (this.options.resultsContainer) {
      const container = document.querySelector(this.options.resultsContainer);
      if (container) {
        container.innerHTML = `
          <div class="inventory-error">
            <p>${message}</p>
            <button type="button" class="retry-btn">Try Again</button>
          </div>
        `;
        
        const retryBtn = container.querySelector('.retry-btn');
        if (retryBtn) {
          retryBtn.addEventListener('click', () => {
            this.init();
          });
        }
      }
    }
  }
}

export default InventoryFilters;
