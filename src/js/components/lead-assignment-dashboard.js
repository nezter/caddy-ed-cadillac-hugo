/**
 * Lead Assignment Dashboard Component
 * Provides analytics and management interface for lead assignments
 */

class LeadAssignmentDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.analytics = null;
    this.unassignedLeads = [];
    this.salesReps = [];
    this.charts = {};

    this.init();
  }

  async init() {
    await this.loadData();
    this.render();
    this.bindEvents();
  }

  async loadData() {
    try {
      // Load assignment analytics
      const analyticsResponse = await fetch('/.netlify/functions/lead-assignments/analytics');
      if (analyticsResponse.ok) {
        const analyticsData = await analyticsResponse.json();
        this.analytics = analyticsData.analytics;
      }

      // Load unassigned leads
      const unassignedResponse = await fetch('/.netlify/functions/lead-assignments/unassigned');
      if (unassignedResponse.ok) {
        const unassignedData = await unassignedResponse.json();
        this.unassignedLeads = unassignedData.leads;
      }

      // Load sales reps (assuming we have an endpoint for this)
      // For now, we'll use mock data
      this.salesReps = [
        { id: 1, name: 'John Smith', email: 'john@caddyed.com', activeLeads: 12 },
        { id: 2, name: 'Sarah Johnson', email: 'sarah@caddyed.com', activeLeads: 8 },
        { id: 3, name: 'Mike Davis', email: 'mike@caddyed.com', activeLeads: 15 }
      ];

    } catch (error) {
      console.error('Error loading assignment dashboard data:', error);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="assignment-dashboard">
        <div class="dashboard-header">
          <h2>Lead Assignment Management</h2>
          <div class="dashboard-actions">
            <button id="rebalance-btn" class="btn btn-primary">
              <i class="fas fa-balance-scale"></i> Rebalance Assignments
            </button>
            <button id="refresh-btn" class="btn btn-secondary">
              <i class="fas fa-sync"></i> Refresh
            </button>
          </div>
        </div>

        <div class="dashboard-grid">
          <!-- Assignment Analytics -->
          <div class="dashboard-card analytics-card">
            <h3>Assignment Analytics</h3>
            <div class="analytics-metrics">
              <div class="metric">
                <span class="metric-value">${this.analytics?.totalAssignments || 0}</span>
                <span class="metric-label">Total Assignments</span>
              </div>
              <div class="metric">
                <span class="metric-value">${this.analytics?.averageScore || 0}</span>
                <span class="metric-label">Avg Assignment Score</span>
              </div>
              <div class="metric">
                <span class="metric-value">${this.analytics?.reassignmentRate || 0}%</span>
                <span class="metric-label">Reassignment Rate</span>
              </div>
            </div>
            <div class="analytics-charts">
              <canvas id="assignment-reasons-chart" width="300" height="200"></canvas>
              <canvas id="workload-chart" width="300" height="200"></canvas>
            </div>
          </div>

          <!-- Sales Rep Workload -->
          <div class="dashboard-card workload-card">
            <h3>Sales Rep Workload</h3>
            <div class="workload-list">
              ${this.renderWorkloadList()}
            </div>
          </div>

          <!-- Unassigned Leads -->
          <div class="dashboard-card unassigned-card">
            <h3>Unassigned Leads (${this.unassignedLeads.length})</h3>
            <div class="unassigned-leads">
              ${this.renderUnassignedLeads()}
            </div>
          </div>

          <!-- Manual Assignment -->
          <div class="dashboard-card manual-assignment-card">
            <h3>Manual Assignment</h3>
            <form id="manual-assignment-form">
              <div class="form-group">
                <label for="lead-select">Select Lead:</label>
                <select id="lead-select" required>
                  <option value="">Choose a lead...</option>
                  ${this.unassignedLeads.map(lead =>
                    `<option value="${lead.id}">${lead.firstName} ${lead.lastName} - ${lead.email}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="rep-select">Assign to Sales Rep:</label>
                <select id="rep-select" required>
                  <option value="">Choose a sales rep...</option>
                  ${this.salesReps.map(rep =>
                    `<option value="${rep.id}">${rep.name} (${rep.activeLeads} active leads)</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group">
                <label for="reason-select">Reason:</label>
                <select id="reason-select">
                  <option value="manual_assignment">Manual Assignment</option>
                  <option value="specialist_request">Specialist Request</option>
                  <option value="territory_realignment">Territory Realignment</option>
                  <option value="workload_balance">Workload Balance</option>
                </select>
              </div>
              <button type="submit" class="btn btn-success">
                <i class="fas fa-user-check"></i> Assign Lead
              </button>
            </form>
          </div>
        </div>
      </div>
    `;

    this.renderCharts();
  }

  renderWorkloadList() {
    if (!this.analytics?.repWorkload) return '<p>No workload data available</p>';

    return this.analytics.repWorkload.map(rep => `
      <div class="workload-item">
        <div class="rep-info">
          <span class="rep-name">${rep.rep_name}</span>
          <span class="rep-capacity">${rep.lead_count}/${rep.capacity || 10} leads</span>
        </div>
        <div class="workload-bar">
          <div class="workload-fill" style="width: ${Math.min((rep.lead_count / (rep.capacity || 10)) * 100, 100)}%"></div>
        </div>
      </div>
    `).join('');
  }

  renderUnassignedLeads() {
    if (this.unassignedLeads.length === 0) {
      return '<p class="no-leads">All leads are assigned! 🎉</p>';
    }

    return this.unassignedLeads.slice(0, 10).map(lead => `
      <div class="unassigned-lead-item" data-lead-id="${lead.id}">
        <div class="lead-info">
          <div class="lead-name">${lead.firstName} ${lead.lastName}</div>
          <div class="lead-details">
            <span class="lead-email">${lead.email}</span>
            ${lead.phone ? `<span class="lead-phone">${lead.phone}</span>` : ''}
          </div>
          <div class="lead-meta">
            <span class="lead-score">Score: ${lead.score}</span>
            <span class="lead-source">${lead.source}</span>
            <span class="lead-priority priority-${lead.priority}">${lead.priority}</span>
          </div>
        </div>
        <div class="lead-actions">
          <button class="btn btn-sm btn-primary quick-assign-btn" data-lead-id="${lead.id}">
            Quick Assign
          </button>
        </div>
      </div>
    `).join('');
  }

  renderCharts() {
    // Assignment reasons chart
    if (this.analytics?.assignmentsByReason && window.Chart) {
      const ctx = document.getElementById('assignment-reasons-chart');
      if (ctx) {
        this.charts.reasons = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: this.analytics.assignmentsByReason.map(item => item.assignment_reason),
            datasets: [{
              data: this.analytics.assignmentsByReason.map(item => item.count),
              backgroundColor: ['#3498db', '#e74c3c', '#2ecc71', '#f39c12', '#9b59b6']
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: 'Assignment Reasons'
              }
            }
          }
        });
      }
    }

    // Workload distribution chart
    if (this.analytics?.repWorkload && window.Chart) {
      const ctx = document.getElementById('workload-chart');
      if (ctx) {
        this.charts.workload = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: this.analytics.repWorkload.map(rep => rep.rep_name.split(' ')[0]),
            datasets: [{
              label: 'Active Leads',
              data: this.analytics.repWorkload.map(rep => rep.lead_count),
              backgroundColor: '#3498db'
            }, {
              label: 'Capacity',
              data: this.analytics.repWorkload.map(rep => rep.capacity || 10),
              backgroundColor: '#ecf0f1'
            }]
          },
          options: {
            responsive: true,
            plugins: {
              title: {
                display: true,
                text: 'Rep Workload vs Capacity'
              }
            },
            scales: {
              y: {
                beginAtZero: true
              }
            }
          }
        });
      }
    }
  }

  bindEvents() {
    // Rebalance assignments
    const rebalanceBtn = document.getElementById('rebalance-btn');
    if (rebalanceBtn) {
      rebalanceBtn.addEventListener('click', () => this.rebalanceAssignments());
    }

    // Refresh data
    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => this.refresh());
    }

    // Manual assignment form
    const assignmentForm = document.getElementById('manual-assignment-form');
    if (assignmentForm) {
      assignmentForm.addEventListener('submit', (e) => this.handleManualAssignment(e));
    }

    // Quick assign buttons
    document.querySelectorAll('.quick-assign-btn').forEach(btn => {
      btn.addEventListener('click', (e) => this.handleQuickAssign(e));
    });
  }

  async rebalanceAssignments() {
    try {
      const response = await fetch('/.netlify/functions/lead-assignments/rebalance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        }
      });

      if (response.ok) {
        const result = await response.json();
        this.showNotification(`Successfully rebalanced ${result.results.reassigned} leads`, 'success');
        await this.refresh();
      } else {
        throw new Error('Rebalancing failed');
      }
    } catch (error) {
      console.error('Error rebalancing assignments:', error);
      this.showNotification('Failed to rebalance assignments', 'error');
    }
  }

  async handleManualAssignment(e) {
    e.preventDefault();

    const formData = new FormData(e.target);
    const leadId = formData.get('lead-select');
    const salesRepId = formData.get('rep-select');
    const reason = formData.get('reason-select');

    try {
      const response = await fetch('/.netlify/functions/lead-assignments/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          leadId,
          salesRepId,
          reason
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.showNotification(`Lead assigned successfully to ${result.assignedTo.name}`, 'success');
        e.target.reset();
        await this.refresh();
      } else {
        const error = await response.json();
        throw new Error(error.message || 'Assignment failed');
      }
    } catch (error) {
      console.error('Error assigning lead:', error);
      this.showNotification(error.message || 'Failed to assign lead', 'error');
    }
  }

  async handleQuickAssign(e) {
    const leadId = e.target.dataset.leadId;

    // Auto-assign to the rep with lowest workload
    const lowestWorkloadRep = this.salesReps.reduce((min, rep) =>
      rep.activeLeads < min.activeLeads ? rep : min
    );

    try {
      const response = await fetch('/.netlify/functions/lead-assignments/assign', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.getAuthToken()}`
        },
        body: JSON.stringify({
          leadId,
          salesRepId: lowestWorkloadRep.id,
          reason: 'quick_assignment'
        })
      });

      if (response.ok) {
        const result = await response.json();
        this.showNotification(`Lead quickly assigned to ${result.assignedTo.name}`, 'success');
        await this.refresh();
      } else {
        throw new Error('Quick assignment failed');
      }
    } catch (error) {
      console.error('Error with quick assignment:', error);
      this.showNotification('Failed to assign lead', 'error');
    }
  }

  async refresh() {
    await this.loadData();
    this.render();
    this.bindEvents();
  }

  getAuthToken() {
    // In a real implementation, get the auth token from session/localStorage
    return localStorage.getItem('authToken') || 'demo-token';
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LeadAssignmentDashboard;
}