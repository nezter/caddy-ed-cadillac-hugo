/**
 * Lead Management System
 * Helps the salesperson manage leads, track interactions, and set reminders
 */
class LeadManagement {
  constructor(options = {}) {
    this.apiBase = options.apiBase || '/.netlify/functions';
    this.dashboardElement = document.getElementById('lead-dashboard');
    this.leadListElement = document.getElementById('leads-list');
    this.leadDetailElement = document.getElementById('lead-details');
    this.newLeadForm = document.getElementById('new-lead-form');
    this.filterForm = document.getElementById('lead-filter-form');
    this.currentUserId = options.userId || this.getUserIdFromCookie();
    
    // Lead statuses
    this.statuses = {
      NEW: 'new',
      CONTACTED: 'contacted',
      APPOINTMENT: 'appointment',
      TEST_DRIVE: 'test_drive',
      NEGOTIATION: 'negotiation',
      WON: 'won',
      LOST: 'lost'
    };
    
    // Initialize if dashboard exists
    if (this.dashboardElement) {
      this.init();
    }
  }
  
  init() {
    // Check authentication
    this.checkAuth()
      .then(user => {
        if (user) {
          this.currentUserId = user.id;
          this.setupEventListeners();
          this.loadLeads();
          this.setupNotifications();
        } else {
          this.showLoginPrompt();
        }
      })
      .catch(error => {
        console.error('Authentication error:', error);
        this.showError('Authentication failed. Please log in again.');
      });
  }
  
  async checkAuth() {
    try {
      const response = await fetch(`${this.apiBase}/auth-check`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Authentication check failed');
      }
      
      return await response.json();
    } catch (error) {
      console.error('Auth check error:', error);
      return null;
    }
  }
  
  getUserIdFromCookie() {
    // Get user ID from cookie if available
    const match = document.cookie.match(new RegExp('(^| )userId=([^;]+)'));
    return match ? match[2] : null;
  }
  
