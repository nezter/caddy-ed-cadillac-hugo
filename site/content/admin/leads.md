---
title: "Lead Management"
description: "Manage and deduplicate leads"
layout: "admin"
---

# Lead Management System

<div id="lead-management-app">
  <div class="loading">Loading lead management system...</div>
</div>

<script>
class LeadManagementApp {
  constructor() {
    this.leads = [];
    this.duplicates = [];
    this.stats = {};
    this.init();
  }

  async init() {
    await this.loadStats();
    await this.loadLeads();
    this.render();
  }

  async loadStats() {
    try {
      const response = await fetch('/.netlify/functions/lead-duplicates');
      const data = await response.json();
      this.stats = data;
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  }

  async loadLeads() {
    // This would typically load leads from an API
    // For now, we'll show the stats
  }

  render() {
    const app = document.getElementById('lead-management-app');
    app.innerHTML = `
      <div class="stats-grid">
        <div class="stat-card">
          <h3>Total Leads</h3>
          <div class="stat-number">${this.stats.totalLeads || 0}</div>
        </div>
        <div class="stat-card">
          <h3>Merged Leads</h3>
          <div class="stat-number">${this.stats.mergedLeads || 0}</div>
        </div>
        <div class="stat-card">
          <h3>Potential Duplicates</h3>
          <div class="stat-number">${this.stats.potentialDuplicates || 0}</div>
        </div>
        <div class="stat-card">
          <h3>Avg Duplicates/Lead</h3>
          <div class="stat-number">${(this.stats.averageDuplicatesPerLead || 0).toFixed(1)}</div>
        </div>
      </div>

      <div class="actions">
        <button onclick="app.checkDuplicates()" class="btn-primary">Check for Duplicates</button>
        <button onclick="app.showMergeInterface()" class="btn-secondary">Manual Merge</button>
      </div>

      <div id="duplicate-results" style="display: none;">
        <h3>Potential Duplicates</h3>
        <div id="duplicate-list"></div>
      </div>

      <div id="merge-interface" style="display: none;">
        <h3>Manual Lead Merge</h3>
        <form id="merge-form">
          <div class="form-group">
            <label>Primary Lead ID:</label>
            <input type="text" id="primary-lead-id" required>
          </div>
          <div class="form-group">
            <label>Duplicate Lead IDs (comma-separated):</label>
            <input type="text" id="duplicate-ids" required>
          </div>
          <button type="submit" class="btn-primary">Merge Leads</button>
        </form>
      </div>
    `;

    // Add form handler
    document.getElementById('merge-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.mergeLeads();
    });
  }

  async checkDuplicates() {
    const resultsDiv = document.getElementById('duplicate-results');
    const listDiv = document.getElementById('duplicate-list');

    resultsDiv.style.display = 'block';
    listDiv.innerHTML = '<div class="loading">Checking for duplicates...</div>';

    try {
      // This would call an API to get potential duplicates
      // For demo purposes, showing placeholder
      listDiv.innerHTML = '<p>Duplicate checking would be implemented here with real lead data.</p>';
    } catch (error) {
      listDiv.innerHTML = '<p>Error checking duplicates.</p>';
    }
  }

  showMergeInterface() {
    document.getElementById('merge-interface').style.display = 'block';
  }

  async mergeLeads() {
    const primaryId = document.getElementById('primary-lead-id').value;
    const duplicateIds = document.getElementById('duplicate-ids').value
      .split(',')
      .map(id => id.trim())
      .filter(id => id);

    try {
      const response = await fetch('/.netlify/functions/lead-merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primaryLeadId: primaryId,
          duplicateIds: duplicateIds
        })
      });

      const result = await response.json();

      if (result.success) {
        alert('Leads merged successfully!');
        this.init(); // Reload data
      } else {
        alert('Error merging leads: ' + result.message);
      }
    } catch (error) {
      alert('Error merging leads');
    }
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  window.app = new LeadManagementApp();
});
</script>

<style>
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 8px;
  text-align: center;
  border: 1px solid #dee2e6;
}

.stat-card h3 {
  margin: 0 0 0.5rem 0;
  color: #495057;
  font-size: 0.9rem;
}

.stat-number {
  font-size: 2rem;
  font-weight: bold;
  color: #007cba;
}

.actions {
  margin-bottom: 2rem;
}

.btn-primary, .btn-secondary {
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  margin-right: 1rem;
}

.btn-primary {
  background: #007cba;
  color: white;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: bold;
}

.form-group input {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #6c757d;
}
</style>