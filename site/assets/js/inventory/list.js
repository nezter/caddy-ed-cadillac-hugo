import { 
  createInventoryLoader,
  handleInventoryError
} from './error-states';

/**
 * Inventory List Component
 * Handles fetching and displaying inventory items with proper error handling
 */
class InventoryList {
  constructor(options = {}) {
    // Default options
    this.options = {
      container: '#inventory-list',
      filterForm: '#inventory-filter',
      endpoint: '/api/inventory',
      itemsPerPage: 12,
      ...options
    };
    
    // Get DOM elements
    this.container = document.querySelector(this.options.container);
    this.filterForm = document.querySelector(this.options.filterForm);
    
    // Early return if container not found
    if (!this.container) return;
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the component
   */
  init() {
    // Create inventory loader with retry capability
    this.loadInventory = createInventoryLoader(
      this.fetchInventory.bind(this),
      this.container,
      this.renderInventory.bind(this),
      {
        context: 'Inventory List Component',
        maxRetries: 2
      }
    );
    
    // Add filter form handler if it exists
    if (this.filterForm) {
      this.filterForm.addEventListener('submit', this.handleFilterSubmit.bind(this));
    }
    
    // Load initial inventory
    this.loadInventory();
  }
  
  /**
   * Fetch inventory data from API
   * @param {Object} filters - Optional filter parameters
   * @returns {Promise<Array>} The inventory data
   */
  async fetchInventory(filters = {}) {
    // Build URL with query parameters
    const url = new URL(this.options.endpoint, window.location.origin);
    
    // Add filters to query parameters
    Object.entries(filters).forEach(([key, value]) => {
      if (value) url.searchParams.append(key, value);
    });
    
    // Add pagination parameters
    url.searchParams.append('limit', this.options.itemsPerPage);
    
    // Fetch data
    const response = await fetch(url);
    
    if (!response.ok) {
      throw response;
    }
    
    return response.json();
  }
  
  /**
   * Render inventory items to the container
   * @param {Array} data - The inventory data
   */
  renderInventory(data) {
    // Clear container
    this.container.innerHTML = '';
    
    // Check if we have items
    if (!data || !data.items || data.items.length === 0) {
      handleInventoryError(
        { type: 'notFound' },
        this.container,
        () => this.loadInventory(),
        { 
          logErrors: false,
          emptyStateMessage: 'No vehicles match your search criteria.'
        }
      );
      return;
    }
    
    // Render each item
    data.items.forEach(item => {
      const itemElement = this.createItemElement(item);
      this.container.appendChild(itemElement);
    });
    
    // Add pagination if provided
    if (data.pagination) {
      this.renderPagination(data.pagination);
    }
  }
  
  /**
   * Create an element for a single inventory item
   * @param {Object} item - The inventory item data
   * @returns {HTMLElement} The item element
   */
  createItemElement(item) {
    // Create item container
    const itemEl = document.createElement('div');
    itemEl.className = 'inventory-item';
    
    // ... existing code to create inventory item HTML ...
    
    return itemEl;
  }
  
  /**
   * Render pagination controls
   * @param {Object} pagination - Pagination data
   */
  renderPagination(pagination) {
    // ... existing code to render pagination ...
  }
  
  /**
   * Handle filter form submission
   * @param {Event} event - The form submit event
   */
  handleFilterSubmit(event) {
    event.preventDefault();
    
    // Get form data
    const formData = new FormData(this.filterForm);
    const filters = Object.fromEntries(formData.entries());
    
    // Load filtered inventory
    this.loadInventory(filters);
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new InventoryList();
});

export default InventoryList;
