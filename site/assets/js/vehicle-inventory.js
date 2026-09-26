/**
 * Vehicle Inventory Management
 * Handles vehicle filtering, sorting, and display
 */

class VehicleInventory {
  constructor(options = {}) {
    this.containerSelector = options.containerSelector || '.vehicle-listings';
    this.filterSelector = options.filterSelector || '.inventory-filter';
    this.sortSelector = options.sortSelector || '.inventory-sort';
    this.paginationSelector = options.paginationSelector || '.inventory-pagination';
    this.itemsPerPage = options.itemsPerPage || 9;
    this.currentPage = 1;
    
    this.initialize();
  }
  
  initialize() {
    // Get the inventory container
    this.container = document.querySelector(this.containerSelector);
    if (!this.container) return;
    
    // Get filter, sort, and pagination elements
    this.filterForm = document.querySelector(this.filterSelector);
    this.sortSelect = document.querySelector(this.sortSelector);
    this.pagination = document.querySelector(this.paginationSelector);
    
    // Get all vehicle cards
    this.vehicleCards = Array.from(this.container.querySelectorAll('.vehicle-card'));
    this.totalItems = this.vehicleCards.length;
    
    // Initialize filters
    if (this.filterForm) {
      this.initializeFilters();
    }
    
    // Initialize sorting
    if (this.sortSelect) {
      this.initializeSorting();
    }
    
    // Initialize pagination
    if (this.pagination) {
      this.initializePagination();
    }
    
    // Initialize saved/favorited vehicles
    this.initializeFavorites();
    
    // Initial display
    this.updateDisplay();
  }
  
  initializeFilters() {
    const filterInputs = this.filterForm.querySelectorAll('input, select');
    
    filterInputs.forEach(input => {
      input.addEventListener('change', () => {
        this.currentPage = 1; // Reset to first page on filter change
        this.updateDisplay();
      });
    });
    
    // Handle filter reset
    const resetButton = this.filterForm.querySelector('.filter-reset');
    if (resetButton) {
      resetButton.addEventListener('click', (e) => {
        e.preventDefault();
        this.filterForm.reset();
        this.currentPage = 1;
        this.updateDisplay();
      });
    }
    
    // Handle filter toggle on mobile
    const filterToggle = document.querySelector('.filter-toggle');
    if (filterToggle) {
      filterToggle.addEventListener('click', () => {
        this.filterForm.classList.toggle('active');
      });
    }
  }
  
  initializeSorting() {
    this.sortSelect.addEventListener('change', () => {
      this.updateDisplay();
    });
  }
  
