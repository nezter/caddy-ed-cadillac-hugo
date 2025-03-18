/**
 * FilterManager - Handles advanced inventory filtering
 * 
 * This class provides:
 * - Advanced filter combinations (AND/OR logic)
 * - URL parameter synchronization
 * - Filter state management
 * - Filter persistence
 */

class FilterManager {
  /**
   * Create a filter manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    // Default filter state
    this.filterState = {
      search: '',
      make: ['Cadillac'], // Default to Cadillac
      model: [],
      yearRange: { min: 0, max: new Date().getFullYear() + 1 },
      priceRange: { min: 0, max: 1000000 },
      features: {},
      drivetrain: [],
      transmission: [],
      fuelType: [],
      bodyStyle: [],
      color: [],
      sort: 'featured',
      page: 1,
      limit: options.limit || 12
    };

    // Filter option definitions
    this.filterOptions = {
      model: [
        { value: 'Escalade', label: 'Escalade' },
        { value: 'CT4', label: 'CT4' },
        { value: 'CT5', label: 'CT5' },
        { value: 'XT4', label: 'XT4' },
        { value: 'XT5', label: 'XT5' },
        { value: 'XT6', label: 'XT6' },
        { value: 'LYRIQ', label: 'LYRIQ' }
      ],
      features: [
        { value: 'sunroof', label: 'Sunroof' },
        { value: 'navigation', label: 'Navigation' },
        { value: 'leatherSeats', label: 'Leather Seats' },
        { value: 'heatedSeats', label: 'Heated Seats' },
        { value: 'bluetooth', label: 'Bluetooth' },
        { value: 'backupCamera', label: 'Backup Camera' },
        { value: 'thirdRowSeating', label: 'Third Row Seating' }
      ],
      drivetrain: [
        { value: 'awd', label: 'All-Wheel Drive' },
        { value: 'fwd', label: 'Front-Wheel Drive' },
        { value: 'rwd', label: 'Rear-Wheel Drive' },
        { value: '4wd', label: '4-Wheel Drive' }
      ],
      transmission: [
        { value: 'automatic', label: 'Automatic' },
        { value: 'manual', label: 'Manual' },
        { value: 'cvt', label: 'CVT' }
      ],
      fuelType: [
        { value: 'gasoline', label: 'Gasoline' },
        { value: 'diesel', label: 'Diesel' },
        { value: 'electric', label: 'Electric' },
        { value: 'hybrid', label: 'Hybrid' }
      ],
      bodyStyle: [
        { value: 'suv', label: 'SUV' },
        { value: 'sedan', label: 'Sedan' },
        { value: 'coupe', label: 'Coupe' },
        { value: 'truck', label: 'Truck' },
        { value: 'wagon', label: 'Wagon' }
      ],
      color: [
        { value: 'black', label: 'Black' },
        { value: 'white', label: 'White' },
        { value: 'silver', label: 'Silver' },
        { value: 'gray', label: 'Gray' },
        { value: 'red', label: 'Red' },
        { value: 'blue', label: 'Blue' },
        { value: 'green', label: 'Green' },
        { value: 'other', label: 'Other' }
      ],
      sort: [
        { value: 'featured', label: 'Featured' },
        { value: 'price-asc', label: 'Price (Low to High)' },
        { value: 'price-desc', label: 'Price (High to Low)' },
        { value: 'year-desc', label: 'Year (Newest First)' },
        { value: 'year-asc', label: 'Year (Oldest First)' },
        { value: 'model-asc', label: 'Model (A-Z)' },
        { value: 'model-desc', label: 'Model (Z-A)' }
      ]
    };

    // Define quick filter presets
    this.filterPresets = [
      {
        id: 'under-50k',
        name: 'Under $50,000',
        filters: {
          priceRange: { min: 0, max: 50000 }
        }
      },
      {
        id: 'luxury-suvs',
        name: 'Luxury SUVs',
        filters: {
          bodyStyle: ['suv'],
          features: { leatherSeats: true, sunroof: true }
        }
      },
      {
        id: 'new-arrivals',
        name: 'New Arrivals',
        filters: {
          sort: 'newest'
        }
      }
    ];

    // Callbacks
    this.onFilterChange = options.onFilterChange || (() => {});

    // Filter logic operators - this determines how multiple selections in the same category are handled
    this.filterLogic = {
      model: 'OR',             // Match any selected model
      features: 'AND',         // Must have all selected features
      drivetrain: 'OR',        // Match any selected drivetrain
      transmission: 'OR',      // Match any selected transmission
      fuelType: 'OR',          // Match any selected fuel type
      bodyStyle: 'OR',         // Match any selected body style
      color: 'OR'              // Match any selected color
    };

    // Initialize
    this.syncWithUrl();
    this.setupFilterPersistence();
  }

  /**
   * Apply a filter preset
   * @param {string} presetId - ID of the preset to apply
   */
  applyPreset(presetId) {
    const preset = this.filterPresets.find(p => p.id === presetId);
    if (!preset) return;

    // Apply the preset filters
    this.filterState = {
      ...this.filterState,
      ...preset.filters,
      page: 1 // Reset to first page
    };

    // Update UI and trigger filter change
    this.updateFilterUI();
    this.updateUrl();
    this.onFilterChange(this.filterState);
  }

