/**
 * Advanced Search Component
 * Comprehensive search interface with faceted filtering and saved searches
 */

class AdvancedSearch {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.searchCriteria = {
      query: '',
      entity_types: ['customers', 'leads', 'interactions', 'vehicles'],
      filters: {},
      sort_by: 'relevance',
      sort_order: 'desc',
      limit: 20,
      offset: 0,
      include_facets: true
    };
    this.results = [];
    this.facets = {};
    this.savedSearches = [];
    this.searchHistory = [];
    this.isLoading = false;
    this.currentPage = 1;

    this.init();
  }

  async init() {
    this.render();
    await this.loadFacets();
    await this.loadSavedSearches();
    this.bindEvents();
    this.restoreFromURL();
  }

  render() {
    this.container.innerHTML = `
      <div class="advanced-search">
        <!-- Search Header -->
        <div class="search-header">
          <div class="search-input-group">
            <div class="search-input-wrapper">
              <input type="text" id="search-input" placeholder="Search customers, leads, interactions, vehicles..." autocomplete="off" />
              <button id="search-button" class="btn btn-primary">
                <i class="fas fa-search"></i>
              </button>
              <button id="clear-search" class="btn btn-secondary" style="display: none;">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div id="search-suggestions" class="search-suggestions" style="display: none;"></div>
          </div>

          <div class="search-actions">
            <button id="filter-toggle" class="btn btn-secondary">
              <i class="fas fa-filter"></i> Filters
              <span id="active-filters-count" class="filter-count" style="display: none;">0</span>
            </button>
            <button id="save-search-btn" class="btn btn-secondary" disabled>
              <i class="fas fa-save"></i> Save Search
            </button>
            <button id="saved-searches-toggle" class="btn btn-secondary">
              <i class="fas fa-bookmark"></i> Saved
            </button>
          </div>
        </div>

        <!-- Filters Panel -->
        <div id="filters-panel" class="filters-panel" style="display: none;">
          <div class="filters-content">
            <!-- Entity Type Filters -->
            <div class="filter-section">
              <h4>Search In:</h4>
              <div class="entity-type-filters">
                <label><input type="checkbox" value="customers" checked /> Customers</label>
                <label><input type="checkbox" value="leads" checked /> Leads</label>
                <label><input type="checkbox" value="interactions" checked /> Interactions</label>
                <label><input type="checkbox" value="vehicles" checked /> Vehicles</label>
                <label><input type="checkbox" value="appointments" /> Appointments</label>
              </div>
            </div>

            <!-- Date Range Filters -->
            <div class="filter-section">
              <h4>Date Range:</h4>
              <div class="date-filters">
                <div class="date-input">
                  <label>From:</label>
                  <input type="date" id="date-from" />
                </div>
                <div class="date-input">
                  <label>To:</label>
                  <input type="date" id="date-to" />
                </div>
              </div>
            </div>

            <!-- Dynamic Facet Filters -->
            <div id="facet-filters" class="facet-filters">
              <!-- Facets will be populated here -->
            </div>

            <!-- Sort Options -->
            <div class="filter-section">
              <h4>Sort By:</h4>
              <div class="sort-options">
                <select id="sort-by">
                  <option value="relevance">Relevance</option>
                  <option value="created_at">Date Created</option>
                  <option value="updated_at">Last Updated</option>
                  <option value="score">Score (Leads)</option>
                  <option value="list_price">Price (Vehicles)</option>
                </select>
                <select id="sort-order">
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>
          </div>

          <div class="filter-actions">
            <button id="apply-filters" class="btn btn-primary">Apply Filters</button>
            <button id="clear-filters" class="btn btn-secondary">Clear All</button>
          </div>
        </div>

        <!-- Saved Searches Panel -->
        <div id="saved-searches-panel" class="saved-searches-panel" style="display: none;">
          <div class="saved-searches-header">
            <h4>Saved Searches</h4>
            <button id="close-saved-searches" class="btn-icon">
              <i class="fas fa-times"></i>
            </button>
          </div>
          <div id="saved-searches-list" class="saved-searches-list">
            <!-- Saved searches will be populated here -->
          </div>
        </div>

        <!-- Search Results -->
        <div class="search-results">
          <div class="results-header">
            <div class="results-info">
              <span id="results-count">No search performed yet</span>
              <span id="search-time"></span>
            </div>
            <div class="results-actions">
              <select id="results-per-page">
                <option value="10">10 per page</option>
                <option value="20" selected>20 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>
          </div>

          <!-- Facets Sidebar -->
          <div class="results-layout">
            <div id="facets-sidebar" class="facets-sidebar">
              <!-- Result facets will be populated here -->
            </div>

            <div class="results-content">
              <!-- Loading Indicator -->
              <div id="loading-indicator" class="loading-indicator" style="display: none;">
                <div class="spinner"></div>
                <span>Searching...</span>
              </div>

              <!-- Results List -->
              <div id="results-list" class="results-list">
                <!-- Search results will be populated here -->
              </div>

              <!-- Pagination -->
              <div id="pagination" class="pagination" style="display: none;">
                <!-- Pagination controls will be populated here -->
              </div>

              <!-- No Results -->
              <div id="no-results" class="no-results" style="display: none;">
                <div class="no-results-content">
                  <i class="fas fa-search"></i>
                  <h3>No results found</h3>
                  <p>Try adjusting your search terms or filters</p>
                  <button id="clear-search-no-results" class="btn btn-primary">Clear Search</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async loadFacets() {
    try {
      const response = await fetch('/.netlify/functions/search/facets');
      if (response.ok) {
        const data = await response.json();
        this.availableFacets = data.facets;
        this.renderFacetFilters();
      }
    } catch (error) {
      console.error('Error loading facets:', error);
    }
  }

  async loadSavedSearches() {
    try {
      const response = await fetch('/.netlify/functions/search/saved');
      if (response.ok) {
        const data = await response.json();
        this.savedSearches = data.saved_searches || [];
        this.renderSavedSearches();
      }
    } catch (error) {
      console.error('Error loading saved searches:', error);
    }
  }

  renderFacetFilters() {
    if (!this.availableFacets) return;

    const facetFilters = document.getElementById('facet-filters');
    if (!facetFilters) return;

    let html = '';

    // Customer Types
    if (this.availableFacets.customer_types?.length > 0) {
      html += `
        <div class="filter-section">
          <h4>Customer Type:</h4>
          <div class="facet-options">
            ${this.availableFacets.customer_types.slice(0, 5).map(type => `
              <label>
                <input type="checkbox" value="${type.customer_type}" data-facet="customer_type" />
                ${this.capitalizeFirst(type.customer_type)} (${type.count})
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Lead Sources
    if (this.availableFacets.lead_sources?.length > 0) {
      html += `
        <div class="filter-section">
          <h4>Lead Source:</h4>
          <div class="facet-options">
            ${this.availableFacets.lead_sources.slice(0, 5).map(source => `
              <label>
                <input type="checkbox" value="${source.lead_source}" data-facet="lead_source" />
                ${this.capitalizeFirst(source.lead_source)} (${source.count})
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }

    // Vehicle Makes
    if (this.availableFacets.vehicle_makes?.length > 0) {
      html += `
        <div class="filter-section">
          <h4>Vehicle Make:</h4>
          <div class="facet-options">
            ${this.availableFacets.vehicle_makes.slice(0, 5).map(make => `
              <label>
                <input type="checkbox" value="${make.make}" data-facet="make" />
                ${make.make} (${make.count})
              </label>
            `).join('')}
          </div>
        </div>
      `;
    }

    facetFilters.innerHTML = html;
  }

  renderSavedSearches() {
    const container = document.getElementById('saved-searches-list');
    if (!container) return;

    if (this.savedSearches.length === 0) {
      container.innerHTML = '<p class="no-saved-searches">No saved searches yet</p>';
      return;
    }

    container.innerHTML = this.savedSearches.map(search => `
      <div class="saved-search-item" data-search-id="${search.id}">
        <div class="saved-search-info">
          <h5>${search.name}</h5>
          <p>"${search.query}"</p>
          <small>Created ${this.formatDate(search.created_at)}</small>
        </div>
        <div class="saved-search-actions">
          <button class="btn-icon load-search" title="Load Search">
            <i class="fas fa-play"></i>
          </button>
          <button class="btn-icon delete-search" title="Delete Search">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  bindEvents() {
    // Search input events
    const searchInput = document.getElementById('search-input');
    const searchButton = document.getElementById('search-button');
    const clearSearchButton = document.getElementById('clear-search');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => this.handleSearchInput(e));
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.performSearch();
      });
    }

    if (searchButton) {
      searchButton.addEventListener('click', () => this.performSearch());
    }

    if (clearSearchButton) {
      clearSearchButton.addEventListener('click', () => this.clearSearch());
    }

    // Filter events
    const filterToggle = document.getElementById('filter-toggle');
    const filtersPanel = document.getElementById('filters-panel');
    const applyFilters = document.getElementById('apply-filters');
    const clearFilters = document.getElementById('clear-filters');

    if (filterToggle && filtersPanel) {
      filterToggle.addEventListener('click', () => {
        const isVisible = filtersPanel.style.display !== 'none';
        filtersPanel.style.display = isVisible ? 'none' : 'block';
        filterToggle.innerHTML = `<i class="fas fa-filter"></i> ${isVisible ? 'Filters' : 'Hide Filters'}`;
      });
    }

    if (applyFilters) {
      applyFilters.addEventListener('click', () => this.applyFilters());
    }

    if (clearFilters) {
      clearFilters.addEventListener('click', () => this.clearFilters());
    }

    // Entity type filters
    document.querySelectorAll('.entity-type-filters input').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.searchCriteria.entity_types.push(e.target.value);
        } else {
          this.searchCriteria.entity_types = this.searchCriteria.entity_types.filter(type => type !== e.target.value);
        }
      });
    });

    // Sort options
    const sortBy = document.getElementById('sort-by');
    const sortOrder = document.getElementById('sort-order');

    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        this.searchCriteria.sort_by = e.target.value;
      });
    }

    if (sortOrder) {
      sortOrder.addEventListener('change', (e) => {
        this.searchCriteria.sort_order = e.target.value;
      });
    }

    // Results per page
    const resultsPerPage = document.getElementById('results-per-page');
    if (resultsPerPage) {
      resultsPerPage.addEventListener('change', (e) => {
        this.searchCriteria.limit = parseInt(e.target.value);
        this.searchCriteria.offset = 0;
        this.currentPage = 1;
        this.performSearch();
      });
    }

    // Saved searches events
    const savedSearchesToggle = document.getElementById('saved-searches-toggle');
    const savedSearchesPanel = document.getElementById('saved-searches-panel');
    const closeSavedSearches = document.getElementById('close-saved-searches');

    if (savedSearchesToggle && savedSearchesPanel) {
      savedSearchesToggle.addEventListener('click', () => {
        const isVisible = savedSearchesPanel.style.display !== 'none';
        savedSearchesPanel.style.display = isVisible ? 'none' : 'block';
      });
    }

    if (closeSavedSearches) {
      closeSavedSearches.addEventListener('click', () => {
        savedSearchesPanel.style.display = 'none';
      });
    }

    // Save search
    const saveSearchBtn = document.getElementById('save-search-btn');
    if (saveSearchBtn) {
      saveSearchBtn.addEventListener('click', () => this.showSaveSearchModal());
    }

    // Clear search no results
    const clearSearchNoResults = document.getElementById('clear-search-no-results');
    if (clearSearchNoResults) {
      clearSearchNoResults.addEventListener('click', () => this.clearSearch());
    }
  }

  async handleSearchInput(e) {
    const query = e.target.value.trim();
    this.searchCriteria.query = query;

    // Show/hide clear button
    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) {
      clearBtn.style.display = query ? 'inline-block' : 'none';
    }

    // Enable/disable save button
    const saveBtn = document.getElementById('save-search-btn');
    if (saveBtn) {
      saveBtn.disabled = !query;
    }

    // Show suggestions for queries longer than 2 characters
    if (query.length >= 2) {
      await this.showSearchSuggestions(query);
    } else {
      this.hideSearchSuggestions();
    }
  }

  async showSearchSuggestions(query) {
    try {
      const response = await fetch(`/.netlify/functions/search/suggestions?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        this.renderSearchSuggestions(data.suggestions);
      }
    } catch (error) {
      console.error('Error getting search suggestions:', error);
    }
  }

  renderSearchSuggestions(suggestions) {
    const container = document.getElementById('search-suggestions');
    if (!container || suggestions.length === 0) {
      this.hideSearchSuggestions();
      return;
    }

    container.innerHTML = suggestions.map(suggestion => `
      <div class="suggestion-item" data-term="${suggestion.term}">
        <i class="fas fa-${this.getEntityIcon(suggestion.entity_type)}"></i>
        <span class="suggestion-text">${suggestion.display_text}</span>
      </div>
    `).join('');

    container.style.display = 'block';

    // Bind click events
    container.querySelectorAll('.suggestion-item').forEach(item => {
      item.addEventListener('click', () => {
        const term = item.dataset.term;
        document.getElementById('search-input').value = term;
        this.searchCriteria.query = term;
        this.hideSearchSuggestions();
        this.performSearch();
      });
    });
  }

  hideSearchSuggestions() {
    const container = document.getElementById('search-suggestions');
    if (container) {
      container.style.display = 'none';
    }
  }

  getEntityIcon(entityType) {
    const icons = {
      customer: 'user',
      lead: 'user-plus',
      interaction: 'comments',
      vehicle: 'car'
    };
    return icons[entityType] || 'circle';
  }

  async performSearch() {
    if (!this.searchCriteria.query.trim()) {
      this.showNoResults('Please enter a search term');
      return;
    }

    this.setLoading(true);
    this.updateURL();

    try {
      const params = new URLSearchParams({
        q: this.searchCriteria.query,
        entities: this.searchCriteria.entity_types.join(','),
        sort_by: this.searchCriteria.sort_by,
        sort_order: this.searchCriteria.sort_order,
        limit: this.searchCriteria.limit,
        offset: this.searchCriteria.offset,
        facets: this.searchCriteria.include_facets
      });

      // Add filters to params
      Object.entries(this.searchCriteria.filters).forEach(([key, value]) => {
        if (Array.isArray(value)) {
          params.append(key, value.join(','));
        } else if (value) {
          params.append(key, value);
        }
      });

      const response = await fetch(`/.netlify/functions/search?${params}`);

      if (response.ok) {
        const data = await response.json();
        this.results = data.results || [];
        this.facets = data.facets || {};
        this.renderResults(data);
        this.renderResultFacets();
        this.addToSearchHistory(this.searchCriteria.query);
      } else {
        throw new Error('Search failed');
      }
    } catch (error) {
      console.error('Error performing search:', error);
      this.showError('Search failed. Please try again.');
    } finally {
      this.setLoading(false);
    }
  }

  renderResults(data) {
    const resultsCount = document.getElementById('results-count');
    const searchTime = document.getElementById('search-time');
    const resultsList = document.getElementById('results-list');
    const noResults = document.getElementById('no-results');
    const pagination = document.getElementById('pagination');

    if (resultsCount) {
      resultsCount.textContent = `Found ${data.total_results} results for "${data.search_criteria.query}"`;
    }

    if (searchTime) {
      searchTime.textContent = `(${data.execution_time_ms}ms)`;
    }

    if (this.results.length === 0) {
      resultsList.innerHTML = '';
      noResults.style.display = 'block';
      pagination.style.display = 'none';
      return;
    }

    noResults.style.display = 'none';
    pagination.style.display = data.pagination?.has_more ? 'block' : 'none';

    resultsList.innerHTML = this.results.map(result => this.renderResultItem(result)).join('');

    if (data.pagination?.has_more) {
      this.renderPagination(data);
    }
  }

  renderResultItem(result) {
    const iconClass = this.getEntityIcon(result.entity_type);
    const title = this.getResultTitle(result);
    const subtitle = this.getResultSubtitle(result);
    const details = this.getResultDetails(result);

    return `
      <div class="result-item ${result.entity_type}" data-entity-type="${result.entity_type}" data-id="${result.id}">
        <div class="result-icon">
          <i class="fas fa-${iconClass}"></i>
        </div>
        <div class="result-content">
          <div class="result-header">
            <h4 class="result-title">${title}</h4>
            <span class="result-entity-type">${this.capitalizeFirst(result.entity_type)}</span>
          </div>
          ${subtitle ? `<div class="result-subtitle">${subtitle}</div>` : ''}
          ${details ? `<div class="result-details">${details}</div>` : ''}
          <div class="result-meta">
            <span class="result-relevance">Relevance: ${result.relevance_score?.toFixed(1) || 'N/A'}</span>
            <span class="result-date">${this.formatDate(result.created_at)}</span>
          </div>
        </div>
        <div class="result-actions">
          <button class="btn-icon view-result" title="View Details">
            <i class="fas fa-eye"></i>
          </button>
        </div>
      </div>
    `;
  }

  getResultTitle(result) {
    switch (result.entity_type) {
      case 'customers':
        return `${result.first_name} ${result.last_name}`;
      case 'leads':
        return `${result.first_name} ${result.last_name}`;
      case 'interactions':
        return result.subject || 'Interaction';
      case 'vehicles':
        return `${result.year} ${result.make} ${result.model}`;
      case 'appointments':
        return result.title || 'Appointment';
      default:
        return 'Result';
    }
  }

  getResultSubtitle(result) {
    switch (result.entity_type) {
      case 'customers':
      case 'leads':
        return result.email;
      case 'interactions':
        return `${result.interaction_type} with ${result.customer_first_name} ${result.customer_last_name}`;
      case 'vehicles':
        return `Stock: ${result.stock_number} • $${result.list_price?.toLocaleString()}`;
      case 'appointments':
        return `Scheduled: ${this.formatDate(result.scheduled_start)}`;
      default:
        return '';
    }
  }

  getResultDetails(result) {
    switch (result.entity_type) {
      case 'customers':
        return `Type: ${result.customer_type} • ${result.interaction_count || 0} interactions`;
      case 'leads':
        return `Score: ${result.score}/100 • Source: ${result.lead_source} • Status: ${result.status}`;
      case 'interactions':
        return result.content?.substring(0, 100) + (result.content?.length > 100 ? '...' : '');
      case 'vehicles':
        return `${result.mileage?.toLocaleString()} miles • ${result.exterior_color}`;
      default:
        return '';
    }
  }

  renderResultFacets() {
    const sidebar = document.getElementById('facets-sidebar');
    if (!sidebar || !this.facets) return;

    let html = '<h4>Filter Results</h4>';

    // Entity type facets
    if (this.facets.entity_types) {
      html += `
        <div class="facet-group">
          <h5>Entity Types</h5>
          ${Object.entries(this.facets.entity_types).map(([type, count]) => `
            <label class="facet-option">
              <input type="checkbox" value="${type}" data-facet="entity_type" />
              ${this.capitalizeFirst(type)} (${count})
            </label>
          `).join('')}
        </div>
      `;
    }

    // Status facets
    if (this.facets.status) {
      html += `
        <div class="facet-group">
          <h5>Status</h5>
          ${Object.entries(this.facets.status).map(([status, count]) => `
            <label class="facet-option">
              <input type="checkbox" value="${status}" data-facet="status" />
              ${this.capitalizeFirst(status)} (${count})
            </label>
          `).join('')}
        </div>
      `;
    }

    sidebar.innerHTML = html;

    // Bind facet events
    sidebar.querySelectorAll('input[data-facet]').forEach(checkbox => {
      checkbox.addEventListener('change', () => this.applyFacetFilters());
    });
  }

  renderPagination(data) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    const totalPages = Math.ceil(data.total_results / this.searchCriteria.limit);
    const currentPage = Math.floor(data.search_criteria.offset / data.search_criteria.limit) + 1;

    let html = '<div class="pagination-controls">';

    // Previous button
    if (currentPage > 1) {
      html += `<button class="page-btn" data-page="${currentPage - 1}">Previous</button>`;
    }

    // Page numbers
    const startPage = Math.max(1, currentPage - 2);
    const endPage = Math.min(totalPages, currentPage + 2);

    for (let i = startPage; i <= endPage; i++) {
      html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    // Next button
    if (currentPage < totalPages) {
      html += `<button class="page-btn" data-page="${currentPage + 1}">Next</button>`;
    }

    html += '</div>';
    pagination.innerHTML = html;

    // Bind pagination events
    pagination.querySelectorAll('.page-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const page = parseInt(e.target.dataset.page);
        this.goToPage(page);
      });
    });
  }

  applyFilters() {
    // Collect filter values
    const filters = {};

    // Date filters
    const dateFrom = document.getElementById('date-from')?.value;
    const dateTo = document.getElementById('date-to')?.value;

    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;

    // Facet filters
    document.querySelectorAll('#facet-filters input:checked').forEach(checkbox => {
      const facetType = checkbox.dataset.facet;
      const value = checkbox.value;

      if (!filters[facetType]) filters[facetType] = [];
      filters[facetType].push(value);
    });

    this.searchCriteria.filters = filters;
    this.searchCriteria.offset = 0;
    this.currentPage = 1;

    this.updateActiveFiltersCount();
    this.performSearch();
  }

  applyFacetFilters() {
    // Similar to applyFilters but for result facets
    const filters = { ...this.searchCriteria.filters };

    document.querySelectorAll('#facets-sidebar input:checked').forEach(checkbox => {
      const facetType = checkbox.dataset.facet;
      const value = checkbox.value;

      if (!filters[facetType]) filters[facetType] = [];
      if (!filters[facetType].includes(value)) {
        filters[facetType].push(value);
      }
    });

    // Remove unchecked facets
    document.querySelectorAll('#facets-sidebar input:not(:checked)').forEach(checkbox => {
      const facetType = checkbox.dataset.facet;
      const value = checkbox.value;

      if (filters[facetType]) {
        filters[facetType] = filters[facetType].filter(v => v !== value);
        if (filters[facetType].length === 0) {
          delete filters[facetType];
        }
      }
    });

    this.searchCriteria.filters = filters;
    this.searchCriteria.offset = 0;
    this.currentPage = 1;

    this.performSearch();
  }

  clearFilters() {
    this.searchCriteria.filters = {};
    this.searchCriteria.offset = 0;
    this.currentPage = 1;

    // Reset UI
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';
    document.querySelectorAll('#facet-filters input:checked').forEach(cb => cb.checked = false);

    this.updateActiveFiltersCount();
    this.performSearch();
  }

  clearSearch() {
    this.searchCriteria.query = '';
    this.searchCriteria.offset = 0;
    this.currentPage = 1;

    document.getElementById('search-input').value = '';
    document.getElementById('clear-search').style.display = 'none';
    document.getElementById('save-search-btn').disabled = true;

    this.results = [];
    this.renderResults({ total_results: 0, results: [], search_criteria: this.searchCriteria });
  }

  updateActiveFiltersCount() {
    const activeFilters = Object.values(this.searchCriteria.filters).flat().length;
    const countElement = document.getElementById('active-filters-count');

    if (countElement) {
      countElement.textContent = activeFilters;
      countElement.style.display = activeFilters > 0 ? 'inline' : 'none';
    }
  }

  goToPage(page) {
    this.currentPage = page;
    this.searchCriteria.offset = (page - 1) * this.searchCriteria.limit;
    this.performSearch();
  }

  showSaveSearchModal() {
    const searchName = prompt('Enter a name for this search:');
    if (!searchName) return;

    this.saveSearch(searchName);
  }

  async saveSearch(name) {
    try {
      const response = await fetch('/.netlify/functions/search/saved', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name,
          query: this.searchCriteria.query,
          filters: this.searchCriteria.filters,
          entity_types: this.searchCriteria.entity_types
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.savedSearches.push(result.saved_search);
        this.renderSavedSearches();
        this.showNotification('Search saved successfully', 'success');
      } else {
        throw new Error('Failed to save search');
      }
    } catch (error) {
      console.error('Error saving search:', error);
      this.showNotification('Failed to save search', 'error');
    }
  }

  addToSearchHistory(query) {
    // Remove if already exists
    this.searchHistory = this.searchHistory.filter(q => q !== query);

    // Add to beginning
    this.searchHistory.unshift(query);

    // Keep only last 10
    this.searchHistory = this.searchHistory.slice(0, 10);
  }

  updateURL() {
    const params = new URLSearchParams();
    if (this.searchCriteria.query) params.set('q', this.searchCriteria.query);
    if (this.searchCriteria.entity_types.length > 0) params.set('entities', this.searchCriteria.entity_types.join(','));

    const newURL = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', newURL);
  }

  restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const entities = params.get('entities');

    if (query) {
      this.searchCriteria.query = query;
      document.getElementById('search-input').value = query;
    }

    if (entities) {
      this.searchCriteria.entity_types = entities.split(',');
      document.querySelectorAll('.entity-type-filters input').forEach(checkbox => {
        checkbox.checked = this.searchCriteria.entity_types.includes(checkbox.value);
      });
    }

    if (query) {
      this.performSearch();
    }
  }

  setLoading(loading) {
    this.isLoading = loading;
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = loading ? 'flex' : 'none';
    }
  }

  showNoResults(message) {
    const resultsList = document.getElementById('results-list');
    const noResults = document.getElementById('no-results');

    resultsList.innerHTML = '';
    noResults.querySelector('p').textContent = message;
    noResults.style.display = 'block';
  }

  showError(message) {
    this.showNoResults(message);
  }

  showNotification(message, type = 'info') {
    // Simple notification - in a real app, use a proper notification system
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatDate(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AdvancedSearch;
}