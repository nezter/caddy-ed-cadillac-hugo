/**
 * Inventory Management
 * Handles inventory display, filtering, and search functionality
 */
class InventoryManager {
  constructor() {
    this.inventoryElement = document.getElementById('vehicle-inventory');
    
    if (!this.inventoryElement) return;
    
    // Elements
    this.filterForm = document.getElementById('inventory-filters');
    this.searchInput = document.getElementById('inventory-search');
    this.sortSelect = document.getElementById('inventory-sort');
    this.resultsContainer = document.getElementById('inventory-results');
    this.paginationContainer = document.getElementById('inventory-pagination');
    this.loadingIndicator = document.getElementById('inventory-loading');
    
    // State
    this.currentPage = 1;
    this.itemsPerPage = 12;
    this.totalPages = 0;
    this.currentFilters = {};
    this.inventoryData = [];
    this.filteredData = [];
    
    // Initialize
    this.init();
  }
  
  init() {
    this.showLoading();
    
    // Load inventory data from our proxy function
    this.fetchInventory()
      .then(data => {
        this.inventoryData = data;
        this.filteredData = [...data];
        this.setupEventListeners();
        this.applyFiltersAndSort();
      })
      .catch(error => {
        console.error('Failed to fetch inventory:', error);
        this.showError('Unable to load inventory. Please try again later.');
      })
      .finally(() => {
        this.hideLoading();
      });
  }
  
  fetchInventory() {
    const url = '/.netlify/functions/inventory-proxy';
    
    return fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to fetch inventory data');
        }
        
