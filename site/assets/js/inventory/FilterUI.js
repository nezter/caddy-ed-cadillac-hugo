/**
 * FilterUI - Handles the user interface for filter interactions
 * 
 * This class provides:
 * - Filter form generation and updates
 * - Mobile-friendly filter interface
 * - Integration with FilterManager for state management
 */

import FilterManager from './FilterManager';

class FilterUI {
  /**
   * Create a filter UI manager
   * @param {Object} options - Configuration options
   */
  constructor(options = {}) {
    this.options = {
      filterContainer: '#inventory-filters',
      filterToggle: '.filter-toggle',
      resultsContainer: '#vehicle-inventory',
      mobileBreakpoint: 768,
      ...options
    };
    
    // DOM elements
    this.filterContainer = document.querySelector(this.options.filterContainer);
    this.filterToggle = document.querySelector(this.options.filterToggle);
    this.resultsContainer = document.querySelector(this.options.resultsContainer);
    
    if (!this.filterContainer || !this.resultsContainer) {
      console.error('Required DOM elements not found for FilterUI');
      return;
    }
    
    // Create filter manager with callback
    this.filterManager = new FilterManager({
      onFilterChange: this.handleFilterChange.bind(this),
      updateFilterUI: this.updateFilterUIFromState.bind(this),
      updateSavedFiltersUI: this.updateSavedFiltersUI.bind(this),
      ...options
    });
    
    // Initialize
    this.init();
  }
  
  /**
   * Initialize the filter UI
   */
  init() {
    this.renderFilterForm();
    this.bindEvents();
    this.setupMobileUI();
    
    // Update filter counts
    this.updateActiveFilterCount();
  }
  
  /**
   * Render the filter form
   */
  renderFilterForm() {
    // If we have an existing form, use it; otherwise create one
    let form = this.filterContainer.querySelector('form');
    if (!form) {
      form = document.createElement('form');
      form.classList.add('inventory-filter-form');
      this.filterContainer.appendChild(form);
    }
    
    this.filterForm = form;
    this.filterForm.innerHTML = this.generateFilterFormHTML();
    
    // Initialize range sliders if needed
    this.initRangeSliders();
    
    // Update UI to match current filter state
    this.updateFilterUIFromState(this.filterManager.getFilterState());
  }
  
  /**
   * Generate HTML for the filter form
   * @return {string} HTML for the filter form
   */
  generateFilterFormHTML() {
    const state = this.filterManager.getFilterState();
    const options = this.filterManager.filterOptions;
    
    return `
      <div class="filter-header">
        <h3>Filter Inventory</h3>
        <button type="button" class="filter-close-mobile" aria-label="Close filters">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      
      <div class="filter-body">
        <!-- Search -->
        <div class="filter-group">
          <label for="filter-search">Search</label>
          <div class="search-input-wrapper">
            <input type="text" id="filter-search" name="search" placeholder="Search inventory..." value="${state.search}">
            <button type="button" class="search-button" aria-label="Search">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
              </svg>
            </button>
          </div>
        </div>
        
        <!-- Model -->
        <div class="filter-group">
          <label for="filter-model">Model</label>
          <select id="filter-model" name="model" multiple>
            ${options.model.map(option => `
              <option value="${option.value}">${option.label}</option>
            `).join('')}
          </select>
        </div>
        
        <!-- Year Range -->
        <div class="filter-group">
          <label>Year Range</label>
          <div class="range-slider-container">
            <div class="range-inputs">
              <input type="number" id="yearMin" name="yearMin" min="1990" max="${new Date().getFullYear() + 1}" value="${state.yearRange.min || ''}" placeholder="Min">
              <span class="range-separator">to</span>
              <input type="number" id="yearMax" name="yearMax" min="1990" max="${new Date().getFullYear() + 1}" value="${state.yearRange.max !== new Date().getFullYear() + 1 ? state.yearRange.max : ''}" placeholder="Max">
            </div>
            <div class="range-slider" id="year-range-slider" data-min="1990" data-max="${new Date().getFullYear() + 1}"></div>
          </div>
        </div>
        
        <!-- Price Range -->
        <div class="filter-group">
          <label>Price Range</label>
          <div class="range-slider-container">
            <div class="range-inputs">
              <input type="number" id="priceMin" name="priceMin" min="0" step="1000" value="${state.priceRange.min || ''}" placeholder="Min">
              <span class="range-separator">to</span>
              <input type="number" id="priceMax" name="priceMax" min="0" step="1000" value="${state.priceRange.max !== 1000000 ? state.priceRange.max : ''}" placeholder="Max">
            </div>
            <div class="range-slider" id="price-range-slider" data-min="0" data-max="200000" data-step="1000"></div>
          </div>
        </div>
        
        <!-- Features -->
        <div class="filter-group">
          <label>Features</label>
          <div class="checkbox-group">
            ${options.features.map(feature => `
              <div class="checkbox-item">
                <input type="checkbox" id="feature_${feature.value}" name="feature_${feature.value}" value="true">
                <label for="feature_${feature.value}">${feature.label}</label>
              </div>
            `).join('')}
          </div>
        </div>
        
        <!-- Body Style -->
        <div class="filter-group">
          <label for="filter-bodyStyle">Body Style</label>
          <select id="filter-bodyStyle" name="bodyStyle" multiple>
            ${options.bodyStyle.map(option => `
              <option value="${option.value}">${option.label}</option>
            `).join('')}
          </select>
        </div>
        
        <!-- Quick Filter Presets -->
        <div class="filter-presets">
          <h4>Quick Filters</h4>
          <div class="preset-buttons">
            ${this.filterManager.filterPresets.map(preset => `
              <button type="button" class="preset-button" data-preset-id="${preset.id}">
                ${preset.name}
              </button>
            `).join('')}
          </div>
        </div>
        
        <!-- Saved Filters -->
        <div class="saved-filters">
          <h4>Saved Filters</h4>
          <div class="saved-filters-list" id="saved-filters-list">
            <!-- Will be populated dynamically -->
          </div>
          <div class="save-filter-form">
            <input type="text" id="save-filter-name" placeholder="Filter name">
            <button type="button" id="save-filter-btn">Save</button>
          </div>
        </div>
      </div>
      
      <!-- Filter Actions -->
      <div class="filter-actions">
        <button type="button" class="reset-filters-btn">Reset All</button>
        <button type="submit" class="apply-filters-btn">Apply Filters</button>
      </div>
    `;
  }
  
