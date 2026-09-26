/**
 * Sales Dashboard
 * Interactive dashboard for sales personnel to track leads, appointments, and sales
 */
class SalesDashboard {
  constructor() {
    this.dashboardElement = document.getElementById('sales-dashboard');
    
    // Only initialize if dashboard exists
    if (!this.dashboardElement) return;
    
    // Sales rep data
    this.salesRep = {
      id: this.dashboardElement.dataset.salesId,
      name: this.dashboardElement.dataset.salesName
    };
    
    // Dashboard sections
    this.leadsList = document.getElementById('leads-list');
    this.appointmentsList = document.getElementById('appointments-list');
    this.salesMetrics = document.getElementById('sales-metrics');
    this.filterControls = document.getElementById('dashboard-filters');
    
    // State
    this.filters = {
      timeframe: 'week',
      status: 'all',
      sort: 'date-desc'
    };
    
    // Initialize
    this.init();
  }
  
  async init() {
    // Import session manager
    const sessionManager = await import('./utils/session-manager.js');

    // Check authentication using session manager
    const isAuthenticated = await sessionManager.default.isAuthenticated();

    if (isAuthenticated) {
      this.sessionManager = sessionManager.default;
      this.currentUser = sessionManager.default.getCurrentUser();
      this.setupDashboard();
    } else {
      this.showLoginPrompt();
    }
  }
  
  // Authentication is now handled by session manager
  
  setupDashboard() {
    // Apply role-based access controls
    this.applyRoleBasedAccess();

    // Show loading state
    this.showLoading();

    // Setup filter controls
    if (this.filterControls) {
      this.initFilters();
    }
    
    // Load initial data
    Promise.all([
      this.fetchLeads(),
      this.fetchAppointments(),
      this.fetchSalesMetrics()
    ])
    .then(() => {
      this.hideLoading();
      
      // Setup refresh button
      const refreshBtn = this.dashboardElement.querySelector('.refresh-button');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          this.refreshDashboard();
        });
      }
      
