import { 
  createInventoryLoader,
  handleInventoryError
} from './error-states';

/**
 * Inventory Detail Component
 * Displays a single inventory item with error handling
 */
class InventoryDetail {
  constructor(options = {}) {
    // Default options
    this.options = {
      container: '#vehicle-detail',
      endpoint: '/api/inventory/',
      ...options
    };
    
    // Get DOM elements
    this.container = document.querySelector(this.options.container);
    
    // Early return if container not found
    if (!this.container) return;
    
    // Get vehicle ID from URL or data attribute
    this.vehicleId = this.getVehicleId();
    
    if (!this.vehicleId) {
      console.error('No vehicle ID found');
      return;
    }
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the component
   */
  init() {
    // Create inventory loader with retry capability
    this.loadVehicle = createInventoryLoader(
      this.fetchVehicleData.bind(this),
      this.container,
      this.renderVehicleDetail.bind(this),
      {
        context: 'Inventory Detail Component',
        maxRetries: 2
      }
    );
    
    // Load vehicle data
    this.loadVehicle(this.vehicleId);
  }
  
  /**
   * Get vehicle ID from URL or data attribute
   * @returns {string|null} The vehicle ID or null if not found
   */
  getVehicleId() {
    // Try to get from data attribute
    const id = this.container.dataset.vehicleId;
    if (id) return id;
    
    // Try to get from URL path
    const pathParts = window.location.pathname.split('/');
    const lastPart = pathParts[pathParts.length - 1];
    
    // Check if last part looks like an ID
    if (/^[a-zA-Z0-9-_]+$/.test(lastPart)) {
      return lastPart;
    }
    
    return null;
  }
  
  /**
   * Fetch vehicle data from API
   * @param {string} vehicleId - The vehicle ID to fetch
   * @returns {Promise<Object>} The vehicle data
   */
  async fetchVehicleData(vehicleId) {
    const url = `${this.options.endpoint}${vehicleId}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      throw response;
    }
    
    return response.json();
  }
  
  /**
   * Render vehicle detail to the container
   * @param {Object} data - The vehicle data
   */
  renderVehicleDetail(data) {
    // Clear container
    this.container.innerHTML = '';
    
    if (!data || !data.id) {
      handleInventoryError(
        { type: 'notFound' },
        this.container,
        () => this.loadVehicle(this.vehicleId),
        { 
          logErrors: false,
          emptyStateMessage: 'Vehicle details not found. It may have been sold or removed.'
        }
      );
      return;
    }
    
    // ... existing code to render vehicle detail ...
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new InventoryDetail();
});

export default InventoryDetail;