  /**
   * Save current filter state
   * @param {string} name - Name for the saved filter
   */
  saveFilter(name) {
    const userId = this.getUserId();
    
    // For anonymous users, use localStorage
    if (!userId) {
      const savedFilters = JSON.parse(localStorage.getItem('savedFilters') || '[]');
      savedFilters.push({
        name,
        state: this.filterState,
        date: new Date().toISOString()
      });
      localStorage.setItem('savedFilters', JSON.stringify(savedFilters));
      this.updateSavedFiltersUI();
      return;
    }
    
    // For logged-in users, save to API (when implemented)
    // For now, still use localStorage
    const savedFilters = JSON.parse(localStorage.getItem(`savedFilters_${userId}`) || '[]');
    savedFilters.push({
      name,
      state: this.filterState,
      date: new Date().toISOString()
    });
    localStorage.setItem(`savedFilters_${userId}`, JSON.stringify(savedFilters));
    this.updateSavedFiltersUI();
  }

  /**
   * Load a saved filter
   * @param {number} index - Index of the saved filter to load
   */
  loadSavedFilter(index) {
    const userId = this.getUserId();
    const key = userId ? `savedFilters_${userId}` : 'savedFilters';
    const savedFilters = JSON.parse(localStorage.getItem(key) || '[]');
    
    if (index >= 0 && index < savedFilters.length) {
      this.filterState = {
        ...this.filterState,
        ...savedFilters[index].state,
        page: 1 // Reset to first page
      };
      
      this.updateFilterUI();
      this.updateUrl();
      this.onFilterChange(this.filterState);
    }
  }

  /**
   * Delete a saved filter
   * @param {number} index - Index of the saved filter to delete
   */
  deleteSavedFilter(index) {
    const userId = this.getUserId();
    const key = userId ? `savedFilters_${userId}` : 'savedFilters';
    const savedFilters = JSON.parse(localStorage.getItem(key) || '[]');
    
    if (index >= 0 && index < savedFilters.length) {
      savedFilters.splice(index, 1);
      localStorage.setItem(key, JSON.stringify(savedFilters));
      this.updateSavedFiltersUI();
    }
  }

  /**
   * Update the UI with saved filters
   */
  updateSavedFiltersUI() {
    // Implement in subclass or inject UI update function
    if (typeof this.options?.updateSavedFiltersUI === 'function') {
      this.options.updateSavedFiltersUI(this.getSavedFilters());
    }
  }

  /**
   * Get current saved filters
   * @return {Array} Array of saved filters
   */
  getSavedFilters() {
    const userId = this.getUserId();
    const key = userId ? `savedFilters_${userId}` : 'savedFilters';
    return JSON.parse(localStorage.getItem(key) || '[]');
  }

  /**
   * Get current user ID for saved filters
   * @return {string|null} User ID if logged in, null otherwise
   */
  getUserId() {
    // Replace with actual authentication check when implemented
    return null;
  }

  /**
   * Update filter UI elements to match current filter state
   */
  updateFilterUI() {
    // This method should be overridden by the implementing component
    // or provided as a callback in options
    if (typeof this.options?.updateFilterUI === 'function') {
      this.options.updateFilterUI(this.filterState);
    }
  }

  /**
   * Set up filter persistence for page reloads
   */
  setupFilterPersistence() {
    // Remember filter state for 30 minutes
    const savedState = sessionStorage.getItem('inventoryFilterState');
    
    if (savedState) {
      try {
        const parsedState = JSON.parse(savedState);
        const timestamp = parsedState._timestamp || 0;
        const now = Date.now();
        
        // Check if saved state is less than 30 minutes old
        if (now - timestamp < 30 * 60 * 1000) {
          delete parsedState._timestamp;
          this.filterState = {
            ...this.filterState,
            ...parsedState
          };
          this.updateFilterUI();
        } else {
          // Expired, remove it
          sessionStorage.removeItem('inventoryFilterState');
        }
      } catch (e) {
        console.error('Error parsing saved filter state:', e);
        sessionStorage.removeItem('inventoryFilterState');
      }
    }
    
    // Save filter state when page is unloaded
    window.addEventListener('beforeunload', () => {
      const stateToSave = {
        ...this.filterState,
        _timestamp: Date.now()
      };
      sessionStorage.setItem('inventoryFilterState', JSON.stringify(stateToSave));
    });
  }