  /**
   * Initialize range sliders
   */
  initRangeSliders() {
    // Implementation would depend on the range slider library you're using
    // This is a placeholder for where you would initialize the range sliders
    // For example, if using noUiSlider:
    
    try {
      // Check if noUiSlider is available
      if (window.noUiSlider) {
        // Year range slider
        const yearSlider = document.getElementById('year-range-slider');
        if (yearSlider) {
          const minYear = parseInt(yearSlider.dataset.min || 1990);
          const maxYear = parseInt(yearSlider.dataset.max || new Date().getFullYear() + 1);
          const state = this.filterManager.getFilterState();
          
          noUiSlider.create(yearSlider, {
            start: [state.yearRange.min || minYear, state.yearRange.max || maxYear],
            connect: true,
            step: 1,
            range: {
              'min': minYear,
              'max': maxYear
            },
            format: {
              to: value => Math.round(value),
              from: value => Math.round(value)
            }
          });
          
          // Connect slider to input fields
          const yearMinInput = document.getElementById('yearMin');
          const yearMaxInput = document.getElementById('yearMax');
          
          yearSlider.noUiSlider.on('update', (values, handle) => {
            const value = values[handle];
            if (handle === 0) {
              yearMinInput.value = value;
            } else {
              yearMaxInput.value = value;
            }
          });
          
          yearMinInput.addEventListener('change', function() {
            yearSlider.noUiSlider.set([this.value, null]);
          });
          
          yearMaxInput.addEventListener('change', function() {
            yearSlider.noUiSlider.set([null, this.value]);
          });
        }
        
        // Price range slider
        const priceSlider = document.getElementById('price-range-slider');
        if (priceSlider) {
          const minPrice = parseInt(priceSlider.dataset.min || 0);
          const maxPrice = parseInt(priceSlider.dataset.max || 200000);
          const step = parseInt(priceSlider.dataset.step || 1000);
          const state = this.filterManager.getFilterState();
          
          noUiSlider.create(priceSlider, {
            start: [state.priceRange.min || minPrice, state.priceRange.max !== 1000000 ? state.priceRange.max : maxPrice],
            connect: true,
            step: step,
            range: {
              'min': minPrice,
              'max': maxPrice
            },
            format: {
              to: value => Math.round(value),
              from: value => Math.round(value)
            }
          });
          
          // Connect slider to input fields
          const priceMinInput = document.getElementById('priceMin');
          const priceMaxInput = document.getElementById('priceMax');
          
          priceSlider.noUiSlider.on('update', (values, handle) => {
            const value = values[handle];
            if (handle === 0) {
              priceMinInput.value = value;
            } else {
              priceMaxInput.value = value;
            }
          });
          
          priceMinInput.addEventListener('change', function() {
            priceSlider.noUiSlider.set([this.value, null]);
          });
          
          priceMaxInput.addEventListener('change', function() {
            priceSlider.noUiSlider.set([null, this.value]);
          });
        }
      }
    } catch (e) {
      console.warn('Range sliders could not be initialized:', e);
    }
  }
  
