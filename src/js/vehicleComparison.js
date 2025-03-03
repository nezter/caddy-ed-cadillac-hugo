/**
 * Vehicle Comparison Component
 * Allows users to compare multiple vehicles side by side
 */
class VehicleComparison {
  constructor(element) {
    this.element = element;
    this.vehicleData = {};
    this.compareList = [];
    this.maxCompare = parseInt(element.dataset.maxCompare) || 3;
    this.compareContainer = element.querySelector('.comparison-container');
    this.addVehicleBtn = element.querySelector('.add-vehicle-btn');
    this.vehicleSelector = element.querySelector('.vehicle-selector');
    this.printBtn = element.querySelector('.print-comparison');
    this.shareBtn = element.querySelector('.share-comparison');
    
    this.init();
  }
  
  init() {
    // Load comparison from URL if present
    this.loadFromUrl();
    
    // Initialize vehicle selector
    if (this.addVehicleBtn && this.vehicleSelector) {
      this.setupVehicleSelector();
    }
    
    // Setup print functionality
    if (this.printBtn) {
      this.setupPrintButton();
    }
    
    // Setup share functionality
    if (this.shareBtn) {
      this.setupShareButton();
    }
    
    // Setup feature toggle
    this.setupFeatureToggles();
    
    // Render initial comparison
    this.renderComparison();
  }
  
  loadFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    const vehicleIds = urlParams.getAll('id');
    
