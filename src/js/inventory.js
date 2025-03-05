/**
 * Inventory management and display functions
 */

class InventoryManager {
  constructor() {
    this.endpoint = '/.netlify/functions/inventory-proxy';
    this.filters = {
      make: 'Cadillac',
      model: '',
      year: '',
      price: '',
      search: 'new'
    };
    this.currentPage = 1;
    this.itemsPerPage = 12;
    this.totalItems = 0;

    // Elements
    this.inventoryEl = document.querySelector('#inventory-results');
    this.filterFormEl = document.querySelector('#inventory-filters');
    this.paginationEl = document.querySelector('#inventory-pagination');
    
    // Initialize
    this.init();
  }

  init() {
    if (!this.inventoryEl) return;
    
    // Set up event listeners
    if (this.filterFormEl) {
      this.filterFormEl.addEventListener('submit', this.handleFilterSubmit.bind(this));
      this.filterFormEl.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', this.handleFilterChange.bind(this));
      });
    }

    // Load initial inventory
    this.loadInventory();
  }

  handleFilterSubmit(event) {
    event.preventDefault();
    this.currentPage = 1;
    this.loadInventory();
  }

  handleFilterChange(event) {
    const { name, value } = event.target;
    this.filters[name] = value;
    this.currentPage = 1; // Reset to first page when filters change
    this.loadInventory(); // Reload inventory when filters change
  }

  async loadInventory() {
    if (!this.inventoryEl) return;
    
    this.inventoryEl.innerHTML = '<div class="loading-spinner">Loading inventory...</div>';

    try {
      // Build query string from filters
      const queryParams = new URLSearchParams();
      Object.entries(this.filters).forEach(([key, value]) => {
        if (value) queryParams.append(key, value);
      });
      
      // Add pagination
      queryParams.append('page', this.currentPage);
      queryParams.append('perPage', this.itemsPerPage);
      
      // Fetch inventory data
      const response = await fetch(`${this.endpoint}?${queryParams.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch inventory');
      }
      
      const data = await response.json();
      this.renderInventory(data);
      
    } catch (error) {
      console.error('Error loading inventory:', error);
      this.inventoryEl.innerHTML = `
        <div class="error-message">
          <h3>Unable to load inventory</h3>
          <p>Please try again later or contact us directly.</p>
          <button class="btn btn-primary" onclick="window.location.reload()">Try Again</button>
        </div>
      `;
    }
  }

  renderInventory(data) {
    if (!data || !data.vehicles || data.vehicles.length === 0) {
      this.inventoryEl.innerHTML = `
        <div class="no-results">
          <h3>No vehicles match your criteria</h3>
          <p>Try adjusting your filters or <a href="/contact">contact Ed</a> to help find your perfect Cadillac.</p>
        </div>
      `;
      this.paginationEl.innerHTML = '';
      return;
    }

    this.totalItems = data.totalCount || data.vehicles.length;
    
    // Generate vehicle cards
    const vehiclesHtml = data.vehicles.map(vehicle => `
      <div class="vehicle-card">
        <div class="vehicle-image">
          <img src="${vehicle.primaryPhoto || '/img/placeholder-car.jpg'}" 
               alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" 
               class="lazyload">
          ${vehicle.specialOffer ? `<span class="special-tag">Special Offer</span>` : ''}
        </div>
        <div class="vehicle-info">
          <h3>${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>
          <p class="vehicle-trim">${vehicle.trim || ''}</p>
          <p class="vehicle-price">$${this.formatNumber(vehicle.price)}</p>
          <div class="vehicle-specs">
            <span><i class="fas fa-tachometer-alt"></i> ${this.formatNumber(vehicle.mileage)} mi</span>
            <span><i class="fas fa-gas-pump"></i> ${vehicle.fuelType || 'Gas'}</span>
            <span><i class="fas fa-palette"></i> ${vehicle.exteriorColor || 'N/A'}</span>
          </div>
          <div class="vehicle-actions">
            <a href="/inventory/${vehicle.vin}" class="btn btn-primary">View Details</a>
            <a href="/test-drive?vin=${vehicle.vin}" class="btn btn-secondary">Schedule Test Drive</a>
          </div>
        </div>
      </div>
    `).join('');

    this.inventoryEl.innerHTML = vehiclesHtml;
    this.renderPagination();
  }

  renderPagination() {
    if (!this.paginationEl) return;
    
    const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
    if (totalPages <= 1) {
      this.paginationEl.innerHTML = '';
      return;
    }

    let paginationHtml = '<ul class="pagination">';
    
    // Previous button
    paginationHtml += `
      <li class="${this.currentPage === 1 ? 'disabled' : ''}">
        <a href="#" data-page="${this.currentPage - 1}" aria-label="Previous">
          <span aria-hidden="true">&laquo;</span>
        </a>
      </li>
    `;
    
    // Page numbers
    const startPage = Math.max(1, this.currentPage - 2);
    const endPage = Math.min(totalPages, startPage + 4);
    
    for (let i = startPage; i <= endPage; i++) {
      paginationHtml += `
        <li class="${i === this.currentPage ? 'active' : ''}">
          <a href="#" data-page="${i}">${i}</a>
        </li>
      `;
    }
    
    // Next button
    paginationHtml += `
      <li class="${this.currentPage === totalPages ? 'disabled' : ''}">
        <a href="#" data-page="${this.currentPage + 1}" aria-label="Next">
          <span aria-hidden="true">&raquo;</span>
        </a>
      </li>
    `;
    
    this.paginationEl.innerHTML = paginationHtml;
    
    // Add event listeners to pagination links
    const paginationLinks = this.paginationEl.querySelectorAll('a[data-page]');
    if (paginationLinks && paginationLinks.length > 0) {
      paginationLinks.forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const page = parseInt(e.currentTarget.dataset.page);
          if (page > 0 && page <= totalPages) {
            this.currentPage = page;
            this.loadInventory();
            window.scrollTo({ top: this.inventoryEl.offsetTop - 100, behavior: 'smooth' });
          }
        });
      });
    }
  }

  formatNumber(number) {
    return number ? number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",") : '0';
  }
}

// Initialize inventory on page load
document.addEventListener('DOMContentLoaded', () => {
  new InventoryManager();
});

export default InventoryManager;
