---
title: "Sales Dashboard"
description: "Sales performance dashboard for sales representatives"
layout: "admin"
---

# Sales Dashboard

<div id="sales-dashboard" data-sales-id="{{ .Params.sales_id | default "current-user" }}" data-sales-name="{{ .Params.sales_name | default "Sales Rep" }}">
  <div class="dashboard-loading">
    <div class="spinner"></div>
    <p>Loading your sales dashboard...</p>
  </div>
</div>

<script src="/js/salesDashboard.js"></script>

<style>
/* Dashboard Loading State */
.dashboard-loading {
  text-align: center;
  padding: 3rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 2rem 0;
}

.dashboard-loading .spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007cba;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Dashboard Container */
#sales-dashboard {
  min-height: 600px;
}

/* Dashboard Sections */
.dashboard-section {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  margin-bottom: 2rem;
  overflow: hidden;
}

.dashboard-section h2 {
  background: #007cba;
  color: white;
  margin: 0;
  padding: 1rem 1.5rem;
  font-size: 1.2rem;
}

.dashboard-section .section-content {
  padding: 1.5rem;
}

/* Filters */
#dashboard-filters {
  background: #f8f9fa;
  padding: 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

#dashboard-filters label {
  font-weight: bold;
  margin-right: 0.5rem;
}

#dashboard-filters select,
#dashboard-filters input {
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
}

#dashboard-filters .filter-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Leads List */
#leads-list {
  display: grid;
  gap: 1rem;
}

.lead-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1rem;
  background: white;
  transition: box-shadow 0.2s;
}

.lead-card:hover {
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.lead-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.lead-header h3 {
  margin: 0;
  color: #007cba;
}

.lead-date {
  color: #6c757d;
  font-size: 0.9rem;
}

.lead-details {
  margin-bottom: 1rem;
}

.lead-contact p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.lead-message {
  background: #f8f9fa;
  padding: 0.75rem;
  border-radius: 4px;
  margin: 0.5rem 0;
  font-style: italic;
}

.lead-interests,
.lead-source {
  color: #495057;
  font-size: 0.9rem;
}

.lead-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  flex-wrap: wrap;
}

.status-select {
  padding: 0.25rem 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  background: white;
}

.add-note-btn,
.view-vehicle-btn {
  padding: 0.25rem 0.75rem;
  background: #007cba;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-decoration: none;
  font-size: 0.8rem;
  transition: background-color 0.2s;
}

.add-note-btn:hover,
.view-vehicle-btn:hover {
  background: #005a87;
}

/* Lead Notes */
.lead-notes {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #dee2e6;
}

.lead-notes h4 {
  margin: 0 0 0.5rem 0;
  color: #495057;
  font-size: 1rem;
}

.note-item {
  background: #f8f9fa;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

.note-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.25rem;
  font-size: 0.8rem;
  color: #6c757d;
}

.note-content {
  font-size: 0.9rem;
}

/* Appointments List */
#appointments-list {
  display: grid;
  gap: 1rem;
}

.appointment-card {
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1rem;
  background: white;
  transition: box-shadow 0.2s;
}

.appointment-card:hover {
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.appointment-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1rem;
}

.appointment-header h3 {
  margin: 0;
  color: #007cba;
}

.appointment-datetime {
  color: #6c757d;
  font-size: 0.9rem;
}

.appointment-details p {
  margin: 0.25rem 0;
  font-size: 0.9rem;
}

.appointment-notes {
  background: #f8f9fa;
  padding: 0.75rem;
  border-radius: 4px;
  margin: 0.5rem 0;
  font-style: italic;
}

.appointment-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.reschedule-btn,
.complete-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: background-color 0.2s;
}

.reschedule-btn {
  background: #ffc107;
  color: #212529;
}

.reschedule-btn:hover {
  background: #e0a800;
}

.complete-btn {
  background: #28a745;
  color: white;
}

.complete-btn:hover {
  background: #218838;
}

/* Sales Metrics */
#sales-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.metric-card {
  background: white;
  border: 1px solid #dee2e6;
  border-radius: 8px;
  padding: 1.5rem;
  text-align: center;
  transition: box-shadow 0.2s;
}

.metric-card:hover {
  box-shadow: 0 4px 8px rgba(0,0,0,0.1);
}

.metric-card h4 {
  margin: 0 0 0.5rem 0;
  color: #495057;
  font-size: 1rem;
}

.metric-value {
  font-size: 2rem;
  font-weight: bold;
  color: #007cba;
}

/* Empty States */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: #6c757d;
}

.empty-state p {
  margin: 0;
  font-size: 1.1rem;
}

/* Modal Styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1000;
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.3s, visibility 0.3s;
}

.modal.show {
  opacity: 1;
  visibility: visible;
}

.modal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0,0,0,0.5);
}

.modal-container {
  position: relative;
  max-width: 500px;
  margin: 2rem auto;
  background: white;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.3);
  transform: translateY(-50px);
  transition: transform 0.3s;
}

.modal.show .modal-container {
  transform: translateY(0);
}

.modal-close {
  position: absolute;
  top: 1rem;
  right: 1rem;
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6c757d;
  z-index: 1001;
}

.modal-content {
  padding: 2rem;
}

.modal-content h3 {
  margin-top: 0;
  color: #007cba;
}

.modal-content textarea {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  resize: vertical;
  font-family: inherit;
}

.modal-content button[type="submit"] {
  background: #007cba;
  color: white;
  border: none;
  padding: 0.75rem 1.5rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
  margin-top: 1rem;
  transition: background-color 0.2s;
}

.modal-content button[type="submit"]:hover {
  background: #005a87;
}

/* Error and Success Messages */
.dashboard-error,
.dashboard-success {
  padding: 1rem;
  border-radius: 4px;
  margin: 1rem 0;
}

.dashboard-error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

.dashboard-success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

/* Loading States */
.dashboard-loader {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(255,255,255,0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.dashboard-loader .spinner {
  border: 4px solid #f3f3f3;
  border-top: 4px solid #007cba;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

/* Login Prompt */
.login-prompt {
  text-align: center;
  padding: 3rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 2rem 0;
}

.login-prompt h3 {
  color: #007cba;
  margin-bottom: 1rem;
}

.login-prompt p {
  margin-bottom: 1.5rem;
  color: #6c757d;
}

.login-button {
  display: inline-block;
  padding: 0.75rem 1.5rem;
  background: #007cba;
  color: white;
  text-decoration: none;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.login-button:hover {
  background: #005a87;
}

/* Responsive Design */
@media (max-width: 768px) {
  #dashboard-filters {
    flex-direction: column;
    align-items: stretch;
  }

  #dashboard-filters .filter-group {
    flex-direction: column;
    align-items: stretch;
  }

  .lead-actions,
  .appointment-actions {
    flex-direction: column;
  }

  .lead-header,
  .appointment-header {
    flex-direction: column;
    gap: 0.5rem;
  }

  .modal-container {
    margin: 1rem;
    max-width: none;
  }
}
</style>