  /**
   * Synchronize filter state with URL parameters
   */
  syncWithUrl() {
    const params = new URLSearchParams(window.location.search);
    
    // Process string parameters
    if (params.has('search')) this.filterState.search = params.get('search');
    if (params.has('sort')) this.filterState.sort = params.get('sort');
    if (params.has('page')) this.filterState.page = parseInt(params.get('page'), 10) || 1;
    if (params.has('limit')) this.filterState.limit = parseInt(params.get('limit'), 10) || 12;
    
    // Process array parameters (comma-separated)
    ['make', 'model', 'drivetrain', 'transmission', 'fuelType', 'bodyStyle', 'color'].forEach(param => {
      if (params.has(param)) {
        this.filterState[param] = params.get(param).split(',').filter(Boolean);
      }
    });
    
    // Process range parameters
    if (params.has('yearMin')) this.filterState.yearRange.min = parseInt(params.get('yearMin'), 10);
    if (params.has('yearMax')) this.filterState.yearRange.max = parseInt(params.get('yearMax'), 10);
    if (params.has('priceMin')) this.filterState.priceRange.min = parseInt(params.get('priceMin'), 10);
    if (params.has('priceMax')) this.filterState.priceRange.max = parseInt(params.get('priceMax'), 10);
    
    // Process features (feature_name=true)
    this.filterOptions.features.forEach(feature => {
      const paramName = `feature_${feature.value}`;
      if (params.has(paramName)) {
        this.filterState.features[feature.value] = params.get(paramName) === 'true';
      }
    });
  }

  /**
   * Update URL with current filter state
   */
  updateUrl() {
    const params = new URLSearchParams();
    
    // Add simple parameters
    if (this.filterState.search) params.set('search', this.filterState.search);
    if (this.filterState.sort !== 'featured') params.set('sort', this.filterState.sort);
    if (this.filterState.page > 1) params.set('page', this.filterState.page.toString());
    if (this.filterState.limit !== 12) params.set('limit', this.filterState.limit.toString());
    
    // Add array parameters
    ['make', 'model', 'drivetrain', 'transmission', 'fuelType', 'bodyStyle', 'color'].forEach(param => {
      if (this.filterState[param] && this.filterState[param].length > 0) {
        params.set(param, this.filterState[param].join(','));
      }
    });
    
    // Add range parameters (only if not default)
    if (this.filterState.yearRange.min > 0) {
      params.set('yearMin', this.filterState.yearRange.min.toString());
    }
    if (this.filterState.yearRange.max < new Date().getFullYear() + 1) {
      params.set('yearMax', this.filterState.yearRange.max.toString());
    }
    if (this.filterState.priceRange.min > 0) {
      params.set('priceMin', this.filterState.priceRange.min.toString());
    }
    if (this.filterState.priceRange.max < 1000000) {
      params.set('priceMax', this.filterState.priceRange.max.toString());
    }
    
    // Add features as individual parameters
    Object.entries(this.filterState.features).forEach(([feature, enabled]) => {
      if (enabled) params.set(`feature_${feature}`, 'true');
    });
    
    // Update URL without refreshing page
    const url = new URL(window.location);
    url.search = params.toString();
    window.history.replaceState({}, '', url);
  }

  /**
   * Update filter state from filter form
   * @param {HTMLFormElement} form - The filter form element
   */
  updateFromForm(form) {
    const formData = new FormData(form);
    
    // Reset filter state to defaults
    this.filterState = {
      ...this.filterState,
      search: '',
      model: [],
      yearRange: { min: 0, max: new Date().getFullYear() + 1 },
      priceRange: { min: 0, max: 1000000 },
      features: {},
      drivetrain: [],
      transmission: [],
      fuelType: [],
      bodyStyle: [],
      color: [],
      page: 1, // Reset to first page
    };
    
    // Process form data
    for (const [key, value] of formData.entries()) {
      if (!value) continue;
      
      // Handle different filter types
      if (key === 'search') {
        this.filterState.search = value;
      } else if (key === 'sort') {
        this.filterState.sort = value;
      } else if (key === 'yearMin') {
        this.filterState.yearRange.min = parseInt(value, 10) || 0;
      } else if (key === 'yearMax') {
        this.filterState.yearRange.max = parseInt(value, 10) || new Date().getFullYear() + 1;
      } else if (key === 'priceMin') {
        this.filterState.priceRange.min = parseInt(value, 10) || 0;
      } else if (key === 'priceMax') {
        this.filterState.priceRange.max = parseInt(value, 10) || 1000000;
      } else if (key.startsWith('feature_')) {
        const featureName = key.replace('feature_', '');
        this.filterState.features[featureName] = true;
      } else if (this.filterState[key] && Array.isArray(this.filterState[key])) {
        // Handle multi-select inputs
        if (Array.isArray(value)) {
          this.filterState[key] = value;
        } else {
          this.filterState[key].push(value);
        }
      }
    }
    
    // Update URL and trigger change
    this.updateUrl();
    this.onFilterChange(this.filterState);
    return this.filterState;
  }

