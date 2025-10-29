---
title: "Follow-up Campaign Manager"
description: "Create and manage automated follow-up campaigns"
layout: "admin"
---

# Follow-up Campaign Manager

<div id="followup-campaign-manager">
  <div class="loading-state">
    <div class="spinner"></div>
    <p>Loading campaign manager...</p>
  </div>
</div>

<script src="/js/components/followup-campaign-manager.js"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
  // Initialize the campaign manager when the page loads
  const container = document.getElementById('followup-campaign-manager');
  if (container) {
    new FollowupCampaignManager('followup-campaign-manager');
  }
});
</script>

<style>
.loading-state {
  text-align: center;
  padding: 3rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 2rem 0;
}

.loading-state .spinner {
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

/* Additional styles for the campaign manager */
#followup-campaign-manager {
  min-height: 600px;
}

/* Button styles */
.btn {
  display: inline-block;
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: none;
  transition: all 0.2s ease;
}

.btn-primary {
  background: #007cba;
  color: white;
}

.btn-primary:hover {
  background: #005a87;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
}

.btn-icon {
  padding: 0.25rem;
  background: none;
  border: none;
  cursor: pointer;
  color: #6c757d;
  font-size: 1rem;
}

.btn-icon:hover {
  color: #007cba;
}

/* Modal styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: none;
}

.modal.show {
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: white;
  border-radius: 8px;
  max-width: 90vw;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
}

.modal.large-modal {
  max-width: 1200px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #dee2e6;
}

.modal-header h3 {
  margin: 0;
  color: #007cba;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6c757d;
}

.modal-body {
  padding: 1.5rem;
  max-height: 70vh;
  overflow-y: auto;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #dee2e6;
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* Form styles */
.form-section {
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #f8f9fa;
}

.form-section:last-child {
  border-bottom: none;
}

.form-section h4 {
  margin: 0 0 1rem 0;
  color: #495057;
  font-size: 1.1rem;
}

.form-row {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.form-group {
  flex: 1;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #495057;
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.9rem;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.checkbox-group {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-weight: normal;
}

/* Conditions and actions builder */
.conditions-builder,
.actions-builder {
  border: 1px solid #dee2e6;
  border-radius: 4px;
  padding: 1rem;
  background: #f8f9fa;
}

.condition-group,
.action-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.condition-item,
.action-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem;
  background: white;
  border: 1px solid #ced4da;
  border-radius: 4px;
}

.condition-item select,
.condition-item input,
.action-item select,
.action-item input,
.action-item textarea {
  flex: 1;
  padding: 0.25rem;
  border: 1px solid #ced4da;
  border-radius: 3px;
  font-size: 0.8rem;
}

.action-config {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background: #f8f9fa;
  border-radius: 3px;
  border: 1px solid #dee2e6;
}

.action-config-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.action-config-row label {
  min-width: 100px;
  font-size: 0.8rem;
  font-weight: 500;
}

.action-config-row select,
.action-config-row input {
  flex: 1;
  padding: 0.25rem;
  border: 1px solid #ced4da;
  border-radius: 3px;
  font-size: 0.8rem;
}

/* Status indicators */
.status-active { color: #28a745; }
.status-draft { color: #6c757d; }
.status-paused { color: #ffc107; }
.status-completed { color: #17a2b8; }

/* Empty states */
.empty-state {
  text-align: center;
  padding: 3rem;
  color: #6c757d;
}

.empty-state i {
  font-size: 3rem;
  margin-bottom: 1rem;
  display: block;
}

.empty-state h4 {
  margin: 0 0 0.5rem 0;
  color: #495057;
}

.no-selection,
.no-rules {
  text-align: center;
  padding: 2rem;
  color: #6c757d;
}

.no-selection i {
  font-size: 2rem;
  margin-bottom: 1rem;
  display: block;
}

.no-selection h3 {
  margin: 0 0 0.5rem 0;
  color: #495057;
}

/* Responsive design */
@media (max-width: 768px) {
  .form-row {
    flex-direction: column;
  }

  .modal-content {
    margin: 1rem;
    max-width: none;
    max-height: none;
  }

  .modal-body {
    padding: 1rem;
  }

  .condition-item,
  .action-item {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>