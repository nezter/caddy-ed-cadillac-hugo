/**
 * Customer Portal JavaScript
 * Handles customer login, dashboard, and interactions
 */

class CustomerPortal {
  constructor() {
    this.customerData = null;
    this.init();
  }

  init() {
    this.bindEvents();
    this.checkExistingSession();
  }

  bindEvents() {
    // Login form
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => this.handleLogin(e));
    }

    // Logout button
    const logoutButton = document.getElementById('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', () => this.handleLogout());
    }

    // Appointment scheduling
    const scheduleButton = document.getElementById('scheduleAppointment');
    if (scheduleButton) {
      scheduleButton.addEventListener('click', () => this.showAppointmentModal());
    }

    // Appointment modal
    const closeAppointmentModal = document.getElementById('closeAppointmentModal');
    if (closeAppointmentModal) {
      closeAppointmentModal.addEventListener('click', () => this.hideAppointmentModal());
    }

    const appointmentForm = document.getElementById('appointmentForm');
    if (appointmentForm) {
      appointmentForm.addEventListener('submit', (e) => this.handleAppointmentSubmit(e));
    }

    // Message modal
    const contactButton = document.getElementById('contactSalesRep');
    if (contactButton) {
      contactButton.addEventListener('click', () => this.showMessageModal());
    }

    const closeMessageModal = document.getElementById('closeMessageModal');
    if (closeMessageModal) {
      closeMessageModal.addEventListener('click', () => this.hideMessageModal());
    }

    const messageForm = document.getElementById('messageForm');
    if (messageForm) {
      messageForm.addEventListener('submit', (e) => this.handleMessageSubmit(e));
    }

    // Update preferences
    const updatePreferencesButton = document.getElementById('updatePreferences');
    if (updatePreferencesButton) {
      updatePreferencesButton.addEventListener('click', () => this.showPreferencesModal());
    }
  }

  checkExistingSession() {
    const sessionData = localStorage.getItem('customerSession');
    if (sessionData) {
      try {
        this.customerData = JSON.parse(sessionData);
        this.showDashboard();
        this.loadCustomerData();
      } catch (error) {
        console.error('Invalid session data:', error);
        localStorage.removeItem('customerSession');
      }
    }
  }

  async handleLogin(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const loginData = {
      email: formData.get('email'),
      phone: formData.get('phone')
    };

    this.showLoading('loginButton');

    try {
      // In a real implementation, this would call the customer authentication API
      // For now, we'll simulate finding a customer
      const customer = await this.authenticateCustomer(loginData);

      if (customer) {
        this.customerData = customer;
        localStorage.setItem('customerSession', JSON.stringify(customer));
        this.showDashboard();
        this.loadCustomerData();
        this.showNotification('Login successful!', 'success');
      } else {
        this.showNotification('Customer not found. Please contact us to get started.', 'error');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showNotification('Login failed. Please try again.', 'error');
    } finally {
      this.hideLoading('loginButton');
    }
  }

  async authenticateCustomer(loginData) {
    try {
      const response = await fetch('/.netlify/functions/customer-auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(loginData)
      });

      const result = await response.json();

      if (result.success) {
        return {
          ...result.data.customer,
          token: result.data.token,
          sales_rep: {
            name: 'Sarah Johnson', // This would come from the API in a real implementation
            email: 'sarah.johnson@cadillacofsouthcharlotte.com',
            phone: '(704) 555-0102'
          },
          preferences: {
            vehicle_type: 'SUV',
            budget_min: 40000,
            budget_max: 60000
          }
        };
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      throw error;
    }
  }
          });
        } else {
          resolve(null);
        }
      }, 1000);
    });
  }

  handleLogout() {
    this.customerData = null;
    localStorage.removeItem('customerSession');
    this.hideDashboard();
    this.showNotification('Logged out successfully', 'success');
  }

  showDashboard() {
    const loginForm = document.getElementById('customerLoginForm');
    const dashboard = document.getElementById('customerDashboard');

    if (loginForm) loginForm.style.display = 'none';
    if (dashboard) dashboard.style.display = 'block';
  }

  hideDashboard() {
    const loginForm = document.getElementById('customerLoginForm');
    const dashboard = document.getElementById('customerDashboard');

    if (loginForm) loginForm.style.display = 'block';
    if (dashboard) dashboard.style.display = 'none';
  }

  async loadCustomerData() {
    if (!this.customerData) return;

    // Update customer info
    const customerName = document.getElementById('customerName');
    const customerEmail = document.getElementById('customerEmail');

    if (customerName) {
      customerName.textContent = `Welcome back, ${this.customerData.first_name}!`;
    }
    if (customerEmail) {
      customerEmail.textContent = this.customerData.email;
    }

    // Load appointments
    await this.loadAppointments();

    // Load preferences
    await this.loadPreferences();

    // Load recent activity
    await this.loadRecentActivity();

    // Load sales rep info
    await this.loadSalesRepInfo();
  }

  async loadAppointments() {
    const appointmentsList = document.getElementById('appointmentsList');
    if (!appointmentsList) return;

    appointmentsList.innerHTML = '<div class="loading">Loading appointments...</div>';

    try {
      const response = await fetch('/.netlify/functions/customer-dashboard/appointments', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.customerData.token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        const appointments = result.data.upcoming || [];

        if (appointments.length > 0) {
          appointmentsList.innerHTML = appointments.map(appt => `
            <div class="appointment-item">
              <div class="appointment-header">
                <h4>${appt.type}</h4>
                <span class="appointment-status status-${appt.status}">${appt.status}</span>
              </div>
              <div class="appointment-details">
                <p><strong>Date:</strong> ${new Date(appt.scheduled_date + ' ' + appt.scheduled_time).toLocaleString()}</p>
                <p><strong>Location:</strong> ${appt.location}</p>
                ${appt.notes ? `<p><strong>Notes:</strong> ${appt.notes}</p>` : ''}
                ${appt.sales_rep_name ? `<p><strong>Sales Rep:</strong> ${appt.sales_rep_name}</p>` : ''}
              </div>
            </div>
          `).join('');
        } else {
          appointmentsList.innerHTML = '<p>No upcoming appointments.</p>';
        }
      } else {
        throw new Error(result.error || 'Failed to load appointments');
      }
    } catch (error) {
      console.error('Error loading appointments:', error);
      appointmentsList.innerHTML = '<p class="error">Failed to load appointments. Please try again.</p>';
    }
  }

  async loadPreferences() {
    const preferencesDiv = document.getElementById('vehiclePreferences');
    if (!preferencesDiv) return;

    preferencesDiv.innerHTML = '<div class="loading">Loading preferences...</div>';

    try {
      const response = await fetch('/.netlify/functions/customer-dashboard/preferences', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.customerData.token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        const preferences = result.data;
        preferencesDiv.innerHTML = `
          <div class="preference-item">
            <p><strong>Preferred Vehicle Type:</strong> ${preferences.vehicle_type || 'Not specified'}</p>
            <p><strong>Budget Range:</strong> $${(preferences.budget_min || 0).toLocaleString()} - $${(preferences.budget_max || 0).toLocaleString()}</p>
            <p><strong>Preferred Contact:</strong> ${preferences.preferred_contact_method || 'Not specified'}</p>
            ${preferences.preferred_features ? `<p><strong>Preferred Features:</strong> ${preferences.preferred_features.join(', ')}</p>` : ''}
          </div>
        `;
      } else {
        throw new Error(result.error || 'Failed to load preferences');
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
      preferencesDiv.innerHTML = '<p class="error">Failed to load preferences. Please try again.</p>';
    }
  }

  async loadRecentActivity() {
    const activityDiv = document.getElementById('recentActivity');
    if (!activityDiv) return;

    activityDiv.innerHTML = '<div class="loading">Loading activity...</div>';

    try {
      const response = await fetch('/.netlify/functions/customer-dashboard/activity', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.customerData.token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        const activities = result.data || [];

        if (activities.length > 0) {
          activityDiv.innerHTML = activities.map(activity => `
            <div class="activity-item">
              <div class="activity-date">${new Date(activity.date).toLocaleDateString()}</div>
              <div class="activity-content">
                <strong>${this.formatActivityType(activity.type)}</strong>
                <p>${activity.description}</p>
                ${activity.details ? `<small>${activity.details}</small>` : ''}
              </div>
            </div>
          `).join('');
        } else {
          activityDiv.innerHTML = '<p>No recent activity.</p>';
        }
      } else {
        throw new Error(result.error || 'Failed to load activity');
      }
    } catch (error) {
      console.error('Error loading activity:', error);
      activityDiv.innerHTML = '<p class="error">Failed to load activity. Please try again.</p>';
    }
  }

  async loadSalesRepInfo() {
    const salesRepDiv = document.getElementById('salesRepInfo');
    if (!salesRepDiv) return;

    salesRepDiv.innerHTML = '<div class="loading">Loading sales rep information...</div>';

    try {
      const response = await fetch('/.netlify/functions/customer-dashboard/sales-rep', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.customerData.token}`
        }
      });

      const result = await response.json();

      if (result.success) {
        const salesRep = result.data;
        salesRepDiv.innerHTML = `
          <div class="sales-rep-card">
            <h4>${salesRep.name}</h4>
            <p><strong>Title:</strong> ${salesRep.title || 'Sales Representative'}</p>
            <p><strong>Email:</strong> <a href="mailto:${salesRep.email}">${salesRep.email}</a></p>
            <p><strong>Phone:</strong> <a href="tel:${salesRep.phone}">${salesRep.phone}</a></p>
          </div>
        `;
      } else {
        throw new Error(result.error || 'Failed to load sales rep info');
      }
    } catch (error) {
      console.error('Error loading sales rep info:', error);
      salesRepDiv.innerHTML = '<p class="error">Failed to load sales representative information.</p>';
    }
  }

  formatActivityType(type) {
    const typeMap = {
      'lead_created': 'Lead Created',
      'appointment_scheduled': 'Appointment Scheduled',
      'appointment_completed': 'Appointment Completed',
      'email_sent': 'Email Sent',
      'call_made': 'Phone Call',
      'note_added': 'Note Added',
      'status_updated': 'Status Updated'
    };
    return typeMap[type] || type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }

  showAppointmentModal() {
    const modal = document.getElementById('appointmentModal');
    if (modal) {
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
  }

  hideAppointmentModal() {
    const modal = document.getElementById('appointmentModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  }

  async handleAppointmentSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const appointmentData = {
      type: formData.get('type'),
      scheduled_date: formData.get('date'),
      scheduled_time: formData.get('time'),
      notes: formData.get('notes'),
      customer_id: this.customerData.id,
      customer_name: `${this.customerData.first_name} ${this.customerData.last_name}`,
      customer_email: this.customerData.email,
      customer_phone: this.customerData.phone
    };

    try {
      const response = await fetch('/.netlify/functions/schedule-appointment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.customerData.token}`
        },
        body: JSON.stringify(appointmentData)
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('Appointment scheduled successfully!', 'success');
        this.hideAppointmentModal();
        event.target.reset();

        // Reload appointments
        await this.loadAppointments();
      } else {
        throw new Error(result.error || 'Failed to schedule appointment');
      }
    } catch (error) {
      console.error('Appointment scheduling error:', error);
      this.showNotification('Failed to schedule appointment. Please try again.', 'error');
    }
  }

  showMessageModal() {
    const modal = document.getElementById('messageModal');
    if (modal) {
      modal.style.display = 'block';
      document.body.style.overflow = 'hidden';
    }
  }

  hideMessageModal() {
    const modal = document.getElementById('messageModal');
    if (modal) {
      modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
  }

  async handleMessageSubmit(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const messageData = {
      type: 'customer_message',
      recipient: this.customerData.sales_rep.email,
      subject: formData.get('subject'),
      content: formData.get('content'),
      metadata: {
        message: {
          customer_name: `${this.customerData.first_name} ${this.customerData.last_name}`,
          customer_email: this.customerData.email,
          subject: formData.get('subject'),
          content: formData.get('content')
        },
        customer_id: this.customerData.id
      }
    };

    try {
      const response = await fetch('/.netlify/functions/send-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
      });

      const result = await response.json();

      if (result.success) {
        this.showNotification('Message sent successfully!', 'success');
        this.hideMessageModal();
        event.target.reset();
      } else {
        throw new Error(result.error || 'Failed to send message');
      }
    } catch (error) {
      console.error('Message sending error:', error);
      this.showNotification('Failed to send message. Please try again.', 'error');
    }
  }

  showPreferencesModal() {
    // For now, just show a notification
    this.showNotification('Preferences update feature coming soon!', 'info');
  }

  showLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      const buttonText = button.querySelector('.button-text');
      const spinner = button.querySelector('.loading-spinner');

      if (buttonText) buttonText.style.display = 'none';
      if (spinner) spinner.style.display = 'inline-block';
      button.disabled = true;
    }
  }

  hideLoading(buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      const buttonText = button.querySelector('.button-text');
      const spinner = button.querySelector('.loading-spinner');

      if (buttonText) buttonText.style.display = 'inline-block';
      if (spinner) spinner.style.display = 'none';
      button.disabled = false;
    }
  }

  showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
      <div class="notification-content">
        <span class="notification-message">${message}</span>
        <button class="notification-close">&times;</button>
      </div>
    `;

    // Add to page
    document.body.appendChild(notification);

    // Show notification
    setTimeout(() => notification.classList.add('show'), 100);

    // Auto hide after 5 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 5000);

    // Close button
    const closeButton = notification.querySelector('.notification-close');
    closeButton.addEventListener('click', () => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    });
  }
}

// Initialize customer portal when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new CustomerPortal();
});