  /**
   * Apply filters to a list of items
   * @param {Array} items - Items to filter
   * @return {Array} Filtered items
   */
  applyFilters(items) {
    return items.filter(item => {
      // Text search filter
      if (this.filterState.search) {
        const searchTerm = this.filterState.search.toLowerCase();
        const itemText = `${item.make} ${item.model} ${item.year} ${item.trim} ${item.color} ${item.vin}`.toLowerCase();
        if (!itemText.includes(searchTerm)) return false;
      }
      
      // Make filter
      if (this.filterState.make.length > 0 && !this.filterState.make.some(make => 
        item.make.toLowerCase() === make.toLowerCase()
      )) {
        return false;
      }
      
      // Model filter (OR logic) - match any of the selected models
      if (this.filterState.model.length > 0 && !this.filterState.model.some(model => 
        item.model.toLowerCase().includes(model.toLowerCase())
      )) {
        return false;
      }
      
      // Year range filter
      if (item.year < this.filterState.yearRange.min || item.year > this.filterState.yearRange.max) {
        return false;
      }
      
      // Price range filter
      if (item.price < this.filterState.priceRange.min || item.price > this.filterState.priceRange.max) {
        return false;
      }
      
      // Feature filters (AND logic) - must have all selected features
      const enabledFeatures = Object.entries(this.filterState.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature]) => feature);
        
      if (enabledFeatures.length > 0) {
        for (const feature of enabledFeatures) {
          // Check if the item has this feature
          if (!item.features || !item.features.includes(feature)) {
            return false;
          }
        }
      }
      
      // Process other array filters with OR logic
      for (const filterKey of ['drivetrain', 'transmission', 'fuelType', 'bodyStyle', 'color']) {
        const selectedValues = this.filterState[filterKey];
        
        if (selectedValues.length > 0) {
          // Skip if any match is found
          if (!selectedValues.some(value => 
            item[filterKey]?.toLowerCase() === value.toLowerCase()
          )) {
            return false;
          }
        }
      }
      
      return true;
    });
  }

  /**
   * Sort items based on current sort setting
   * @param {Array} items - Items to sort
   * @return {Array} Sorted items
   */
  sortItems(items) {
    const sortedItems = [...items];
    
    switch (this.filterState.sort) {
      case 'price-asc':
        return sortedItems.sort((a, b) => a.price - b.price);
      case 'price-desc':
        return sortedItems.sort((a, b) => b.price - a.price);
      case 'year-desc':
        return sortedItems.sort((a, b) => b.year - a.year);
      case 'year-asc':
        return sortedItems.sort((a, b) => a.year - b.year);
      case 'model-asc':
        return sortedItems.sort((a, b) => a.model.localeCompare(b.model));
      case 'model-desc':
        return sortedItems.sort((a, b) => b.model.localeCompare(a.model));
      case 'newest':
        return sortedItems.sort((a, b) => new Date(b.dateAdded || b.date || 0) - new Date(a.dateAdded || a.date || 0));
      case 'featured':
      default:
        // For featured, we keep the original order or sort by featured flag
        return sortedItems.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }
  }
  
  /**
   * Reset filters to default values
   */
  resetFilters() {
    this.filterState = {
      search: '',
      make: ['Cadillac'],
      model: [],
      yearRange: { min: 0, max: new Date().getFullYear() + 1 },
      priceRange: { min: 0, max: 1000000 },
      features: {},
      drivetrain: [],
      transmission: [],
      fuelType: [],
      bodyStyle: [],
      color: [],
      sort: 'featured',
      page: 1,
      limit: this.filterState.limit
    };
    
    this.updateFilterUI();
    this.updateUrl();
    this.onFilterChange(this.filterState);
  }
  
  /**
   * Get the current filter state
   * @return {Object} Current filter state
   */
  getFilterState() {
    return { ...this.filterState };
  }
}

export default FilterManager;