  /**
   * Bind event listeners
   */
  bindEvents() {
    // Form submission
    this.filterForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.filterManager.updateFromForm(this.filterForm);
    });
    
    // Reset filters
    const resetBtn = this.filterForm.querySelector('.reset-filters-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        this.filterManager.resetFilters();
      });
    }
    
    // Quick filter presets
    const presetButtons = this.filterForm.querySelectorAll('.preset-button');
    presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        const presetId = button.dataset.presetId;
        if (presetId) {
          this.filterManager.applyPreset(presetId);
        }
      });
    });
    
    // Save filter
    const saveFilterBtn = this.filterForm.querySelector('#save-filter-btn');
    if (saveFilterBtn) {
      saveFilterBtn.addEventListener('click', () => {
        const nameInput = this.filterForm.querySelector('#save-filter-name');
        if (nameInput && nameInput.value) {
          this.filterManager.saveFilter(nameInput.value);
          nameInput.value = '';
        }
      });
    }
    
    // Instant search
    const searchInput = this.filterForm.querySelector('#filter-search');
    if (searchInput) {
      searchInput.addEventListener('input', this.debounce(() => {
        this.filterForm.dispatchEvent(new Event('submit'));
      }, 300));
    }
    
    // Mobile toggle
    if (this.filterToggle) {
      this.filterToggle.addEventListener('click', () => {
        this.toggleMobileFilters();
      });
    }
    
    // Mobile close
    const closeButton = this.filterForm.querySelector('.filter-close-mobile');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        this.closeMobileFilters();
      });
    }
  }
  
  /**
   * Update filter UI from state
   * @param {Object} state - Filter state
   */
  updateFilterUIFromState(state) {
    // Update search input
    const searchInput = this.filterForm.querySelector('#filter-search');
    if (searchInput) {
      searchInput.value = state.search || '';
    }
    
    // Update model select
    const modelSelect = this.filterForm.querySelector('#filter-model');
    if (modelSelect) {
      Array.from(modelSelect.options).forEach(option => {
        option.selected = state.model.includes(option.value);
      });
    }
    
    // Update body style select
    const bodyStyleSelect = this.filterForm.querySelector('#filter-bodyStyle');
    if (bodyStyleSelect) {
      Array.from(bodyStyleSelect.options).forEach(option => {
        option.selected = state.bodyStyle.includes(option.value);
      });
    }
    
    // Update year inputs
    const yearMinInput = this.filterForm.querySelector('#yearMin');
    const yearMaxInput = this.filterForm.querySelector('#yearMax');
    if (yearMinInput && state.yearRange.min > 0) {
      yearMinInput.value = state.yearRange.min;
    }
    if (yearMaxInput && state.yearRange.max < new Date().getFullYear() + 1) {
      yearMaxInput.value = state.yearRange.max;
    }
    
    // Update price inputs
    const priceMinInput = this.filterForm.querySelector('#priceMin');
    const priceMaxInput = this.filterForm.querySelector('#priceMax');
    if (priceMinInput && state.priceRange.min > 0) {
      priceMinInput.value = state.priceRange.min;
    }
    if (priceMaxInput && state.priceRange.max < 1000000) {
      priceMaxInput.value = state.priceRange.max;
    }
    
    // Update range sliders if they exist
    try {
      const yearSlider = document.getElementById('year-range-slider');
      if (yearSlider && yearSlider.noUiSlider) {
        yearSlider.noUiSlider.set([
          state.yearRange.min || parseInt(yearSlider.dataset.min || 1990),
          state.yearRange.max || parseInt(yearSlider.dataset.max || new Date().getFullYear() + 1)
        ]);
      }
      
      const priceSlider = document.getElementById('price-range-slider');
      if (priceSlider && priceSlider.noUiSlider) {
        priceSlider.noUiSlider.set([
          state.priceRange.min || 0,
          state.priceRange.max !== 1000000 ? state.priceRange.max : parseInt(priceSlider.dataset.max || 200000)
        ]);
      }
    } catch (e) {
      console.warn('Could not update range sliders:', e);
    }
    
    // Update feature checkboxes
    Object.entries(state.features).forEach(([feature, enabled]) => {
      const checkbox = this.filterForm.querySelector(`#feature_${feature}`);
      if (checkbox) {
        checkbox.checked = enabled;
      }
    });
    
    // Update active filter count
    this.updateActiveFilterCount();
  }
  
  /**
   * Update saved filters UI
   * @param {Array} savedFilters - Saved filters
   */
  updateSavedFiltersUI(savedFilters) {
    const container = this.filterForm.querySelector('#saved-filters-list');
    if (!container) return;
    
    if (!savedFilters || savedFilters.length === 0) {
      container.innerHTML = '<div class="no-saved-filters">No saved filters</div>';
      return;
    }
    
    let html = '';
    savedFilters.forEach((filter, index) => {
      html += `
        <div class="saved-filter-item">
          <button type="button" class="load-filter-btn" data-index="${index}">${filter.name}</button>
          <button type="button" class="delete-filter-btn" data-index="${index}" aria-label="Delete this filter">
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
      `;
    });
    
    container.innerHTML = html;
    
    // Add event listeners
    container.querySelectorAll('.load-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index, 10);
        this.filterManager.loadSavedFilter(index);
      });
    });
    
    container.querySelectorAll('.delete-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const index = parseInt(btn.dataset.index, 10);
        if (confirm('Are you sure you want to delete this saved filter?')) {
          this.filterManager.deleteSavedFilter(index);
        }
      });
    });
  }
  
  /**
   * Set up mobile UI
   */
  setupMobileUI() {
    // Make filters slide in on mobile
    const mediaQuery = window.matchMedia(`(max-width: ${this.options.mobileBreakpoint}px)`);
    
    const handleMediaChange = (e) => {
      if (e.matches) {
        // Mobile view
        this.filterContainer.classList.add('mobile-filters');
        document.body.classList.remove('filters-open');
      } else {
        // Desktop view
        this.filterContainer.classList.remove('mobile-filters');
        document.body.classList.remove('filters-open');
      }
    };
    
    // Initial check
    handleMediaChange(mediaQuery);
    
    // Add listener for changes
    try {
      // Modern browsers
      mediaQuery.addEventListener('change', handleMediaChange);
    } catch (e) {
      // Legacy browsers
      mediaQuery.addListener(handleMediaChange);
    }
  }
  
  /**
   * Toggle mobile filters visibility
   */
  toggleMobileFilters() {
    const isMobile = window.matchMedia(`(max-width: ${this.options.mobileBreakpoint}px)`).matches;
    if (!isMobile) return;
    
    document.body.classList.toggle('filters-open');
  }
  
  /**
   * Close mobile filters
   */
  closeMobileFilters() {
    document.body.classList.remove('filters-open');
  }
  
  /**
   * Update active filter count
   */
  updateActiveFilterCount() {
    const state = this.filterManager.getFilterState();
    let activeFilterCount = 0;
    
    // Check each filter type for active values
    if (state.search) activeFilterCount++;
    if (state.model.length > 0) activeFilterCount++;
    if (state.bodyStyle.length > 0) activeFilterCount++;
    if (state.drivetrain.length > 0) activeFilterCount++;
    if (state.transmission.length > 0) activeFilterCount++;
    if (state.fuelType.length > 0) activeFilterCount++;
    if (state.color.length > 0) activeFilterCount++;
    
    // Year range
    if (state.yearRange.min > 0 || state.yearRange.max < new Date().getFullYear() + 1) {
      activeFilterCount++;
    }
    
    // Price range
    if (state.priceRange.min > 0 || state.priceRange.max < 1000000) {
      activeFilterCount++;
    }
    
    // Features
    const activeFeatures = Object.values(state.features).filter(Boolean).length;
    if (activeFeatures > 0) activeFilterCount++;
    
    // Update filter toggle button if it exists
    if (this.filterToggle) {
      const countBadge = this.filterToggle.querySelector('.filter-count');
      if (countBadge) {
        countBadge.textContent = activeFilterCount;
        countBadge.style.display = activeFilterCount > 0 ? 'inline' : 'none';
      } else if (activeFilterCount > 0) {
        // Create badge if it doesn't exist
        const badge = document.createElement('span');
        badge.className = 'filter-count';
        badge.textContent = activeFilterCount;
        this.filterToggle.appendChild(badge);
      }
    }
  }
  
  /**
   * Handle filter change
   * @param {Object} state - New filter state
   */
  handleFilterChange(state) {
    // This could be overridden by the implementing component or
    // provided as a callback in options
    if (typeof this.options.onFilterChange === 'function') {
      this.options.onFilterChange(state);
    }
    
    // Update active filter count
    this.updateActiveFilterCount();
  }
  
  /**
   * Debounce function to limit how often a function is called
   * @param {Function} func - Function to debounce
   * @param {number} wait - Milliseconds to wait
   * @return {Function} Debounced function
   */
  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
}

export default FilterUI;
