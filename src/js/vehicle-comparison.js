/**
 * Vehicle Comparison Tool
 * Allows users to compare multiple vehicles side by side
 */

class VehicleComparison {
  constructor(options = {}) {
    this.maxVehicles = options.maxVehicles || 3;
    this.storageKey = 'comparisonVehicles';
    this.compareButtonSelector = options.compareButtonSelector || '.compare-button';
    this.comparisonContainerSelector = options.comparisonContainerSelector || '#comparison-container';
    this.comparisonBarSelector = options.comparisonBarSelector || '#comparison-bar';
    
    this.comparisonList = this.getComparisonList() || [];
    
    this.initialize();
  }
  
  initialize() {
    // Set up comparison buttons
    this.initializeCompareButtons();
    
    // Set up comparison bar
    this.initializeComparisonBar();
    
    // Set up comparison page if we're on it
    this.initializeComparisonPage();
    
    // Update UI
    this.updateComparisonUI();
  }
  
  initializeCompareButtons() {
    const compareButtons = document.querySelectorAll(this.compareButtonSelector);
    
    compareButtons.forEach(button => {
      const vehicleId = button.dataset.vehicleId;
      const isInComparison = this.comparisonList.includes(vehicleId);
      
      // Update button state
      this.updateButtonState(button, isInComparison);
      
      // Add click handler
      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.toggleComparison(vehicleId, button);
      });
    });
  }
  
  initializeComparisonBar() {
    const comparisonBar = document.querySelector(this.comparisonBarSelector);
    if (!comparisonBar) return;
    
    // Clear button
    const clearButton = comparisonBar.querySelector('.clear-comparison');
    if (clearButton) {
      clearButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.clearComparison();
      });
    }
    
    // Compare button
    const compareNowButton = comparisonBar.querySelector('.compare-now');
    if (compareNowButton) {
      compareNowButton.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/compare/?ids=' + this.comparisonList.join(',');
      });
    }
    
    // Show/hide bar based on comparison list
    if (this.comparisonList.length > 0) {
      comparisonBar.classList.add('active');
    } else {
      comparisonBar.classList.remove('active');
    }
  }
  
  initializeComparisonPage() {
    const comparisonContainer = document.querySelector(this.comparisonContainerSelector);
    if (!comparisonContainer) return;
    
    // Check if there are vehicles to compare
    if (this.comparisonList.length === 0) {
      // Get IDs from URL if available
      const urlParams = new URLSearchParams(window.location.search);
      const ids = urlParams.get('ids');
      
      if (ids) {
        this.comparisonList = ids.split(',');
        this.saveComparisonList();
      }
    }
    
    // If we have vehicles to compare, fetch and display them
    if (this.comparisonList.length > 0) {
      this.renderComparison(comparisonContainer);
    } else {
      // Show empty state
      comparisonContainer.innerHTML = `
        <div class="empty-comparison">
          <h3>No Vehicles Selected</h3>
          <p>You haven't added any vehicles to compare yet. Browse our inventory and add vehicles to comparison.</p>
          <a href="/inventory/" class="button primary-button">Browse Inventory</a>
        </div>
      `;
    }
  }
  
  renderComparison(container) {
    // Basic structure for comparison table
    let html = `
      <div class="comparison-table-container">
        <table class="comparison-table">
          <thead>
            <tr>
              <th>Feature</th>
              ${this.comparisonList.map(id => `
                <th class="vehicle-column" data-id="${id}">
                  <div class="vehicle-header">
                    <img src="/placeholder" alt="Vehicle" class="vehicle-thumbnail">
                    <h3 class="vehicle-title">Loading...</h3>
                    <button class="remove-vehicle" data-id="${id}">×</button>
                  </div>
                </th>
              `).join('')}
            </tr>
          </thead>
          <tbody>
            <tr class="loading-row">
              <td colspan="${this.comparisonList.length + 1}">
                <div class="loading-spinner">Loading comparison data...</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    
    container.innerHTML = html;
    
    // Add event listeners for remove buttons
    const removeButtons = container.querySelectorAll('.remove-vehicle');
    removeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const vehicleId = button.dataset.id;
        this.removeFromComparison(vehicleId);
        
        // Re-render the comparison
        this.renderComparison(container);
      });
    });
    
    // Fetch vehicle data
    this.fetchComparisonData();
  }
  
  fetchComparisonData() {
    // In a real application, this would make an API call to get vehicle data
    // For this example, we'll simulate with setTimeout
    setTimeout(() => {
      const dummyData = this.getDummyVehicleData();
      this.updateComparisonTable(dummyData);
    }, 1000);
  }
  
  updateComparisonTable(vehicleData) {
    const table = document.querySelector('.comparison-table');
    if (!table) return;
    
    // Update vehicle headers
    this.comparisonList.forEach((id, index) => {
      const vehicle = vehicleData.find(v => v.id === id);
      if (!vehicle) return;
      
      const column = table.querySelector(`.vehicle-column[data-id="${id}"]`);
      if (column) {
        const thumbnail = column.querySelector('.vehicle-thumbnail');
        const title = column.querySelector('.vehicle-title');
        
        thumbnail.src = vehicle.image;