  setupEventListeners() {
    // New lead form submission
    if (this.newLeadForm) {
      this.newLeadForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleNewLead(new FormData(this.newLeadForm));
      });
    }
    
    // Lead filtering
    if (this.filterForm) {
      this.filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.loadLeads(new FormData(this.filterForm));
      });
      
      // Real-time filtering
      const filterInputs = this.filterForm.querySelectorAll('select, input[type="radio"]');
      filterInputs.forEach(input => {
        input.addEventListener('change', () => {
          this.loadLeads(new FormData(this.filterForm));
        });
      });
      
      // Search debounce
      const searchInput = this.filterForm.querySelector('input[type="search"]');
      if (searchInput) {
        searchInput.addEventListener('input', this.debounce(() => {
          this.loadLeads(new FormData(this.filterForm));
        }, 300));
      }
    }
  }
  
  debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  }
  
  async loadLeads(filterData = null) {
    if (!this.leadListElement) return;
    
    // Show loading state
    this.leadListElement.innerHTML = '<div class="loading">Loading leads...</div>';
    
    try {
      // Build URL with filters
      let url = `${this.apiBase}/leads`;
      
      if (filterData) {
        const params = new URLSearchParams();
        
        for (const [key, value] of filterData.entries()) {
          if (value) {
            params.append(key, value);
          }
        }
        
        if (params.toString()) {
          url += `?${params.toString()}`;
        }
      }
      
      const response = await fetch(url, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to load leads');
      }
      
      const data = await response.json();
      this.renderLeadsList(data.leads || []);
      
      // Update counters if available
      if (data.stats) {
        this.updateLeadStats(data.stats);
      }
      
    } catch (error) {
      console.error('Error loading leads:', error);
      this.leadListElement.innerHTML = `
        <div class="error-message">
          <p>Failed to load leads. Please try again.</p>
          <button class="retry-button">Retry</button>
        </div>
      `;
      
      this.leadListElement.querySelector('.retry-button').addEventListener('click', () => {
        this.loadLeads(filterData);
      });
    }
  }
  
  renderLeadsList(leads) {
    if (!this.leadListElement) return;
    
    if (leads.length === 0) {
      this.leadListElement.innerHTML = `
        <div class="empty-state">
          <p>No leads found matching your criteria.</p>
          <button class="btn-add-lead">Add New Lead</button>
        </div>
      `;
      
      this.leadListElement.querySelector('.btn-add-lead').addEventListener('click', () => {
        this.showNewLeadModal();
      });
      return;
    }
    
    // Create lead list
    const list = document.createElement('ul');
    list.className = 'leads-list';
    
    leads.forEach(lead => {
      const leadItem = document.createElement('li');
      leadItem.className = `lead-item ${lead.status}`;
      leadItem.dataset.leadId = lead.id;
      
      // Format date properly
      const date = new Date(lead.createdAt);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      
      // Determine priority class
      let priorityClass = 'priority-normal';
      if (lead.priority === 'high') priorityClass = 'priority-high';
      if (lead.priority === 'low') priorityClass = 'priority-low';
      
      leadItem.innerHTML = `
        <div class="lead-header">
          <span class="lead-name">${lead.firstName} ${lead.lastName}</span>
          <span class="lead-date">${formattedDate}</span>
        </div>
        <div class="lead-body">
          <div class="lead-contact">
            ${lead.phone ? `<a href="tel:${lead.phone}" class="lead-phone">${lead.phone}</a>` : ''}
            ${lead.email ? `<a href="mailto:${lead.email}" class="lead-email">${lead.email}</a>` : ''}
          </div>
          ${lead.vehicle ? `<div class="lead-vehicle">${lead.vehicle}</div>` : ''}
          <div class="lead-status ${priorityClass}">
            <span class="status-badge">${this.formatStatus(lead.status)}</span>
            ${lead.followUpDate ? `<span class="follow-up-badge">Follow-up: ${new Date(lead.followUpDate).toLocaleDateString()}</span>` : ''}
          </div>
        </div>
        <div class="lead-actions">
          <button class="btn-view-lead">View</button>
          <button class="btn-quick-note">Add Note</button>
          <div class="lead-menu">
            <button class="btn-lead-menu">⋮</button>
            <div class="lead-menu-dropdown">
              <a class="dropdown-item call-action" href="tel:${lead.phone}">Call</a>
              <a class="dropdown-item email-action" href="mailto:${lead.email}">Email</a>
              <button class="dropdown-item sms-action">Text</button>
              <button class="dropdown-item follow-action">Set Follow-Up</button>
              <button class="dropdown-item update-action">Update Status</button>
              <button class="dropdown-item delete-action">Delete</button>
            </div>
          </div>
        </div>
      `;
      
      // Add event listeners for lead interactions
      this.setupLeadItemEvents(leadItem, lead);
      
      list.appendChild(leadItem);
    });
    
    // Replace content
    this.leadListElement.innerHTML = '';
    this.leadListElement.appendChild(list);
    
    // Add button to create new lead
    const addLeadButton = document.createElement('button');
    addLeadButton.className = 'btn-add-lead';
    addLeadButton.textContent = 'Add New Lead';
    addLeadButton.addEventListener('click', () => {
      this.showNewLeadModal();
    });
    
    this.leadListElement.appendChild(addLeadButton);
  }
  
  setupLeadItemEvents(leadItem, lead) {
    // View lead details
    leadItem.querySelector('.btn-view-lead').addEventListener('click', () => {
      this.showLeadDetails(lead.id);
    });
    
    // Quick note
    leadItem.querySelector('.btn-quick-note').addEventListener('click', () => {
      this.showQuickNoteModal(lead.id);
    });
    
    // Menu toggle
    const menuButton = leadItem.querySelector('.btn-lead-menu');
    if (menuButton) {
      menuButton.addEventListener('click', (e) => {
        e.stopPropagation();
        const dropdown = leadItem.querySelector('.lead-menu-dropdown');
        dropdown.classList.toggle('show');
        
        // Close when clicking outside
        const closeMenu = (event) => {
          if (!leadItem.querySelector('.lead-menu').contains(event.target)) {
            dropdown.classList.remove('show');
            document.removeEventListener('click', closeMenu);
          }
        };
        
        if (dropdown.classList.contains('show')) {
          setTimeout(() => {
            document.addEventListener('click', closeMenu);
          }, 0);
        }
      });
    }
    
    // Menu actions
    const smsAction = leadItem.querySelector('.sms-action');
    if (smsAction && lead.phone) {
      smsAction.addEventListener('click', () => {
        this.sendSMS(lead.id, lead.phone);
      });
    }
    
    const followAction = leadItem.querySelector('.follow-action');
    if (followAction) {
      followAction.addEventListener('click', () => {
        this.showFollowUpModal(lead.id);
      });
    }
    
    const updateAction = leadItem.querySelector('.update-action');
    if (updateAction) {
      updateAction.addEventListener('click', () => {
        this.showUpdateStatusModal(lead.id, lead.status);
      });
    }
    
    const deleteAction = leadItem.querySelector('.delete-action');
    if (deleteAction) {
      deleteAction.addEventListener('click', () => {
        this.showDeleteConfirmation(lead.id);
      });
    }
  }
  
  async showLeadDetails(leadId) {
    if (!this.leadDetailElement) return;
    
    try {
      // Show loading state
      this.leadDetailElement.innerHTML = '<div class="loading">Loading lead details...</div>';
      this.leadDetailElement.classList.add('open');
      
      // Fetch lead details
      const response = await fetch(`${this.apiBase}/lead/${leadId}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to load lead details');
      }
      
      const lead = await response.json();
      this.renderLeadDetails(lead);
      
    } catch (error) {
      console.error('Error loading lead details:', error);
      this.leadDetailElement.innerHTML = `
        <div class="detail-header">
          <h2>Error</h2>
          <button class="btn-close">×</button>
        </div>
        <div class="detail-content">
          <p>Failed to load lead details. Please try again.</p>
          <button class="retry-button">Retry</button>
        </div>
      `;
      
      this.leadDetailElement.querySelector('.retry-button').addEventListener('click', () => {
        this.showLeadDetails(leadId);
      });
      
      this.leadDetailElement.querySelector('.btn-close').addEventListener('click', () => {
        this.leadDetailElement.classList.remove('open');
      });
    }
  }
  
  renderLeadDetails(lead) {
    // Format created date
    const createdDate = new Date(lead.createdAt);
    const formattedCreatedDate = `${createdDate.toLocaleDateString()} ${createdDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    
    // Format last updated date
    const updatedDate = new Date(lead.updatedAt);
    const formattedUpdatedDate = `${updatedDate.toLocaleDateString()} ${updatedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    
    let html = `
      <div class="detail-header">
        <h2>${lead.firstName} ${lead.lastName}</h2>
        <button class="btn-close">×</button>
      </div>
      
      <div class="detail-content">
        <div class="lead-info">
          <div class="lead-contact-info">
            <h3>Contact Information</h3>
            <p><strong>Phone:</strong> <a href="tel:${lead.phone}">${lead.phone}</a></p>
            <p><strong>Email:</strong> <a href="mailto:${lead.email}">${lead.email}</a></p>
            ${lead.address ? `<p><strong>Address:</strong> ${lead.address}</p>` : ''}
          </div>
          
          <div class="lead-status-info">
            <h3>Status Information</h3>
            <p><strong>Current Status:</strong> <span class="status-badge ${lead.status}">${this.formatStatus(lead.status)}</span></p>
            <p><strong>Lead Created:</strong> ${formattedCreatedDate}</p>
            <p><strong>Last Updated:</strong> ${formattedUpdatedDate}</p>
            ${lead.followUpDate ? `<p><strong>Follow-Up Date:</strong> ${new Date(lead.followUpDate).toLocaleDateString()}</p>` : ''}
          </div>
          
          ${lead.vehicle ? `
          <div class="lead-vehicle-info">
            <h3>Vehicle Interest</h3>
            <p>${lead.vehicle}</p>
            ${lead.vehicleId ? `<a href="/inventory/${lead.vehicleId}" class="view-vehicle-link" target="_blank">View Vehicle Details</a>` : ''}
          </div>
          ` : ''}
        </div>
        
        <div class="lead-actions-panel">
          <h3>Actions</h3>
          <div class="action-buttons">
            <button class="action-btn call-btn" ${!lead.phone ? 'disabled' : ''}>
              <i class="icon-phone"></i> Call
            </button>
            <button class="action-btn email-btn" ${!lead.email ? 'disabled' : ''}>
              <i class="icon-email"></i> Email
            </button>
            <button class="action-btn sms-btn" ${!lead.phone ? 'disabled' : ''}>
              <i class="icon-sms"></i> Text
            </button>
            <button class="action-btn follow-btn">
              <i class="icon-calendar"></i> Set Follow-Up
            </button>
            <button class="action-btn status-btn">
              <i class="icon-status"></i> Update Status
            </button>
            <button class="action-btn note-btn">
              <i class="icon-note"></i> Add Note
            </button>
          </div>
        </div>
        
        <div class="lead-timeline">
          <h3>Timeline</h3>
          ${this.renderLeadTimeline(lead.timeline || [])}
        </div>
        
        <div class="lead-notes">
          <h3>Notes</h3>
          ${this.renderLeadNotes(lead.notes || [])}
          
          <div class="quick-note-form">
            <textarea placeholder="Add a note..."></textarea>
            <button class="save-note-btn" data-lead-id="${lead.id}">Save Note</button>
          </div>
        </div>
      </div>
    `;
    
    this.leadDetailElement.innerHTML = html;
    
    // Set up event listeners
    const closeBtn = this.leadDetailElement.querySelector('.btn-close');
    closeBtn.addEventListener('click', () => {
      this.leadDetailElement.classList.remove('open');
    });
    
    // Call button
    const callBtn = this.leadDetailElement.querySelector('.call-btn');
    if (callBtn && lead.phone) {
      callBtn.addEventListener('click', () => {
        window.location.href = `tel:${lead.phone}`;
      });
    }
    
    // Email button
    const emailBtn = this.leadDetailElement.querySelector('.email-btn');
    if (emailBtn && lead.email) {
      emailBtn.addEventListener('click', () => {
        window.location.href = `mailto:${lead.email}`;
      });
    }
    
    // SMS button
    const smsBtn = this.leadDetailElement.querySelector('.sms-btn');
    if (smsBtn && lead.phone) {
      smsBtn.addEventListener('click', () => {
        this.sendSMS(lead.id, lead.phone);
      });
    }
    
    // Follow-up button
    const followBtn = this.leadDetailElement.querySelector('.follow-btn');
    if (followBtn) {
      followBtn.addEventListener('click', () => {
        this.showFollowUpModal(lead.id);
      });
    }
    
    // Status button
    const statusBtn = this.leadDetailElement.querySelector('.status-btn');
    if (statusBtn) {
      statusBtn.addEventListener('click', () => {
        this.showUpdateStatusModal(lead.id, lead.status);
      });
    }
    
    // Note button and quick note form
    const noteBtn = this.leadDetailElement.querySelector('.note-btn');
    if (noteBtn) {
      noteBtn.addEventListener('click', () => {
        this.leadDetailElement.querySelector('.quick-note-form textarea').focus();
      });
    }
    
    const saveNoteBtn = this.leadDetailElement.querySelector('.save-note-btn');
    if (saveNoteBtn) {
      saveNoteBtn.addEventListener('click', () => {
        const noteText = this.leadDetailElement.querySelector('.quick-note-form textarea').value.trim();
        if (noteText) {
          this.saveNote(lead.id, noteText);
        }
      });
    }
  }
  
  renderLeadTimeline(timeline) {
    if (!timeline || timeline.length === 0) {
      return '<p class="empty-timeline">No activity recorded yet.</p>';
    }
    
    let html = '<ul class="timeline-list">';
    
    // Sort timeline in reverse chronological order
    const sortedTimeline = [...timeline].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    sortedTimeline.forEach(item => {
      const date = new Date(item.timestamp);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      
      html += `
        <li class="timeline-item ${item.type}">
          <span class="timeline-icon"></span>
          <span class="timeline-date">${formattedDate}</span>
          <div class="timeline-content">
            <p>${this.formatTimelineContent(item)}</p>
          </div>
        </li>
      `;
    });
    
    html += '</ul>';
    return html;
  }
  
  formatTimelineContent(item) {
    switch (item.type) {
      case 'status_change':
        return `Status changed from <strong>${this.formatStatus(item.previousStatus)}</strong> to <strong>${this.formatStatus(item.newStatus)}</strong>`;
      case 'note_added':
        return `Note added: "${item.content}"`;
      case 'follow_up_set':
        return `Follow-up scheduled for <strong>${new Date(item.followUpDate).toLocaleDateString()}</strong>`;
      case 'email_sent':
        return `Email sent: "${item.subject}"`;
      case 'call_made':
        return `Call ${item.outcome}: ${item.duration} minutes`;
      case 'lead_created':
        return `Lead created`;
      default:
        return item.content || 'Activity recorded';
    }
  }
  
  renderLeadNotes(notes) {
    if (!notes || notes.length === 0) {
      return '<p class="empty-notes">No notes yet. Add your first note below.</p>';
    }
    
    let html = '<ul class="notes-list">';
    
    // Sort notes in reverse chronological order
    const sortedNotes = [...notes].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    sortedNotes.forEach(note => {
      const date = new Date(note.timestamp);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
      
      html += `
        <li class="note-item">
          <div class="note-header">
            <span class="note-author">${note.author || 'You'}</span>
            <span class="note-date">${formattedDate}</span>
          </div>
          <div class="note-body">
            <p>${note.content}</p>
          </div>
        </li>
      `;
    });
    
    html += '</ul>';
    return html;
  }
  
  formatStatus(status) {
    switch (status) {
      case this.statuses.NEW:
        return 'New Lead';
      case this.statuses.CONTACTED:
        return 'Contacted';
      case this.statuses.APPOINTMENT:
        return 'Appointment Set';
      case this.statuses.TEST_DRIVE:
        return 'Test Drive';
      case this.statuses.NEGOTIATION:
        return 'Negotiating';
      case this.statuses.WON:
        return 'Sale Completed';
      case this.statuses.LOST:
        return 'Lost';
      default:
        return status;
    }
  }
  
  async saveNote(leadId, content) {
    try {
      const response = await fetch(`${this.apiBase}/lead/${leadId}/notes`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ content })
      });
      
      if (!response.ok) {
        throw new Error('Failed to save note');
      }
      
      // Refresh lead details
      this.showLeadDetails(leadId);
      
      // Clear note form
      const noteTextarea = this.leadDetailElement.querySelector('.quick-note-form textarea');
      if (noteTextarea) {
        noteTextarea.value = '';
      }
      
    } catch (error) {
      console.error('Error saving note:', error);
      alert('Failed to save note. Please try again.');
    }
  }
  
  showNewLeadModal() {
    // Implementation for showing a modal to add a new lead
    const modalHtml = `
      <div class="modal-overlay"></div>
      <div class="modal-container">
        <div class="modal-header">
          <h3>Add New Lead</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="modal-new-lead-form">
            <div class="form-row">
              <div class="form-group">
                <label for="first-name">First Name*</label>
                <input type="text" id="first-name" name="firstName" required>
              </div>
              <div class="form-group">
                <label for="last-name">Last Name*</label>
                <input type="text" id="last-name" name="lastName" required>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group">
                <label for="phone">Phone*</label>
                <input type="tel" id="phone" name="phone" required>
              </div>
              <div class="form-group">
                <label for="email">Email</label>
                <input type="email" id="email" name="email">
              </div>
            </div>
            <div class="form-group">
              <label for="vehicle">Vehicle Interest</label>
              <input type="text" id="vehicle" name="vehicle">
            </div>
            <div class="form-group">
              <label for="source">Lead Source</label>
              <select id="source" name="source">
                <option value="website">Website</option>
                <option value="phone">Phone</option>
                <option value="walk-in">Walk-in</option>
                <option value="referral">Referral</option>
                <option value="auto-trader">AutoTrader</option>
                <option value="cars-com">Cars.com</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div class="form-group">
              <label for="notes">Initial Notes</label>
              <textarea id="notes" name="notes" rows="3"></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-save">Save Lead</button>
              <button type="button" class="btn-cancel">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    // Create modal element
    const modal = document.createElement('div');
    modal.className = 'modal new-lead-modal';
    modal.innerHTML = modalHtml;
    document.body.appendChild(modal);
    
    // Show modal with transition
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
    
    // Handle form submission
    const form = modal.querySelector('#modal-new-lead-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData(form);
      const leadData = Object.fromEntries(formData.entries());
      
      try {
        const response = await fetch(`${this.apiBase}/leads`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(leadData)
        });
        
        if (!response.ok) {
          throw new Error('Failed to create lead');
        }
        
        // Close modal
        this.closeModal(modal);
        
        // Refresh leads list
        this.loadLeads();
        
      } catch (error) {
        console.error('Error creating lead:', error);
        alert('Failed to create lead. Please try again.');
      }
    });
    
    // Close modal events
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.btn-cancel');
    const overlay = modal.querySelector('.modal-overlay');
    
    [closeBtn, cancelBtn, overlay].forEach(el => {
      if (el) {
        el.addEventListener('click', () => {
          this.closeModal(modal);
        });
      }
    });
  }
  
  closeModal(modal) {
    modal.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(modal);
    }, 300);
  }
  
  async sendSMS(leadId, phone) {
    const modal = document.createElement('div');
    modal.className = 'modal sms-modal';
    
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-container">
        <div class="modal-header">
          <h3>Send Text Message</h3>
          <button class="modal-close">&times;</button>
        </div>
        <div class="modal-body">
          <form id="sms-form">
            <div class="form-group">
              <label for="sms-to">To: ${phone}</label>
              <input type="hidden" id="sms-to" name="to" value="${phone}">
              <input type="hidden" name="leadId" value="${leadId}">
            </div>
            <div class="form-group">
              <label for="sms-message">Message</label>
              <textarea id="sms-message" name="message" rows="4" required></textarea>
            </div>
            <div class="form-actions">
              <button type="submit" class="btn-send">Send Message</button>
              <button type="button" class="btn-cancel">Cancel</button>
            </div>
          </form>
          
          <div class="template-messages">
            <h4>Quick Templates</h4>
            <div class="template-list">
              <button class="template-item" data-template="Hi there, this is Ed from Caddy Ed Cadillac. Thanks for your interest. Is there a good time to talk about your vehicle options?">Follow-up</button>
              <button class="template-item" data-template="Just checking in about your interest in our Cadillac models. Do you have any questions I can answer?">Check-in</button>
              <button class="template-item" data-template="Your appointment is confirmed for [DATE]. Looking forward to seeing you at Caddy Ed Cadillac!">Appointment</button>
              <button class="template-item" data-template="Great news! The vehicle you were interested in is now available. Would you like to schedule a test drive?">Vehicle Available</button>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Show modal with transition
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
    
    // Close modal events
    const closeBtn = modal.querySelector('.modal-close');
    const cancelBtn = modal.querySelector('.btn-cancel');
    const overlay = modal.querySelector('.modal-overlay');
    
    [closeBtn, cancelBtn, overlay].forEach(el => {
      if (el) {
        el.addEventListener('click', () => {
          this.closeModal(modal);
        });
      }
    });
    
    // Message templates
    const templateButtons = modal.querySelectorAll('.template-item');
    const messageTextarea = modal.querySelector('#sms-message');
    
    // Add event listeners for template buttons
    templateButtons.forEach(button => {
      button.addEventListener('click', () => {
        messageTextarea.value = button.dataset.template;
      });
    });
    
    // Handle form submission
    const form = modal.querySelector('#sms-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      try {
        const formData = new FormData(form);
        const messageData = Object.fromEntries(formData.entries());
        
        // Send the SMS via API
        const response = await fetch(`${this.apiBase}/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          credentials: 'include',
          body: JSON.stringify(messageData)
        });
        
        if (!response.ok) {
          throw new Error('Failed to send message');
        }
        
        // Close modal
        this.closeModal(modal);
        
        // Show success message
        this.showNotification('Message sent successfully');
        
            } catch (error) {
              console.error('Error sending SMS:', error);
              alert('Failed to send message. Please try again.');
            }
          });
        }
        
    }
    
    