    if (vehicleIds.length > 0) {
      // Fetch data for all vehicles
      Promise.all(vehicleIds.map(id => this.fetchVehicleData(id)))
        .then(() => {
          this.renderComparison();
        })
        .catch(error => {
          console.error('Error loading comparison vehicles:', error);
        });
    }
  }
  
  setupVehicleSelector() {
    this.addVehicleBtn.addEventListener('click', () => {
      if (this.compareList.length >= this.maxCompare) {
        alert(`You can compare up to ${this.maxCompare} vehicles at once.`);
        return;
      }
      
      this.vehicleSelector.style.display = 'block';
    });
    
    // Close selector when clicking outside
    document.addEventListener('click', (event) => {
      if (!this.vehicleSelector.contains(event.target) && 
          event.target !== this.addVehicleBtn) {
        this.vehicleSelector.style.display = 'none';
      }
    });
    
    // Search functionality
    const searchInput = this.vehicleSelector.querySelector('.vehicle-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const vehicleOptions = this.vehicleSelector.querySelectorAll('.vehicle-option');
        
        vehicleOptions.forEach(option => {
          const vehicleText = option.textContent.toLowerCase();
          if (vehicleText.includes(searchTerm)) {
            option.style.display = 'block';
          } else {
            option.style.display = 'none';
          }
        });
      });
    }
    
    // Vehicle selection
    const vehicleOptions = this.vehicleSelector.querySelectorAll('.vehicle-option');
    vehicleOptions.forEach(option => {
      option.addEventListener('click', () => {
        const vehicleId = option.dataset.vehicleId;
        this.addVehicleToComparison(vehicleId);
        this.vehicleSelector.style.display = 'none';
      });
    });
  }
  
  addVehicleToComparison(vehicleId) {
    if (this.compareList.includes(vehicleId)) {
      return;
    }
    
    if (this.compareList.length >= this.maxCompare) {
      alert(`You can compare up to ${this.maxCompare} vehicles at once.`);
      return;
    }
    
    this.fetchVehicleData(vehicleId)
      .then(() => {
        this.renderComparison();
        this.updateUrl();
      })
      .catch(error => {
        console.error(`Error adding vehicle ${vehicleId} to comparison:`, error);
      });
  }
  
  fetchVehicleData(vehicleId) {
    return fetch(`/api/vehicle/${vehicleId}`)
      .then(response => response.json())
      .then(data => {
        this.vehicleData[vehicleId] = data;
        if (!this.compareList.includes(vehicleId)) {
          this.compareList.push(vehicleId);
        }
      });
  }
  
  removeVehicle(vehicleId) {
    this.compareList = this.compareList.filter(id => id !== vehicleId);
    this.renderComparison();
    this.updateUrl();
  }
  
  updateUrl() {
    const url = new URL(window.location);
    url.search = '';
    
    this.compareList.forEach(id => {
      url.searchParams.append('id', id);
    });
    
    window.history.replaceState({}, '', url);
  }
  
  setupPrintButton() {
    this.printBtn.addEventListener('click', () => {
      window.print();
    });
  }
  
  setupShareButton() {
    this.shareBtn.addEventListener('click', () => {
      const url = window.location.href;
      
      if (navigator.share) {
        navigator.share({
          title: 'Vehicle Comparison',
          text: 'Check out these Cadillac vehicles I\'m comparing',
          url: url
        })
        .catch(error => console.log('Error sharing:', error));
      } else {
        // Fallback for browsers that don't support the Web Share API
        const tempInput = document.createElement('input');
        document.body.appendChild(tempInput);
        tempInput.value = url;
        tempInput.select();
        document.execCommand('copy');
        document.body.removeChild(tempInput);
        
        alert('Comparison link copied to clipboard!');
      }
    });
  }
  
  setupFeatureToggles() {
    this.element.addEventListener('click', (e) => {
      if (e.target.classList.contains('toggle-section')) {
        const section = e.target.dataset.section;
        const rows = this.element.querySelectorAll(`.comparison-row[data-section="${section}"]`);
        
        rows.forEach(row => {
          row.classList.toggle('hidden');
        });
        
        // Toggle button icon/text
        e.target.classList.toggle('expanded');
      }
    });
  }
  
  renderComparison() {
    if (!this.compareContainer) return;
    
    if (this.compareList.length === 0) {
      this.compareContainer.innerHTML = `
        <div class="empty-comparison">
          <p>No vehicles selected for comparison.</p>
          <p>Click "Add Vehicle" to start comparing.</p>
        </div>
      `;
      return;
    }
    
    // Build comparison table
    let html = `<table class="comparison-table">`;
    
    // Vehicle headers
    html += `<tr class="comparison-header">
      <th>Features</th>`;
      
    this.compareList.forEach(vehicleId => {
      const vehicle = this.vehicleData[vehicleId];
      html += `
        <th class="vehicle-column">
          <div class="vehicle-header">
            <button class="remove-vehicle" data-vehicle-id="${vehicleId}">&times;</button>
            <img src="${vehicle.images[0]}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}">
            <h3>${vehicle.year} ${vehicle.make}<br>${vehicle.model} ${vehicle.trim}</h3>
            <div class="vehicle-price">$${vehicle.price.toLocaleString()}</div>
          </div>
        </th>`;
    });
    
    html += `</tr>`;
    
    // Basic Info Section
    html += this.renderComparisonSection('Basic Info', [
      { label: 'Year', field: 'year' },
      { label: 'Make', field: 'make' },
      { label: 'Model', field: 'model' },
      { label: 'Trim', field: 'trim' },
      { label: 'Body Style', field: 'bodyStyle' },
      { label: 'Exterior Color', field: 'exteriorColor' },
      { label: 'Interior Color', field: 'interiorColor' },
      { label: 'Mileage', field: 'mileage', format: value => value.toLocaleString() + ' mi' },
      { label: 'Stock #', field: 'stockNumber' },
      { label: 'VIN', field: 'vin' }
    ]);
    
    // Performance Section
    html += this.renderComparisonSection('Performance', [
      { label: 'Engine', field: 'engine' },
      { label: 'Horsepower', field: 'horsepower', format: value => value + ' hp' },
      { label: 'Torque', field: 'torque', format: value => value + ' lb-ft' },
      { label: 'Transmission', field: 'transmission' },
      { label: 'Drivetrain', field: 'drivetrain' },
      { label: 'Fuel Economy (City)', field: 'mpgCity', format: value => value + ' mpg' },
      { label: 'Fuel Economy (Highway)', field: 'mpgHighway', format: value => value + ' mpg' },
      { label: 'Fuel Economy (Combined)', field: 'mpgCombined', format: value => value + ' mpg' },
      { label: 'Fuel Type', field: 'fuelType' }
    ]);
    
    // Dimensions Section
    html += this.renderComparisonSection('Dimensions', [
      { label: 'Length', field: 'length', format: value => value + ' in' },
      { label: 'Width', field: 'width', format: value => value + ' in' },
      { label: 'Height', field: 'height', format: value => value + ' in' },
      { label: 'Wheelbase', field: 'wheelbase', format: value => value + ' in' },
      { label: 'Ground Clearance', field: 'groundClearance', format: value => value + ' in' },
      { label: 'Passenger Capacity', field: 'passengerCapacity' },
      { label: 'Cargo Volume', field: 'cargoVolume', format: value => value + ' cu ft' },
      { label: 'Fuel Tank', field: 'fuelTank', format: value => value + ' gal' }
    ]);
    
    // Features Section
    html += `
      <tr>
        <td colspan="${this.compareList.length + 1}" class="section-divider">
          <button class="toggle-section expanded" data-section="features">Features</button>
        </td>
      </tr>`;
    
    // Get all unique features
    const allFeatures = new Set();
    this.compareList.forEach(vehicleId => {
      const vehicle = this.vehicleData[vehicleId];
      if (vehicle.features && Array.isArray(vehicle.features)) {
        vehicle.features.forEach(feature => allFeatures.add(feature));
      }
    });
    
    // Create a row for each feature
    allFeatures.forEach(feature => {
      html += `<tr class="comparison-row" data-section="features">
        <td class="feature-name">${feature}</td>`;
      
      this.compareList.forEach(vehicleId => {
        const vehicle = this.vehicleData[vehicleId];
        const hasFeature = vehicle.features && vehicle.features.includes(feature);
        
        html += `<td class="feature-value">${hasFeature ? 
          '<span class="feature-check">✓</span>' : 
          '<span class="feature-missing">-</span>'}</td>`;
      });
      
      html += `</tr>`;
    });
    
    html += `</table>`;
    
    this.compareContainer.innerHTML = html;
    
    // Add event listeners to remove buttons
    const removeButtons = this.compareContainer.querySelectorAll('.remove-vehicle');
    removeButtons.forEach(button => {
      button.addEventListener('click', () => {
        const vehicleId = button.dataset.vehicleId;
        this.removeVehicle(vehicleId);
      });
    });
  }
  
  renderComparisonSection(title, fields) {
    let html = `
      <tr>
        <td colspan="${this.compareList.length + 1}" class="section-divider">
          <button class="toggle-section expanded" data-section="${title.toLowerCase().replace(/\s+/g, '-')}">${title}</button>
        </td>
      </tr>`;
    
    fields.forEach(field => {
      html += `<tr class="comparison-row" data-section="${title.toLowerCase().replace(/\s+/g, '-')}">
        <td class="feature-name">${field.label}</td>`;
      
      this.compareList.forEach(vehicleId => {
        const vehicle = this.vehicleData[vehicleId];
        let value = vehicle[field.field];
        
        if (field.format && value !== undefined) {
          value = field.format(value);
        }
        
        html += `<td class="feature-value">${value !== undefined ? value : '-'}</td>`;
      });
      
      html += `</tr>`;
    });
    
    return html;
  }
}

// Initialize all comparison components when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const comparisonElements = document.querySelectorAll('.vehicle-comparison');
  comparisonElements.forEach(element => {
    new VehicleComparison(element);
  });
});

export default VehicleComparison;