  initializePagination() {
    // Pagination is created dynamically based on filtered results
    this.pagination.addEventListener('click', (e) => {
      if (e.target.classList.contains('page-link')) {
        e.preventDefault();
        
        if (e.target.dataset.page === 'prev') {
          if (this.currentPage > 1) this.currentPage--;
        } else if (e.target.dataset.page === 'next') {
          if (this.currentPage < this.totalPages) this.currentPage++;
        } else {
          this.currentPage = parseInt(e.target.dataset.page, 10);
        }
        
        this.updateDisplay();
        
        // Scroll to top of inventory
        this.container.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
  
  initializeFavorites() {
    // Get saved favorites from localStorage
    const savedFavorites = localStorage.getItem('favoriteVehicles');
    this.favorites = savedFavorites ? JSON.parse(savedFavorites) : [];
    
    // Add favorite toggle to each card
    this.vehicleCards.forEach(card => {
      const vehicleId = card.dataset.id;
      const favoriteBtn = card.querySelector('.favorite-toggle');
      
      if (favoriteBtn) {
        // Set initial state
        if (this.favorites.includes(vehicleId)) {
          favoriteBtn.classList.add('active');
          favoriteBtn.setAttribute('aria-checked', 'true');
        }
        
        favoriteBtn.addEventListener('click', () => {
          this.toggleFavorite(vehicleId);
          
          // Update button state
          const isFavorite = this.favorites.includes(vehicleId);
          favoriteBtn.classList.toggle('active', isFavorite);
          favoriteBtn.setAttribute('aria-checked', isFavorite ? 'true' : 'false');
        });
      }
    });
    
    // Handle favorites filter
    const favoritesFilter = document.querySelector('#filter-favorites');
    if (favoritesFilter) {
      favoritesFilter.addEventListener('change', () => {
        this.currentPage = 1;
        this.updateDisplay();
      });
    }
  }
  
  toggleFavorite(vehicleId) {
    const index = this.favorites.indexOf(vehicleId);
    
    if (index === -1) {
      // Add to favorites
      this.favorites.push(vehicleId);
    } else {
      // Remove from favorites
      this.favorites.splice(index, 1);
    }
    
    // Save to localStorage
    localStorage.setItem('favoriteVehicles', JSON.stringify(this.favorites));
    
    // Update any favorites counter
    const favCounter = document.querySelector('.favorites-count');
    if (favCounter) {
      favCounter.textContent = this.favorites.length;
    }
  }
  
  filterVehicles() {
    if (!this.filterForm) return this.vehicleCards;
    
    return this.vehicleCards.filter(card => {
      // Check if we're only showing favorites
      const showOnlyFavorites = document.querySelector('#filter-favorites')?.checked;
      if (showOnlyFavorites && !this.favorites.includes(card.dataset.id)) {
        return false;
      }
      
      // Get all active filters
      const filters = Array.from(this.filterForm.elements)
        .filter(el => {
          return (el.type === 'checkbox' && el.checked) || 
                 (el.type !== 'checkbox' && el.value && el.id !== 'filter-favorites');
        });
      
      // Check all filters against card data attributes
      return filters.every(filter => {
        const filterName = filter.name;
        const filterValue = filter.value;
        
        // Handle range filters like price or year
        if (filterName.includes('min') || filterName.includes('max')) {
          const baseProperty = filterName.replace('min', '').replace('max', '');
          const cardValue = parseFloat(card.dataset[baseProperty]);
          
          if (filterName.includes('min')) {
            return cardValue >= parseFloat(filterValue);
          } else {
            return cardValue <= parseFloat(filterValue);
          }
        }
        
        // Handle multi-select filters
        if (filter.multiple) {
          const selectedValues = Array.from(filter.selectedOptions).map(opt => opt.value);
          return selectedValues.includes(card.dataset[filterName]);
        }
        
        // Standard single-value filter
        return card.dataset[filterName] === filterValue;
      });
    });
  }
  
  sortVehicles(filteredVehicles) {
    if (!this.sortSelect || !this.sortSelect.value) return filteredVehicles;
    
    const sortValue = this.sortSelect.value;
    
    return [...filteredVehicles].sort((a, b) => {
      switch (sortValue) {
        case 'price-asc':
          return parseFloat(a.dataset.price) - parseFloat(b.dataset.price);
        case 'price-desc':
          return parseFloat(b.dataset.price) - parseFloat(a.dataset.price);
        case 'year-desc':
          return parseInt(b.dataset.year) - parseInt(a.dataset.year);
        case 'year-asc':
          return parseInt(a.dataset.year) - parseInt(b.dataset.year);
        case 'mileage-asc':
          return parseInt(a.dataset.mileage) - parseInt(b.dataset.mileage);
        case 'mileage-desc':
          return parseInt(b.dataset.mileage) - parseInt(a.dataset.mileage);
        case 'name-asc':
          return a.dataset.name.localeCompare(b.dataset.name);
        case 'name-desc':
          return b.dataset.name.localeCompare(a.dataset.name);
        default:
          return 0;
      }
    });
  }
  
  paginateVehicles(sortedVehicles) {
    this.totalPages = Math.ceil(sortedVehicles.length / this.itemsPerPage);
    
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    
    return sortedVehicles.slice(start, end);
  }
  
  updatePagination(totalFilteredItems) {
    if (!this.pagination) return;
    
    this.totalPages = Math.ceil(totalFilteredItems / this.itemsPerPage);
    
    // Create pagination HTML
    let html = '';
    
    // Previous button
    html += `<a href="#" class="page-link" data-page="prev" ${this.currentPage === 1 ? 'disabled' : ''}>Previous</a>`;
    
    // Page numbers
    for (let i = 1; i <= this.totalPages; i++) {
      html += `<a href="#" class="page-link ${i === this.currentPage ? 'active' : ''}" data-page="${i}">${i}</a>`;
    }
    
    // Next button
    html += `<a href="#" class="page-link" data-page="next" ${this.currentPage === this.totalPages ? 'disabled' : ''}>Next</a>`;
    
    this.pagination.innerHTML = html;
    
    // Show/hide pagination based on results
    this.pagination.style.display = this.totalPages > 1 ? 'flex' : 'none';
  }
  
  updateDisplay() {
    // Apply filters
    const filteredVehicles = this.filterVehicles();
    
    // Sort filtered vehicles
    const sortedVehicles = this.sortVehicles(filteredVehicles);
    
    // Paginate sorted vehicles
    const paginatedVehicles = this.paginateVehicles(sortedVehicles);
    
    // Update pagination
    this.updatePagination(sortedVehicles.length);
    
    // Hide all vehicles first
    this.vehicleCards.forEach(card => {
      card.style.display = 'none';
    });
    
    // Show only paginated vehicles
    paginatedVehicles.forEach(card => {
      card.style.display = 'block';
    });
    
    // Update results count
    const resultsCount = document.querySelector('.results-count');
    if (resultsCount) {
      resultsCount.textContent = `Showing ${paginatedVehicles.length} of ${filteredVehicles.length} vehicles`;
    }
    
    // Show empty state if no results
    const emptyState = document.querySelector('.empty-results');
    if (emptyState) {
      emptyState.style.display = filteredVehicles.length === 0 ? 'block' : 'none';
    }
  }
}

// Initialize vehicle inventory on DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.vehicle-listings')) {
    new VehicleInventory();
  }
});

export default VehicleInventory;