      // Setup auto refresh
      this.setupAutoRefresh();
    })
    .catch(error => {
      console.error('Error setting up dashboard:', error);
      this.hideLoading();
      this.showError('Failed to load dashboard data. Please try again.');
    });
  }

  applyRoleBasedAccess() {
    const user = this.currentUser;
    const permissions = user.permissions || [];

    // Admin and manager roles have full access
    if (user.role === 'admin' || user.role === 'sales_manager') {
      return; // Full access
    }

    // Sales rep role - restrict certain features
    if (user.role === 'sales_rep') {
      // Hide admin-only elements
      const adminElements = this.dashboardElement.querySelectorAll('.admin-only, [data-role="admin"], [data-role="manager"]');
      adminElements.forEach(el => el.style.display = 'none');

      // Disable bulk operations if no permission
      if (!permissions.includes('manage_all_leads')) {
        const bulkActions = this.dashboardElement.querySelectorAll('.bulk-action');
        bulkActions.forEach(el => el.disabled = true);
      }

      // Restrict metrics access
      if (!permissions.includes('view_all_metrics')) {
        const sensitiveMetrics = this.dashboardElement.querySelectorAll('.sensitive-metric');
        sensitiveMetrics.forEach(el => el.style.display = 'none');
      }
    }

    // Viewer role - read-only access
    if (user.role === 'viewer') {
      // Disable all form inputs and action buttons
      const inputs = this.dashboardElement.querySelectorAll('input, button, select, textarea');
      inputs.forEach(el => {
        if (el.type !== 'search' && !el.classList.contains('filter-control')) {
          el.disabled = true;
        }
      });

      // Hide action buttons
      const actionButtons = this.dashboardElement.querySelectorAll('.action-btn, .edit-btn, .delete-btn');
      actionButtons.forEach(el => el.style.display = 'none');
    }
  }

  initFilters() {
    // Timeframe filter
    const timeframeSelect = this.filterControls.querySelector('#timeframe-filter');
    if (timeframeSelect) {
      timeframeSelect.addEventListener('change', () => {
        this.filters.timeframe = timeframeSelect.value;
        this.refreshDashboard();
      });
    }
    
    // Status filter
    const statusSelect = this.filterControls.querySelector('#status-filter');
    if (statusSelect) {
      statusSelect.addEventListener('change', () => {
        this.filters.status = statusSelect.value;
        this.refreshDashboard();
      });
    }
    
    // Sort filter
    const sortSelect = this.filterControls.querySelector('#sort-filter');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => {
        this.filters.sort = sortSelect.value;
        this.refreshDashboard();
      });
    }
    
    // Search functionality
    const searchInput = this.filterControls.querySelector('#search-input');
    if (searchInput) {
      searchInput.addEventListener('input', this.debounce(() => {
        this.refreshDashboard();
      }, 500));
    }
  }
  
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        timeout = null;
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }
  
  async fetchLeads() {
    const searchInput = this.filterControls?.querySelector('#search-input');
    const searchTerm = searchInput?.value || '';

    const url = new URL('/.netlify/functions/sales-leads', window.location.origin);
    url.searchParams.append('salesId', this.currentUser.id);
    url.searchParams.append('timeframe', this.filters.timeframe);
    url.searchParams.append('status', this.filters.status);
    url.searchParams.append('sort', this.filters.sort);
    if (searchTerm) {
      url.searchParams.append('search', searchTerm);
    }

    return fetch(url, {
      method: 'GET',
      headers: this.sessionManager.getAuthHeaders()
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch leads');
      }
      return response.json();
    })
    .then(data => {
      this.renderLeadsList(data.leads);
      return data;
    });
  }
  
  async fetchAppointments() {
    const url = new URL('/.netlify/functions/sales-appointments', window.location.origin);
    url.searchParams.append('salesId', this.currentUser.id);
    url.searchParams.append('timeframe', this.filters.timeframe);

    return fetch(url, {
      method: 'GET',
      headers: this.sessionManager.getAuthHeaders()
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch appointments');
      }
      return response.json();
    })
    .then(data => {
      this.renderAppointmentsList(data.appointments);
      return data;
    });
  }
  
  async fetchSalesMetrics() {
    const url = new URL('/.netlify/functions/sales-metrics', window.location.origin);
    url.searchParams.append('salesId', this.currentUser.id);
    url.searchParams.append('timeframe', this.filters.timeframe);

    return fetch(url, {
      method: 'GET',
      headers: this.sessionManager.getAuthHeaders()
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch sales metrics');
      }
      return response.json();
    })
    .then(data => {
      this.renderSalesMetrics(data);
      return data;
    });
  }
  
  renderLeadsList(leads) {
    if (!this.leadsList) return;
    
    if (leads.length === 0) {
      this.leadsList.innerHTML = `
        <div class="empty-state">
          <p>No leads found matching your criteria.</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    
    leads.forEach(lead => {
      const leadDate = new Date(lead.timestamp);
      const formattedDate = leadDate.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric' 
      });
      const formattedTime = leadDate.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });
      
      html += `
        <div class="lead-card" data-lead-id="${lead.id}">
          <div class="lead-header">
            <h3>${lead.firstName} ${lead.lastName}</h3>
            <span class="lead-date">${formattedDate} at ${formattedTime}</span>
          </div>
          <div class="lead-details">
            <div class="lead-contact">
              ${lead.phone ? `<p><strong>Phone:</strong> <a href="tel:${lead.phone}">${lead.phone}</a></p>` : ''}
              ${lead.email ? `<p><strong>Email:</strong> <a href="mailto:${lead.email}">${lead.email}</a></p>` : ''}
            </div>
            ${lead.message ? `<div class="lead-message">${lead.message}</div>` : ''}
            ${lead.interests ? `<div class="lead-interests"><strong>Interests:</strong> ${lead.interests}</div>` : ''}
            <div class="lead-source"><strong>Source:</strong> ${lead.source || 'Website'}</div>
          </div>
          <div class="lead-actions">
            <select class="status-select" data-lead-id="${lead.id}">
              <option value="new" ${lead.status === 'new' ? 'selected' : ''}>New</option>
              <option value="contacted" ${lead.status === 'contacted' ? 'selected' : ''}>Contacted</option>
              <option value="appointment" ${lead.status === 'appointment' ? 'selected' : ''}>Appointment Set</option>
              <option value="sold" ${lead.status === 'sold' ? 'selected' : ''}>Sold</option>
              <option value="lost" ${lead.status === 'lost' ? 'selected' : ''}>Lost</option>
            </select>
            <button class="add-note-btn" data-lead-id="${lead.id}">Add Note</button>
            ${lead.vehicleId ? `<a href="/inventory/${lead.vehicleId}" class="view-vehicle-btn" target="_blank">View Vehicle</a>` : ''}
          </div>
          ${lead.notes && lead.notes.length > 0 ? this.renderLeadNotes(lead.notes) : ''}
        </div>
      `;
    });
    
    this.leadsList.innerHTML = html;
    
    // Setup status change handlers
    const statusSelects = this.leadsList.querySelectorAll('.status-select');
    statusSelects.forEach(select => {
      select.addEventListener('change', () => {
        this.updateLeadStatus(select.dataset.leadId, select.value);
      });
    });
    
    // Setup add note handlers
    const addNoteButtons = this.leadsList.querySelectorAll('.add-note-btn');
    addNoteButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.showAddNoteModal(button.dataset.leadId);
      });
    });
  }
  
  renderLeadNotes(notes) {
    let html = `<div class="lead-notes">
      <h4>Notes</h4>
      <ul>`;
    
    notes.forEach(note => {
      const noteDate = new Date(note.timestamp);
      const formattedDate = noteDate.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' 
      });
      
      html += `
        <li>
          <div class="note-header">
            <span class="note-date">${formattedDate}</span>
          </div>
          <div class="note-content">${note.content}</div>
        </li>
      `;
    });
    
    html += `</ul></div>`;
    return html;
  }
  
  showAddNoteModal(leadId) {
    const modal = document.createElement('div');
    modal.className = 'modal note-modal';
    
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-container">
        <button class="modal-close">&times;</button>
        <div class="modal-content">
          <h3>Add Note</h3>
          <form id="add-note-form">
            <div class="form-group">
              <textarea id="note-content" rows="5" placeholder="Enter your note here..." required></textarea>
            </div>
            <button type="submit">Save Note</button>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add animation
    setTimeout(() => {
      modal.classList.add('show');
      modal.querySelector('#note-content').focus();
    }, 10);
    
    // Close button functionality
    const closeButton = modal.querySelector('.modal-close');
    closeButton.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 500);
    });
    
    // Close on overlay click
    const overlay = modal.querySelector('.modal-overlay');
    overlay.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 500);
    });
    
    // Form submission
    const form = modal.querySelector('#add-note-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const noteContent = modal.querySelector('#note-content').value;
      if (!noteContent) return;
      
      this.addLeadNote(leadId, noteContent)
        .then(() => {
          modal.classList.remove('show');
          setTimeout(() => {
            document.body.removeChild(modal);
          }, 500);
        })
        .catch(error => {
          console.error('Error adding note:', error);
          alert('Failed to add note. Please try again.');
        });
    });
  }
  
  async addLeadNote(leadId, content) {
    return fetch('/.netlify/functions/sales-add-note', {
      method: 'POST',
      headers: this.sessionManager.getAuthHeaders(),
      body: JSON.stringify({
        leadId: leadId,
        salesId: this.currentUser.id,
        content: content
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to add note');
      }
      return response.json();
    })
    .then(() => {
      // Refresh leads list to show new note
      return this.fetchLeads();
    });
  }
  
  async updateLeadStatus(leadId, status) {
    return fetch('/.netlify/functions/sales-update-status', {
      method: 'POST',
      headers: this.sessionManager.getAuthHeaders(),
      body: JSON.stringify({
        leadId: leadId,
        salesId: this.currentUser.id,
        status: status
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to update lead status');
      }
      return response.json();
    })
    .then(() => {
      // If status changes to appointment or sold, refresh all data
      if (status === 'appointment' || status === 'sold') {
        this.refreshDashboard();
      }
    })
    .catch(error => {
      console.error('Error updating lead status:', error);
      alert('Failed to update lead status. Please try again.');
      
      // Reset the select to previous value
      this.fetchLeads();
    });
  }
  
  renderAppointmentsList(appointments) {
    if (!this.appointmentsList) return;
    
    if (appointments.length === 0) {
      this.appointmentsList.innerHTML = `
        <div class="empty-state">
          <p>No upcoming appointments scheduled.</p>
        </div>
      `;
      return;
    }
    
    let html = '';
    
    appointments.forEach(appointment => {
      const appointmentDate = new Date(appointment.date);
      const formattedDate = appointmentDate.toLocaleDateString('en-US', { 
        weekday: 'short', month: 'short', day: 'numeric'
      });
      const formattedTime = appointmentDate.toLocaleTimeString('en-US', {
        hour: '2-digit', minute: '2-digit'
      });
      
      html += `
        <div class="appointment-card">
          <div class="appointment-header">
            <h3>${appointment.customerName}</h3>
            <span class="appointment-datetime">${formattedDate} at ${formattedTime}</span>
          </div>
          <div class="appointment-details">
            ${appointment.phone ? `<p><strong>Phone:</strong> <a href="tel:${appointment.phone}">${appointment.phone}</a></p>` : ''}
            ${appointment.email ? `<p><strong>Email:</strong> <a href="mailto:${appointment.email}">${appointment.email}</a></p>` : ''}
            ${appointment.notes ? `<div class="appointment-notes">${appointment.notes}</div>` : ''}
          </div>
          <div class="appointment-actions">
            <button class="reschedule-btn" data-appointment-id="${appointment.id}">Reschedule</button>
            <button class="complete-btn" data-appointment-id="${appointment.id}">Mark Complete</button>
          </div>
        </div>
      `;
    });
    
    this.appointmentsList.innerHTML = html;
    
    // Setup action button handlers
    const rescheduleButtons = this.appointmentsList.querySelectorAll('.reschedule-btn');
    rescheduleButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.showRescheduleModal(button.dataset.appointmentId);
      });
    });
    
    const completeButtons = this.appointmentsList.querySelectorAll('.complete-btn');
    completeButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.markAppointmentComplete(button.dataset.appointmentId);
      });
    });
  }
  
    renderSalesMetrics(data) {
      if (!this.salesMetrics) return;
      
      // Implementation for rendering sales metrics would go here
      this.salesMetrics.innerHTML = `
        <div class="metrics-container">
          <div class="metric-card">
            <h4>New Leads</h4>
            <div class="metric-value">${data.newLeads || 0}</div>
          </div>
          <div class="metric-card">
            <h4>Appointments</h4>
            <div class="metric-value">${data.appointments || 0}</div>
          </div>
          <div class="metric-card">
            <h4>Sales</h4>
            <div class="metric-value">${data.sales || 0}</div>
          </div>
          <div class="metric-card">
            <h4>Conversion Rate</h4>
            <div class="metric-value">${data.conversionRate || '0%'}</div>
          </div>
        </div>
      `;
    }
    
    refreshDashboard() {
      this.showLoading();
      
      Promise.all([
        this.fetchLeads(),
        this.fetchAppointments(),
        this.fetchSalesMetrics()
      ])
      .then(() => {
        this.hideLoading();
      })
      .catch(error => {
        console.error('Error refreshing dashboard:', error);
        this.hideLoading();
        this.showError('Failed to refresh dashboard data.');
      });
    }
    
    setupAutoRefresh() {
      // Auto refresh every 5 minutes
      setInterval(() => {
        this.refreshDashboard();
      }, 300000);
    }
    
    showLoading() {
      const loader = document.createElement('div');
      loader.className = 'dashboard-loader';
      loader.innerHTML = '<div class="spinner"></div><p>Loading...</p>';
      
      this.dashboardElement.appendChild(loader);
    }
    
    hideLoading() {
      const loader = this.dashboardElement.querySelector('.dashboard-loader');
      if (loader) {
        this.dashboardElement.removeChild(loader);
      }
    }
    
    showError(message) {
      const errorEl = document.createElement('div');
      errorEl.className = 'dashboard-error';
      errorEl.innerHTML = `<p>${message}</p>`;
      
      this.dashboardElement.appendChild(errorEl);
      
      // Auto-remove after 5 seconds
      setTimeout(() => {
        if (errorEl.parentNode) {
          errorEl.parentNode.removeChild(errorEl);
        }
      }, 5000);
    }
    
    async showLoginPrompt() {
      this.dashboardElement.innerHTML = `
        <div class="login-prompt">
          <h3>Authentication Required</h3>
          <p>Please log in to access the sales dashboard.</p>
          <form id="login-form" class="login-form">
            <div class="form-group">
              <label for="email">Email:</label>
              <input type="email" id="email" name="email" required>
            </div>
            <div class="form-group">
              <label for="password">Password:</label>
              <input type="password" id="password" name="password" required>
            </div>
            <button type="submit" class="login-button">Login</button>
            <div id="login-error" class="error-message" style="display: none;"></div>
          </form>
        </div>
      `;

      // Add form submission handler
      const loginForm = this.dashboardElement.querySelector('#login-form');
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = loginForm.email.value;
        const password = loginForm.password.value;
        const errorDiv = loginForm.querySelector('#login-error');

        try {
          errorDiv.style.display = 'none';

          // Import session manager if not already imported
          if (!this.sessionManager) {
            const sessionManager = await import('./utils/session-manager.js');
            this.sessionManager = sessionManager.default;
          }

          const result = await this.sessionManager.login(email, password);

          if (result.success) {
            this.currentUser = result.user;
            this.setupDashboard();
          }
        } catch (error) {
          errorDiv.textContent = error.message;
          errorDiv.style.display = 'block';
        }
      });
    }
    
    showRescheduleModal(appointmentId) {
      // Implementation for appointment rescheduling modal
      console.log('Reschedule appointment:', appointmentId);
      alert('Appointment rescheduling feature coming soon');
    }
    
    markAppointmentComplete(appointmentId) {
      // Implementation for marking appointment as complete
      console.log('Mark appointment complete:', appointmentId);
      
      return fetch('/.netlify/functions/sales-complete-appointment', {
        method: 'POST',
        headers: this.sessionManager.getAuthHeaders(),
        body: JSON.stringify({
          appointmentId: appointmentId,
          salesId: this.currentUser.id
        })
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Failed to update appointment');
        }
        return response.json();
      })
      .then(() => {
        this.refreshDashboard();
      })
      .catch(error => {
        console.error('Error completing appointment:', error);
        alert('Failed to update appointment status. Please try again.');
      });
    }
  }
  
  // Initialize the dashboard when the DOM is fully loaded
  document.addEventListener('DOMContentLoaded', () => {
    new SalesDashboard();
  });