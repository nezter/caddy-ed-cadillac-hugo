/**
 * Customer Relationship Management
 * Helps sales professionals manage customer interactions and follow-ups
 */
class CustomerRelationship {
  constructor() {
    this.crmElement = document.getElementById('customer-relationship');
    
    // Only initialize if CRM exists
    if (!this.crmElement) return;
    
    // Sales rep data
    this.salesRep = {
      id: this.crmElement.dataset.salesId,
      name: this.crmElement.dataset.salesName
    };
    
    // CRM sections
    this.customerList = document.getElementById('customer-list');
    this.followupList = document.getElementById('followup-list');
    this.activityLog = document.getElementById('activity-log');
    this.searchInput = document.getElementById('customer-search');
    this.filterSelect = document.getElementById('customer-filter');
    
    // Initialize
    this.init();
  }
  
  init() {
    this.checkAuth()
      .then(isAuthenticated => {
        if (isAuthenticated) {
          this.setupCRM();
        } else {
          this.showLoginPrompt();
        }
      })
      .catch(error => {
        console.error('Authentication check failed:', error);
        this.showError('Authentication error. Please refresh or contact support.');
      });
  }
  
  checkAuth() {
    return fetch('/api/sales/auth-check', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Authentication check failed');
      }
      return response.json();
    })
    .then(data => {
      return data.authenticated;
    });
  }
  
  setupCRM() {
    // Show loading state
    this.showLoading();
    
    // Setup search functionality
    if (this.searchInput) {
      this.searchInput.addEventListener('input', this.debounce(() => {
        this.fetchCustomers();
      }, 300));
    }
    
    // Setup filter functionality
    if (this.filterSelect) {
      this.filterSelect.addEventListener('change', () => {
        this.fetchCustomers();
      });
    }
    
    // Load initial data
    Promise.all([
      this.fetchCustomers(),
      this.fetchFollowups(),
      this.fetchActivity()
    ])
    .then(() => {
      this.hideLoading();
      
      // Setup new customer button
      const newCustomerBtn = this.crmElement.querySelector('.new-customer-btn');
      if (newCustomerBtn) {
        newCustomerBtn.addEventListener('click', () => {
          this.showCustomerModal();
        });
      }
      
      // Setup refresh button
      const refreshBtn = this.crmElement.querySelector('.refresh-button');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          this.refreshCRM();
        });
      }
    })
    .catch(error => {
      console.error('Error setting up CRM:', error);
      this.hideLoading();
      this.showError('Failed to load CRM data. Please try again.');
    });
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
  
  fetchCustomers() {
    const searchTerm = this.searchInput?.value || '';
    const filter = this.filterSelect?.value || 'all';
    
    const url = new URL('/api/sales/customers', window.location.origin);
    url.searchParams.append('salesId', this.salesRep.id);
    url.searchParams.append('search', searchTerm);
    url.searchParams.append('filter', filter);
    
    return fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch customers');
      }
      return response.json();
    })
    .then(data => {
      this.renderCustomerList(data.customers);
      return data;
    });
  }
  
  fetchFollowups() {
    const url = new URL('/api/sales/followups', window.location.origin);
    url.searchParams.append('salesId', this.salesRep.id);
    
    return fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch followups');
      }
      return response.json();
    })
    .then(data => {
      this.renderFollowupList(data.followups);
      return data;
    });
  }
  
  fetchActivity() {
    const url = new URL('/api/sales/activity', window.location.origin);
    url.searchParams.append('salesId', this.salesRep.id);
    
    return fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch activity');
      }
      return response.json();
    })
    .then(data => {
      this.renderActivityLog(data.activities);
      return data;
    });
  }
  
  renderCustomerList(customers) {
    if (!this.customerList) return;
    
    if (customers.length === 0) {
      this.customerList.innerHTML = `
        <div class="empty-state">
          <p>No customers found matching your criteria.</p>
          <button class="new-customer-btn">Add New Customer</button>
        </div>
      `;
      
      // Setup new customer button
      const newCustomerBtn = this.customerList.querySelector('.new-customer-btn');
      if (newCustomerBtn) {
        newCustomerBtn.addEventListener('click', () => {
          this.showCustomerModal();
        });
      }
      
      return;
    }
    
    let html = '';
    
    customers.forEach(customer => {
      const lastContactDate = customer.lastContact ? new Date(customer.lastContact) : null;
      const formattedDate = lastContactDate ? lastContactDate.toLocaleDateString('en-US', { 
        month: 'short', day: 'numeric', year: 'numeric' 
      }) : 'Never';
      
      html += `
        <div class="customer-card" data-customer-id="${customer.id}">
          <div class="customer-header">
            <h3>${customer.firstName} ${customer.lastName}</h3>
            <span class="customer-type">${customer.type || 'Lead'}</span>
          </div>
          <div class="customer-details">
            <div class="customer-contact">
              ${customer.phone ? `<p><strong>Phone:</strong> <a href="tel:${customer.phone}">${customer.phone}</a></p>` : ''}
              ${customer.email ? `<p><strong>Email:</strong> <a href="mailto:${customer.email}">${customer.email}</a></p>` : ''}
            </div>
            <div class="customer-info">
              <p><strong>Last Contact:</strong> ${formattedDate}</p>
              ${customer.interests ? `<p><strong>Interests:</strong> ${customer.interests}</p>` : ''}
              ${customer.status ? `<p><strong>Status:</strong> <span class="status-${customer.status.toLowerCase()}">${customer.status}</span></p>` : ''}
            </div>
          </div>
          <div class="customer-actions">
            <button class="add-interaction-btn" data-customer-id="${customer.id}">Add Interaction</button>
            <button class="add-followup-btn" data-customer-id="${customer.id}">Schedule Follow-up</button>
            <button class="view-details-btn" data-customer-id="${customer.id}">View Details</button>
          </div>
        </div>
      `;
    });
    
    this.customerList.innerHTML = html;
    
    // Setup interaction buttons
    const interactionButtons = this.customerList.querySelectorAll('.add-interaction-btn');
    interactionButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.showInteractionModal(button.dataset.customerId);
      });
    });
    
    // Setup followup buttons
    const followupButtons = this.customerList.querySelectorAll('.add-followup-btn');
    followupButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.showFollowupModal(button.dataset.customerId);
      });
    });
    
    // Setup view details buttons
    const detailsButtons = this.customerList.querySelectorAll('.view-details-btn');
    detailsButtons.forEach(button => {
      button.addEventListener('click', () => {
        this.showCustomerDetails(button.dataset.customerId);
      });
    });
  }
  
  renderFollowupList(followups) {
    if (!this.followupList) return;
    
    if (followups.length === 0) {
      this.followupList.innerHTML = `
        <div class="empty-state">
          <p>No follow-ups scheduled.</p>
        </div>
      `;
      return;
    }
    
    // Sort followups by date
    followups.sort((a, b) => new Date(a.date) - new Date(b.date));
    
    let html = '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Group followups by timeframe
    const overdue = followups.filter(f => new Date(f.date) < today);
    const todayFollowups = followups.filter(f => {
      const followupDate = new Date(f.date);
      return followupDate.toDateString() === today.toDateString();
    });
    const upcoming = followups.filter(f => new Date