        return response.json();
      })
      .then(data => {
        // Process the data if needed
        return data.vehicles || [];
      });
  }
  
  setupEventListeners() {
    // Search input
    if (this.searchInput) {
      this.searchInput.addEventListener('input', this.debounce(() => {
        this.currentPage = 1;
        this.applyFiltersAndSort();
      }, 300));
    }
    
    // Filter form
    if (this.filterForm) {
      this.filterForm.addEventListener('change', () => {
        this.currentPage = 1;
        this.applyFiltersAndSort();
      });
      
      // Reset filters button
      const resetButton = this.filterForm.querySelector('.reset-filters');
      if (resetButton) {
        resetButton.addEventListener('click', (e) => {
          e.preventDefault();
          this.resetFilters();
        });
      }
    }
    
    // Sort select
    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', () => {
        this.applyFiltersAndSort();
      });
    }
    
    // URL params on load
    this.applyUrlParams();
    
    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      this.applyUrlParams();
    });
  }
  
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  applyUrlParams() {
    const params = new URLSearchParams(window.location.search);
    
    // Reset form first
    if (this.filterForm) {
      this.filterForm.reset();
    }
    
    // Apply params to form controls
    for (const [key, value] of params) {
      const element = this.filterForm?.elements[key];
      
      if (element) {
        if (element.type === 'checkbox') {
          element.checked = value === 'true';
        } else {
          element.value = value;
        }
      }
      
      if (key === 'page') {
        this.currentPage = parseInt(value) || 1;
      }
      
      if (key === 'search' && this.searchInput) {
        this.searchInput.value = value;
      }
      
      if (key === 'sort' && this.sortSelect) {
        this.sortSelect.value = value;
      }
    }
    
    this.applyFiltersAndSort(false);
  }
  
  getFormFilters() {
    if (!this.filterForm) return {};
    
    const filters = {};
    const formData = new FormData(this.filterForm);
    
    for (const [key, value] of formData.entries()) {
      if (value) {
        filters[key] = value;
      }
    }
    
    return filters;
  }
  
  applyFiltersAndSort(updateUrl = true) {
    this.showLoading();
    
    // Get search term
    const searchTerm = this.searchInput?.value?.toLowerCase().trim() || '';
    
    // Get form filters
    const formFilters = this.getFormFilters();
    
    // Update current filters
    this.currentFilters = {
      ...formFilters,
      search: searchTerm,
    };
    
    // Filter data
    this.filteredData = this.inventoryData.filter(vehicle => {
      // Search filter
      if (searchTerm) {
        const searchFields = [
          vehicle.make,
          vehicle.model,
          vehicle.trim,
          vehicle.year,
          vehicle.stockNumber,
          vehicle.exteriorColor,
          vehicle.interiorColor,
          vehicle.vin
        ].map(field => String(field || '').toLowerCase());
        
        const matchesSearch = searchFields.some(field => field.includes(searchTerm));
        if (!matchesSearch) return false;
      }
      
      // Year range
      if (formFilters.minYear && parseInt(vehicle.year) < parseInt(formFilters.minYear)) {
        return false;
      }
      
      if (formFilters.maxYear && parseInt(vehicle.year) > parseInt(formFilters.maxYear)) {
        return false;
      }
      
      // Price range
      if (formFilters.minPrice && vehicle.price < parseInt(formFilters.minPrice)) {
        return false;
      }
      
      if (formFilters.maxPrice && vehicle.price > parseInt(formFilters.maxPrice)) {
        return false;
      }
      
      // Mileage range
      if (formFilters.minMileage && vehicle.mileage < parseInt(formFilters.minMileage)) {
        return false;
      }
      
      if (formFilters.maxMileage && vehicle.mileage > parseInt(formFilters.maxMileage)) {
        return false;
      }
      
      // Body style
      if (formFilters.bodyStyle && vehicle.bodyStyle !== formFilters.bodyStyle) {
        return false;
      }
      
      // Exterior color
      if (formFilters.exteriorColor && vehicle.exteriorColor !== formFilters.exteriorColor) {
        return false;
      }
      
      // Drivetrain
      if (formFilters.drivetrain && vehicle.drivetrain !== formFilters.drivetrain) {
        return false;
      }
      
      // Fuel type
      if (formFilters.fuelType && vehicle.fuelType !== formFilters.fuelType) {
        return false;
      }
      
      // Additional features as checkboxes
      if (formFilters.hasHeatedSeats === 'true' && !vehicle.features?.includes('Heated Seats')) {
        return false;
      }
      
      if (formFilters.hasNavigation === 'true' && !vehicle.features?.includes('Navigation')) {
        return false;
      }
      
      if (formFilters.hasLeatherSeats === 'true' && !vehicle.features?.includes('Leather Seats')) {
        return false;
      }
      
      if (formFilters.hasSunroof === 'true' && !vehicle.features?.includes('Sunroof')) {
        return false;
      }
      
      return true;
    });
    
    // Apply sorting
    if (this.sortSelect?.value) {
      const sortOption = this.sortSelect.value;
      
      switch (sortOption) {
        case 'price-asc':
          this.filteredData.sort((a, b) => a.price - b.price);
          break;
        case 'price-desc':
          this.filteredData.sort((a, b) => b.price - a.price);
          break;
        case 'year-asc':
          this.filteredData.sort((a, b) => a.year - b.year);
          break;
        case 'year-desc':
          this.filteredData.sort((a, b) => b.year - a.year);
          break;
        case 'mileage-asc':
          this.filteredData.sort((a, b) => a.mileage - b.mileage);
          break;
        case 'mileage-desc':
          this.filteredData.sort((a, b) => b.mileage - a.mileage);
          break;
        default:
          // Default sorting (newest)
          this.filteredData.sort((a, b) => b.year - a.year);
      }
    }
    
    // Update URL if needed
    if (updateUrl) {
      this.updateUrl();
    }
    
    // Update pagination
    this.totalPages = Math.ceil(this.filteredData.length / this.itemsPerPage);
    if (this.currentPage > this.totalPages) {
      this.currentPage = 1;
    }
    
    // Render results
    this.renderResults();
    this.renderPagination();
    this.updateResultCount();
    
    this.hideLoading();
  }
  
  updateUrl() {
    const params = new URLSearchParams();
    
    // Add filters to URL
    for (const [key, value] of Object.entries(this.currentFilters)) {
      if (value) {
        params.set(key, value);
      }
    }
    
    // Add sort to URL
    if (this.sortSelect?.value) {
      params.set('sort', this.sortSelect.value);
    }
    
    // Add page to URL
    if (this.currentPage > 1) {
      params.set('page', this.currentPage);
    }
    
    // Update browser URL
    const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    history.pushState({}, '', newUrl);
  }
  
  resetFilters() {
    // Reset form
    if (this.filterForm) {
      this.filterForm.reset();
    }
    
    // Reset search
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    
    // Reset sort
    if (this.sortSelect) {
      this.sortSelect.value = 'year-desc';
    }
    
    // Reset to first page
    this.currentPage = 1;
    
    // Apply changes
    this.applyFiltersAndSort();
  }
  
  renderResults() {
    if (!this.resultsContainer) return;
    
    // Calculate page slice
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const pageItems = this.filteredData.slice(startIndex, endIndex);
    
    if (pageItems.length === 0) {
      this.resultsContainer.innerHTML = `
        <div class="no-results">
          <h2>No vehicles found</h2>
          <p>Please try adjusting your search criteria.</p>
          <button class="reset-filters">Reset Filters</button>
        </div>
      `;
      
      const resetButton = this.resultsContainer.querySelector('.reset-filters');
      if (resetButton) {
        resetButton.addEventListener('click', () => {
          this.resetFilters();
        });
      }
      
      return;
    }
    
    let html = '<div class="vehicle-grid">';
    
    pageItems.forEach(vehicle => {
      const formattedPrice = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0
      }).format(vehicle.price);
      
      const formattedMileage = new Intl.NumberFormat('en-US').format(vehicle.mileage);
      
      html += `
        <div class="vehicle-card">
          <div class="vehicle-image">
            ${vehicle.image 
              ? `<img src="${vehicle.image}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}">`
              : `<div class="placeholder-image">Image Coming Soon</div>`
            }
          </div>
          <div class="vehicle-details">
            <h3 class="vehicle-title">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>
            ${vehicle.trim ? `<p class="vehicle-trim">${vehicle.trim}</p>` : ''}
            <div class="vehicle-price">${formattedPrice}</div>
            <div class="vehicle-specs">
              <span class="vehicle-mileage">${formattedMileage} miles</span>
              ${vehicle.exteriorColor ? `<span class="vehicle-color">${vehicle.exteriorColor}</span>` : ''}
              ${vehicle.transmission ? `<span class="vehicle-transmission">${vehicle.transmission}</span>` : ''}
            </div>
            <div class="vehicle-actions">
              <a href="/inventory/${vehicle.id || vehicle.vin}" class="btn btn-primary">View Details</a>
              <button class="btn btn-secondary schedule-test-drive" data-vehicle-id="${vehicle.id || vehicle.vin}">Schedule Test Drive</button>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div>';
    
    this.resultsContainer.innerHTML = html;
    
    // Setup test drive buttons
    const testDriveButtons = this.resultsContainer.querySelectorAll('.schedule-test-drive');
    testDriveButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.openTestDriveModal(button.dataset.vehicleId);
      });
    });
  }
  
  renderPagination() {
    if (!this.paginationContainer) return;
    
    if (this.totalPages <= 1) {
      this.paginationContainer.innerHTML = '';
      return;
    }
    
    let html = '<ul class="pagination">';
    
    // Previous button
    html += `
      <li class="page-item ${this.currentPage === 1 ? 'disabled' : ''}">
        <button class="page-link" data-page="${this.currentPage - 1}" ${this.currentPage === 1 ? 'disabled' : ''}>
          <span aria-hidden="true">&laquo;</span>
        </button>
      </li>
    `;
    
    // Page numbers
    const maxVisiblePages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // First page
    if (startPage > 1) {
      html += `
        <li class="page-item">
          <button class="page-link" data-page="1">1</button>
        </li>
        ${startPage > 2 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
      `;
    }
    
    // Visible pages
    for (let i = startPage; i <= endPage; i++) {
      html += `
        <li class="page-item ${i === this.currentPage ? 'active' : ''}">
          <button class="page-link" data-page="${i}">${i}</button>
        </li>
      `;
    }
    
    // Last page
    if (endPage < this.totalPages) {
      html += `
        ${endPage < this.totalPages - 1 ? '<li class="page-item disabled"><span class="page-link">...</span></li>' : ''}
        <li class="page-item">
          <button class="page-link" data-page="${this.totalPages}">${this.totalPages}</button>
        </li>
      `;
    }
    
    // Next button
    html += `
      <li class="page-item ${this.currentPage === this.totalPages ? 'disabled' : ''}">
        <button class="page-link" data-page="${this.currentPage + 1}" ${this.currentPage === this.totalPages ? 'disabled' : ''}>
          <span aria-hidden="true">&raquo;</span>
        </button>
      </li>
    `;
    
    html += '</ul>';
    
    this.paginationContainer.innerHTML = html;
    
    // Setup pagination buttons
    const pageLinks = this.paginationContainer.querySelectorAll('.page-link');
    pageLinks.forEach(link => {
      if (!link.hasAttribute('disabled') && link.dataset.page) {
        link.addEventListener('click', () => {
          this.currentPage = parseInt(link.dataset.page);
          this.applyFiltersAndSort();
          // Scroll to top of results
          this.resultsContainer.scrollIntoView({ behavior: 'smooth' });
        });
      }
    });
  }
  
  updateResultCount() {
    const resultCount = document.getElementById('inventory-count');
    if (!resultCount) return;
    
    resultCount.textContent = `${this.filteredData.length} vehicles`;
  }
  
  openTestDriveModal(vehicleId) {
    const vehicle = this.inventoryData.find(v => (v.id || v.vin) === vehicleId);
    
    if (!vehicle) return;
    
    // Find or create modal
    let modal = document.getElementById('test-drive-modal');
    
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'test-drive-modal';
      modal.className = 'modal';
      document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>Schedule a Test Drive</h2>
          <button class="close-modal">&times;</button>
        </div>
        <div class="modal-body">
          <p class="vehicle-info">
            ${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ''}
          </p>
          <form id="test-drive-form">
            <input type="hidden" name="vehicleId" value="${vehicleId}">
            <div class="form-group">
              <label for="fullName">Full Name</label>
              <input type="text" id="fullName" name="fullName" required>
            </div>
            <div class="form-group">
              <label for="email">Email</label>
              <input type="email" id="email" name="email" required>
            </div>
            <div class="form-group">
              <label for="phone">Phone</label>
              <input type="tel" id="phone" name="phone" required>
            </div>
            <div class="form-group">
              <label for="preferredDate">Preferred Date</label>
              <input type="date" id="preferredDate" name="preferredDate" required min="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
              <label for="preferredTime">Preferred Time</label>
              <select id="preferredTime" name="preferredTime" required>
                <option value="">Select a time</option>
                <option value="morning">Morning (9AM - 12PM)</option>
                <option value="afternoon">Afternoon (12PM - 4PM)</option>
                <option value="evening">Evening (4PM - 7PM)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="comments">Comments (Optional)</label>
              <textarea id="comments" name="comments"></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn btn-primary">Schedule Test Drive</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    // Show modal
    modal.style.display = 'block';
    
    // Close button
    const closeButton = modal.querySelector('.close-modal');
    closeButton.addEventListener('click', () => {
      modal.style.display = 'none';
    });
    
    // Close when clicking outside
    window.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.style.display = 'none';
      }
    });
    
    // Form submission
    const form = modal.querySelector('#test-drive-form');
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());
      
      // Submit form data to backend
      fetch('/.netlify/functions/schedule-test-drive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      })
      .then(response => response.json())
      .then(result => {
        if (result.success) {
          // Show success message
          modal.querySelector('.modal-body').innerHTML = `
            <div class="success-message">
              <h3>Test Drive Scheduled!</h3>
              <p>Thank you for scheduling a test drive. A sales representative will contact you shortly to confirm your appointment.</p>
              <button class="btn btn-secondary close-modal">Close</button>
            </div>
          `;
          
          // Setup close button
          modal.querySelector('.close-modal').addEventListener('click', () => {
            modal.style.display = 'none';
          });
        } else {
          throw new Error(result.message || 'Failed to schedule test drive');
        }
      })
      .catch(error => {
        console.error('Test drive scheduling error:', error);
        
        // Show error message
        const errorMsg = document.createElement('div');
        errorMsg.className = 'error-message';
        errorMsg.textContent = 'An error occurred. Please try again or call us directly.';
        
        form.prepend(errorMsg);
      });
    });
  }
  
  showLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = 'block';
    }
  }
  
  hideLoading() {
    if (this.loadingIndicator) {
      this.loadingIndicator.style.display = 'none';
    }
  }
  
  showError(message) {
    if (this.resultsContainer) {
      this.resultsContainer.innerHTML = `
        <div class="error-message">
          <p>${message}</p>
          <button class="btn btn-primary reload-button">Reload</button>
        </div>
      `;
      
      const reloadButton = this.resultsContainer.querySelector('.reload-button');
      if (reloadButton) {
        reloadButton.addEventListener('click', () => {
          window.location.reload();
        });
      }
    }
  }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  new InventoryManager();
});

export default InventoryManager;
