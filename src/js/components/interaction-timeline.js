/**
 * Interaction Timeline Component
 * Visual timeline showing customer interaction history
 */

class InteractionTimeline {
  constructor(containerId, customerId) {
    this.container = document.getElementById(containerId);
    this.customerId = customerId;
    this.interactions = [];
    this.filteredInteractions = [];
    this.filters = {
      types: [],
      dateFrom: null,
      dateTo: null,
      searchQuery: '',
      salesRepId: null
    };
    this.isLoading = false;

    this.init();
  }

  async init() {
    this.render();
    await this.loadInteractions();
    this.bindEvents();
  }

  async loadInteractions() {
    this.setLoading(true);

    try {
      const params = new URLSearchParams({
        customer_id: this.customerId,
        limit: 100,
        include_leads: true
      });

      const response = await fetch(`/.netlify/functions/interactions/timeline?${params}`);

      if (response.ok) {
        const data = await response.json();
        this.interactions = data.interactions || [];
        this.filteredInteractions = [...this.interactions];
        this.renderTimeline();
      } else {
        console.error('Failed to load interactions');
        this.showError('Failed to load interaction history');
      }
    } catch (error) {
      console.error('Error loading interactions:', error);
      this.showError('Error loading interaction history');
    } finally {
      this.setLoading(false);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="interaction-timeline">
        <div class="timeline-header">
          <h3>Interaction History</h3>
          <div class="timeline-controls">
            <div class="search-box">
              <input type="text" id="timeline-search" placeholder="Search interactions..." />
              <button id="search-btn" class="btn-icon">
                <i class="fas fa-search"></i>
              </button>
            </div>
            <button id="filter-toggle" class="btn btn-secondary">
              <i class="fas fa-filter"></i> Filters
            </button>
            <button id="add-interaction-btn" class="btn btn-primary">
              <i class="fas fa-plus"></i> Add Interaction
            </button>
          </div>
        </div>

        <div id="filters-panel" class="filters-panel" style="display: none;">
          <div class="filter-row">
            <div class="filter-group">
              <label>Interaction Types:</label>
              <div class="type-filters">
                <label><input type="checkbox" value="phone_call" /> Phone Call</label>
                <label><input type="checkbox" value="email" /> Email</label>
                <label><input type="checkbox" value="sms" /> SMS</label>
                <label><input type="checkbox" value="in_person" /> In-Person</label>
                <label><input type="checkbox" value="website_visit" /> Website Visit</label>
                <label><input type="checkbox" value="test_drive" /> Test Drive</label>
                <label><input type="checkbox" value="appointment" /> Appointment</label>
              </div>
            </div>
            <div class="filter-group">
              <label>Date Range:</label>
              <div class="date-filters">
                <input type="date" id="date-from" placeholder="From" />
                <input type="date" id="date-to" placeholder="To" />
              </div>
            </div>
          </div>
          <div class="filter-actions">
            <button id="apply-filters" class="btn btn-primary">Apply Filters</button>
            <button id="clear-filters" class="btn btn-secondary">Clear All</button>
          </div>
        </div>

        <div class="timeline-content">
          <div id="loading-indicator" class="loading-indicator" style="display: none;">
            <div class="spinner"></div>
            <span>Loading interactions...</span>
          </div>

          <div id="timeline-container" class="timeline-container">
            <!-- Timeline items will be rendered here -->
          </div>

          <div id="no-interactions" class="no-interactions" style="display: none;">
            <div class="no-data">
              <i class="fas fa-comments"></i>
              <h4>No interactions found</h4>
              <p>This customer hasn't had any recorded interactions yet.</p>
              <button id="add-first-interaction" class="btn btn-primary">
                <i class="fas fa-plus"></i> Add First Interaction
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  renderTimeline() {
    const container = document.getElementById('timeline-container');
    const noInteractions = document.getElementById('no-interactions');

    if (this.filteredInteractions.length === 0) {
      container.innerHTML = '';
      noInteractions.style.display = 'block';
      return;
    }

    noInteractions.style.display = 'none';

    // Group interactions by date
    const groupedInteractions = this.groupInteractionsByDate(this.filteredInteractions);

    container.innerHTML = Object.entries(groupedInteractions)
      .sort(([a], [b]) => new Date(b) - new Date(a))
      .map(([date, interactions]) => `
        <div class="timeline-date-group">
          <div class="timeline-date-header">
            <h4>${this.formatDateHeader(date)}</h4>
            <span class="interaction-count">${interactions.length} interaction${interactions.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="timeline-items">
            ${interactions.map(interaction => this.renderTimelineItem(interaction)).join('')}
          </div>
        </div>
      `).join('');
  }

  renderTimelineItem(interaction) {
    const iconClass = this.getInteractionIcon(interaction.interaction_type);
    const timeString = this.formatTime(interaction.created_at);
    const isOutbound = interaction.direction === 'outbound';

    return `
      <div class="timeline-item ${interaction.interaction_type} ${isOutbound ? 'outbound' : 'inbound'}"
           data-interaction-id="${interaction.id}">
        <div class="timeline-item-icon">
          <i class="${iconClass}"></i>
        </div>
        <div class="timeline-item-content">
          <div class="timeline-item-header">
            <div class="interaction-type">
              ${this.formatInteractionType(interaction.interaction_type)}
              ${isOutbound ?
                '<span class="direction-badge outbound">Outbound</span>' :
                '<span class="direction-badge inbound">Inbound</span>'
              }
            </div>
            <div class="interaction-time">${timeString}</div>
          </div>

          ${interaction.subject ? `<div class="interaction-subject">${interaction.subject}</div>` : ''}

          <div class="interaction-details">
            ${interaction.content ? `<div class="interaction-content">${this.truncateText(interaction.content, 150)}</div>` : ''}

            <div class="interaction-meta">
              ${interaction.sales_rep_name ? `
                <span class="meta-item">
                  <i class="fas fa-user"></i> ${interaction.sales_rep_name}
                </span>
              ` : ''}

              ${interaction.contact_method ? `
                <span class="meta-item">
                  <i class="fas fa-${this.getContactIcon(interaction.contact_method)}"></i>
                  ${this.formatContactMethod(interaction.contact_method)}
                </span>
              ` : ''}

              ${interaction.duration_minutes ? `
                <span class="meta-item">
                  <i class="fas fa-clock"></i> ${interaction.duration_minutes} min
                </span>
              ` : ''}

              ${interaction.outcome ? `
                <span class="meta-item outcome ${interaction.outcome}">
                  <i class="fas fa-trophy"></i> ${this.formatOutcome(interaction.outcome)}
                </span>
              ` : ''}
            </div>

            ${interaction.next_action ? `
              <div class="next-action">
                <i class="fas fa-arrow-right"></i>
                <strong>Next:</strong> ${interaction.next_action}
                ${interaction.next_action_date ? ` (${this.formatDate(interaction.next_action_date)})` : ''}
              </div>
            ` : ''}

            ${interaction.tags && interaction.tags.length > 0 ? `
              <div class="interaction-tags">
                ${interaction.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
              </div>
            ` : ''}
          </div>

          <div class="timeline-item-actions">
            <button class="btn-icon edit-interaction" data-interaction-id="${interaction.id}" title="Edit">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn-icon view-details" data-interaction-id="${interaction.id}" title="View Details">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }

  groupInteractionsByDate(interactions) {
    const groups = {};

    interactions.forEach(interaction => {
      const date = new Date(interaction.created_at).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(interaction);
    });

    return groups;
  }

  bindEvents() {
    // Search functionality
    const searchInput = document.getElementById('timeline-search');
    const searchBtn = document.getElementById('search-btn');

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.filters.searchQuery = e.target.value.toLowerCase();
        this.applyFilters();
      });
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        this.applyFilters();
      });
    }

    // Filter toggle
    const filterToggle = document.getElementById('filter-toggle');
    const filtersPanel = document.getElementById('filters-panel');

    if (filterToggle && filtersPanel) {
      filterToggle.addEventListener('click', () => {
        const isVisible = filtersPanel.style.display !== 'none';
        filtersPanel.style.display = isVisible ? 'none' : 'block';
        filterToggle.innerHTML = `<i class="fas fa-filter"></i> ${isVisible ? 'Filters' : 'Hide Filters'}`;
      });
    }

    // Apply filters
    const applyFiltersBtn = document.getElementById('apply-filters');
    if (applyFiltersBtn) {
      applyFiltersBtn.addEventListener('click', () => this.applyFilters());
    }

    // Clear filters
    const clearFiltersBtn = document.getElementById('clear-filters');
    if (clearFiltersBtn) {
      clearFiltersBtn.addEventListener('click', () => this.clearFilters());
    }

    // Add interaction buttons
    const addInteractionBtn = document.getElementById('add-interaction-btn');
    const addFirstInteractionBtn = document.getElementById('add-first-interaction');

    [addInteractionBtn, addFirstInteractionBtn].forEach(btn => {
      if (btn) {
        btn.addEventListener('click', () => this.showAddInteractionModal());
      }
    });

    // Type filter checkboxes
    document.querySelectorAll('.type-filters input[type="checkbox"]').forEach(checkbox => {
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.filters.types.push(e.target.value);
        } else {
          this.filters.types = this.filters.types.filter(type => type !== e.target.value);
        }
      });
    });

    // Date filters
    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');

    if (dateFrom) {
      dateFrom.addEventListener('change', (e) => {
        this.filters.dateFrom = e.target.value ? new Date(e.target.value) : null;
      });
    }

    if (dateTo) {
      dateTo.addEventListener('change', (e) => {
        this.filters.dateTo = e.target.value ? new Date(e.target.value) : null;
      });
    }
  }

  applyFilters() {
    this.filteredInteractions = this.interactions.filter(interaction => {
      // Search query filter
      if (this.filters.searchQuery) {
        const searchText = `${interaction.subject || ''} ${interaction.content || ''} ${interaction.summary || ''}`.toLowerCase();
        if (!searchText.includes(this.filters.searchQuery)) {
          return false;
        }
      }

      // Type filter
      if (this.filters.types.length > 0 && !this.filters.types.includes(interaction.interaction_type)) {
        return false;
      }

      // Date filters
      const interactionDate = new Date(interaction.created_at);
      if (this.filters.dateFrom && interactionDate < this.filters.dateFrom) {
        return false;
      }
      if (this.filters.dateTo && interactionDate > this.filters.dateTo) {
        return false;
      }

      return true;
    });

    this.renderTimeline();
  }

  clearFilters() {
    this.filters = {
      types: [],
      dateFrom: null,
      dateTo: null,
      searchQuery: '',
      salesRepId: null
    };

    // Reset UI
    document.getElementById('timeline-search').value = '';
    document.querySelectorAll('.type-filters input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.getElementById('date-from').value = '';
    document.getElementById('date-to').value = '';

    this.filteredInteractions = [...this.interactions];
    this.renderTimeline();
  }

  showAddInteractionModal() {
    // This would open a modal for adding new interactions
    // For now, just show an alert
    alert('Add interaction modal would open here');
  }

  setLoading(loading) {
    this.isLoading = loading;
    const loadingIndicator = document.getElementById('loading-indicator');
    if (loadingIndicator) {
      loadingIndicator.style.display = loading ? 'flex' : 'none';
    }
  }

  showError(message) {
    const container = document.getElementById('timeline-container');
    container.innerHTML = `
      <div class="error-message">
        <i class="fas fa-exclamation-triangle"></i>
        <p>${message}</p>
        <button onclick="this.parentElement.parentElement.reloadInteractions()" class="btn btn-primary">
          Try Again
        </button>
      </div>
    `;
  }

  // Utility methods
  getInteractionIcon(type) {
    const icons = {
      phone_call: 'fas fa-phone',
      email: 'fas fa-envelope',
      sms: 'fas fa-sms',
      in_person: 'fas fa-handshake',
      website_visit: 'fas fa-globe',
      form_submission: 'fas fa-clipboard-list',
      test_drive: 'fas fa-car',
      service_visit: 'fas fa-tools',
      note: 'fas fa-sticky-note',
      task: 'fas fa-tasks',
      appointment: 'fas fa-calendar-check',
      follow_up: 'fas fa-reply'
    };
    return icons[type] || 'fas fa-circle';
  }

  getContactIcon(method) {
    const icons = {
      email: 'envelope',
      phone: 'phone',
      sms: 'sms',
      in_person: 'handshake'
    };
    return icons[method] || 'circle';
  }

  formatInteractionType(type) {
    return type.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  formatContactMethod(method) {
    return method.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  formatOutcome(outcome) {
    return outcome.split('_').map(word =>
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  formatDateHeader(dateString) {
    const date = new Date(dateString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  formatTime(dateString) {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
  }

  formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  }

  truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InteractionTimeline;
}