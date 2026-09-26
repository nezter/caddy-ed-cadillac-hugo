/**
 * Follow-up Campaign Manager Component
 * Interface for creating and managing automated follow-up campaigns
 */

class FollowupCampaignManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.campaigns = [];
    this.rules = [];
    this.templates = { email: [], sms: [] };
    this.selectedCampaign = null;
    this.isLoading = false;

    this.init();
  }

  async init() {
    this.render();
    await this.loadData();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="campaign-manager">
        <div class="campaign-header">
          <h2>Follow-up Campaign Manager</h2>
          <div class="header-actions">
            <button id="create-campaign-btn" class="btn btn-primary">
              <i class="fas fa-plus"></i> Create Campaign
            </button>
            <button id="create-rule-btn" class="btn btn-secondary">
              <i class="fas fa-cogs"></i> Create Rule
            </button>
            <button id="manage-templates-btn" class="btn btn-secondary">
              <i class="fas fa-envelope"></i> Templates
            </button>
          </div>
        </div>

        <div class="campaign-content">
          <!-- Campaign List -->
          <div class="campaign-list-panel">
            <div class="panel-header">
              <h3>Campaigns</h3>
              <div class="panel-actions">
                <select id="campaign-filter">
                  <option value="all">All Campaigns</option>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="completed">Completed</option>
                </select>
              </div>
            </div>
            <div id="campaign-list" class="campaign-list">
              <!-- Campaigns will be loaded here -->
            </div>
          </div>

          <!-- Campaign Details/Editor -->
          <div class="campaign-detail-panel">
            <div id="campaign-detail" class="campaign-detail">
              <!-- Campaign details will be shown here -->
              <div class="no-selection">
                <i class="fas fa-arrow-left"></i>
                <h3>Select a campaign to view details</h3>
                <p>Choose a campaign from the list to view its rules, performance, and settings.</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Modals -->
        <div id="campaign-modal" class="modal" style="display: none;">
          <div class="modal-content">
            <div class="modal-header">
              <h3 id="modal-title">Create Campaign</h3>
              <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <form id="campaign-form">
                <div class="form-section">
                  <h4>Basic Information</h4>
                  <div class="form-row">
                    <div class="form-group">
                      <label for="campaign-name">Campaign Name *</label>
                      <input type="text" id="campaign-name" required />
                    </div>
                    <div class="form-group">
                      <label for="campaign-description">Description</label>
                      <textarea id="campaign-description" rows="3"></textarea>
                    </div>
                  </div>
                </div>

                <div class="form-section">
                  <h4>Campaign Settings</h4>
                  <div class="form-row">
                    <div class="form-group">
                      <label for="campaign-status">Status</label>
                      <select id="campaign-status">
                        <option value="draft">Draft</option>
                        <option value="active">Active</option>
                        <option value="paused">Paused</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="campaign-start-date">Start Date</label>
                      <input type="datetime-local" id="campaign-start-date" />
                    </div>
                    <div class="form-group">
                      <label for="campaign-end-date">End Date</label>
                      <input type="datetime-local" id="campaign-end-date" />
                    </div>
                  </div>
                </div>

                <div class="form-section">
                  <h4>Target Audience</h4>
                  <div class="form-row">
                    <div class="form-group">
                      <label>Customer Types</label>
                      <div class="checkbox-group">
                        <label><input type="checkbox" value="prospect" /> Prospects</label>
                        <label><input type="checkbox" value="active" /> Active Customers</label>
                        <label><input type="checkbox" value="inactive" /> Inactive Customers</label>
                      </div>
                    </div>
                    <div class="form-group">
                      <label>Lead Sources</label>
                      <div class="checkbox-group">
                        <label><input type="checkbox" value="website" /> Website</label>
                        <label><input type="checkbox" value="phone" /> Phone</label>
                        <label><input type="checkbox" value="referral" /> Referral</label>
                        <label><input type="checkbox" value="advertising" /> Advertising</label>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button id="save-campaign-btn" class="btn btn-primary">Save Campaign</button>
              <button class="btn btn-secondary modal-close">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Rule Modal -->
        <div id="rule-modal" class="modal" style="display: none;">
          <div class="modal-content large-modal">
            <div class="modal-header">
              <h3 id="rule-modal-title">Create Rule</h3>
              <button class="modal-close">&times;</button>
            </div>
            <div class="modal-body">
              <form id="rule-form">
                <div class="form-section">
                  <h4>Rule Details</h4>
                  <div class="form-row">
                    <div class="form-group">
                      <label for="rule-name">Rule Name *</label>
                      <input type="text" id="rule-name" required />
                    </div>
                    <div class="form-group">
                      <label for="rule-description">Description</label>
                      <textarea id="rule-description" rows="2"></textarea>
                    </div>
                  </div>
                  <div class="form-row">
                    <div class="form-group">
                      <label for="rule-trigger">Trigger Event *</label>
                      <select id="rule-trigger" required>
                        <option value="">Select trigger...</option>
                        <option value="lead_created">Lead Created</option>
                        <option value="interaction_added">Interaction Added</option>
                        <option value="appointment_scheduled">Appointment Scheduled</option>
                        <option value="test_drive_completed">Test Drive Completed</option>
                        <option value="quote_requested">Quote Requested</option>
                      </select>
                    </div>
                    <div class="form-group">
                      <label for="rule-priority">Priority</label>
                      <select id="rule-priority">
                        <option value="1">Low</option>
                        <option value="2" selected>Medium</option>
                        <option value="3">High</option>
                        <option value="4">Critical</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div class="form-section">
                  <h4>Conditions</h4>
                  <div id="conditions-builder" class="conditions-builder">
                    <div class="condition-group">
                      <div class="condition-item">
                        <select class="condition-field">
                          <option value="">Select field...</option>
                          <option value="lead.score">Lead Score</option>
                          <option value="customer.customer_type">Customer Type</option>
                          <option value="lead.lead_source">Lead Source</option>
                          <option value="interaction.interaction_type">Interaction Type</option>
                        </select>
                        <select class="condition-operator">
                          <option value="greater_than">Greater Than</option>
                          <option value="less_than">Less Than</option>
                          <option value="equals">Equals</option>
                          <option value="contains">Contains</option>
                        </select>
                        <input type="text" class="condition-value" placeholder="Value" />
                        <button type="button" class="btn-icon remove-condition">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                    <button type="button" id="add-condition-btn" class="btn btn-secondary">
                      <i class="fas fa-plus"></i> Add Condition
                    </button>
                  </div>
                </div>

                <div class="form-section">
                  <h4>Actions</h4>
                  <div id="actions-builder" class="actions-builder">
                    <div class="action-group">
                      <div class="action-item">
                        <select class="action-type">
                          <option value="">Select action...</option>
                          <option value="schedule_followup">Schedule Follow-up</option>
                          <option value="send_immediate">Send Immediate</option>
                          <option value="create_task">Create Task</option>
                          <option value="update_lead">Update Lead</option>
                        </select>
                        <div class="action-config" style="display: none;">
                          <!-- Action-specific configuration will be added here -->
                        </div>
                        <button type="button" class="btn-icon remove-action">
                          <i class="fas fa-trash"></i>
                        </button>
                      </div>
                    </div>
                    <button type="button" id="add-action-btn" class="btn btn-secondary">
                      <i class="fas fa-plus"></i> Add Action
                    </button>
                  </div>
                </div>
              </form>
            </div>
            <div class="modal-footer">
              <button id="save-rule-btn" class="btn btn-primary">Save Rule</button>
              <button class="btn btn-secondary modal-close">Cancel</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  async loadData() {
    this.setLoading(true);

    try {
      // Load campaigns
      const campaignsResponse = await fetch('/.netlify/functions/followup-campaigns');
      if (campaignsResponse.ok) {
        const campaignsData = await campaignsResponse.json();
        this.campaigns = campaignsData.campaigns || [];
      }

      // Load rules
      const rulesResponse = await fetch('/.netlify/functions/followup-rules');
      if (rulesResponse.ok) {
        const rulesData = await rulesResponse.json();
        this.rules = rulesData.rules || [];
      }

      // Load templates
      await this.loadTemplates();

      this.renderCampaignList();
      this.renderCampaignDetail();

    } catch (error) {
      console.error('Error loading campaign data:', error);
      this.showError('Failed to load campaign data');
    } finally {
      this.setLoading(false);
    }
  }

  async loadTemplates() {
    try {
      const [emailResponse, smsResponse] = await Promise.all([
        fetch('/.netlify/functions/email-templates'),
        fetch('/.netlify/functions/sms-templates')
      ]);

      if (emailResponse.ok) {
        const emailData = await emailResponse.json();
        this.templates.email = emailData.templates || [];
      }

      if (smsResponse.ok) {
        const smsData = await smsResponse.json();
        this.templates.sms = smsData.templates || [];
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }

  renderCampaignList() {
    const container = document.getElementById('campaign-list');

    if (this.campaigns.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-bullhorn"></i>
          <h4>No campaigns yet</h4>
          <p>Create your first automated follow-up campaign to get started.</p>
          <button id="create-first-campaign" class="btn btn-primary">
            <i class="fas fa-plus"></i> Create Campaign
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = this.campaigns.map(campaign => `
      <div class="campaign-item ${this.selectedCampaign?.id === campaign.id ? 'selected' : ''}"
           data-campaign-id="${campaign.id}">
        <div class="campaign-info">
          <div class="campaign-name">${campaign.name}</div>
          <div class="campaign-meta">
            <span class="campaign-status status-${campaign.status}">${this.capitalizeFirst(campaign.status)}</span>
            <span class="campaign-rules">${campaign.rule_count || 0} rules</span>
          </div>
        </div>
        <div class="campaign-stats">
          <div class="stat">
            <span class="stat-value">${campaign.sent_followups || 0}</span>
            <span class="stat-label">Sent</span>
          </div>
          <div class="stat">
            <span class="stat-value">${campaign.open_rate || 0}%</span>
            <span class="stat-label">Open Rate</span>
          </div>
        </div>
      </div>
    `).join('');
  }

  renderCampaignDetail() {
    const container = document.getElementById('campaign-detail');

    if (!this.selectedCampaign) {
      container.innerHTML = `
        <div class="no-selection">
          <i class="fas fa-arrow-left"></i>
          <h3>Select a campaign to view details</h3>
          <p>Choose a campaign from the list to view its rules, performance, and settings.</p>
        </div>
      `;
      return;
    }

    const campaign = this.selectedCampaign;
    const campaignRules = this.rules.filter(rule => rule.campaign_id === campaign.id);

    container.innerHTML = `
      <div class="campaign-detail-header">
        <div class="campaign-title">
          <h3>${campaign.name}</h3>
          <span class="campaign-status status-${campaign.status}">${this.capitalizeFirst(campaign.status)}</span>
        </div>
        <div class="campaign-actions">
          <button class="btn btn-secondary edit-campaign">
            <i class="fas fa-edit"></i> Edit
          </button>
          <button class="btn btn-primary add-rule">
            <i class="fas fa-plus"></i> Add Rule
          </button>
        </div>
      </div>

      <div class="campaign-description">
        ${campaign.description || 'No description provided.'}
      </div>

      <div class="campaign-stats-grid">
        <div class="stat-card">
          <div class="stat-value">${campaign.sent_followups || 0}</div>
          <div class="stat-label">Follow-ups Sent</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${campaign.open_rate || 0}%</div>
          <div class="stat-label">Open Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${campaign.click_rate || 0}%</div>
          <div class="stat-label">Click Rate</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${campaign.conversion_rate || 0}%</div>
          <div class="stat-label">Conversion Rate</div>
        </div>
      </div>

      <div class="campaign-rules-section">
        <div class="section-header">
          <h4>Campaign Rules (${campaignRules.length})</h4>
          <button class="btn btn-secondary add-rule">
            <i class="fas fa-plus"></i> Add Rule
          </button>
        </div>

        <div class="rules-list">
          ${campaignRules.length === 0 ?
            '<div class="no-rules">No rules configured for this campaign.</div>' :
            campaignRules.map(rule => `
              <div class="rule-item" data-rule-id="${rule.id}">
                <div class="rule-info">
                  <div class="rule-name">${rule.name}</div>
                  <div class="rule-trigger">Trigger: ${this.formatTriggerEvent(rule.trigger_event)}</div>
                  <div class="rule-stats">
                    <span>${rule.followups_created || 0} follow-ups created</span>
                    <span>${rule.followups_sent || 0} sent</span>
                  </div>
                </div>
                <div class="rule-actions">
                  <button class="btn-icon edit-rule" title="Edit Rule">
                    <i class="fas fa-edit"></i>
                  </button>
                  <button class="btn-icon delete-rule" title="Delete Rule">
                    <i class="fas fa-trash"></i>
                  </button>
                </div>
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Campaign list events
    document.getElementById('campaign-list').addEventListener('click', (e) => {
      const campaignItem = e.target.closest('.campaign-item');
      if (campaignItem) {
        const campaignId = campaignItem.dataset.campaignId;
        this.selectCampaign(campaignId);
      }
    });

    // Create campaign buttons
    document.getElementById('create-campaign-btn').addEventListener('click', () => {
      this.showCampaignModal();
    });

    const createFirstCampaign = document.getElementById('create-first-campaign');
    if (createFirstCampaign) {
      createFirstCampaign.addEventListener('click', () => {
        this.showCampaignModal();
      });
    }

    // Create rule button
    document.getElementById('create-rule-btn').addEventListener('click', () => {
      this.showRuleModal();
    });

    // Campaign filter
    document.getElementById('campaign-filter').addEventListener('change', (e) => {
      this.filterCampaigns(e.target.value);
    });

    // Modal events
    this.bindModalEvents();

    // Rule builder events
    this.bindRuleBuilderEvents();
  }

  selectCampaign(campaignId) {
    this.selectedCampaign = this.campaigns.find(c => c.id === campaignId);
    this.renderCampaignList();
    this.renderCampaignDetail();
  }

  filterCampaigns(status) {
    // This would filter the campaigns list based on status
    // For now, just re-render
    this.renderCampaignList();
  }

  showCampaignModal(campaign = null) {
    const modal = document.getElementById('campaign-modal');
    const title = document.getElementById('modal-title');
    const form = document.getElementById('campaign-form');

    if (campaign) {
      title.textContent = 'Edit Campaign';
      // Populate form with campaign data
      document.getElementById('campaign-name').value = campaign.name || '';
      document.getElementById('campaign-description').value = campaign.description || '';
      document.getElementById('campaign-status').value = campaign.status || 'draft';
      // ... populate other fields
    } else {
      title.textContent = 'Create Campaign';
      form.reset();
    }

    modal.style.display = 'block';
  }

  showRuleModal(rule = null) {
    const modal = document.getElementById('rule-modal');
    const title = document.getElementById('rule-modal-title');
    const form = document.getElementById('rule-form');

    if (rule) {
      title.textContent = 'Edit Rule';
      // Populate form with rule data
    } else {
      title.textContent = 'Create Rule';
      form.reset();
    }

    modal.style.display = 'block';
  }

  bindModalEvents() {
    // Close modals
    document.querySelectorAll('.modal-close').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.modal').forEach(modal => {
          modal.style.display = 'none';
        });
      });
    });

    // Save campaign
    document.getElementById('save-campaign-btn').addEventListener('click', () => {
      this.saveCampaign();
    });

    // Save rule
    document.getElementById('save-rule-btn').addEventListener('click', () => {
      this.saveRule();
    });
  }

  bindRuleBuilderEvents() {
    // Add condition
    document.getElementById('add-condition-btn').addEventListener('click', () => {
      this.addCondition();
    });

    // Add action
    document.getElementById('add-action-btn').addEventListener('click', () => {
      this.addAction();
    });

    // Dynamic event binding for remove buttons
    document.addEventListener('click', (e) => {
      if (e.target.closest('.remove-condition')) {
        e.target.closest('.condition-item').remove();
      }
      if (e.target.closest('.remove-action')) {
        e.target.closest('.action-item').remove();
      }
    });
  }

  addCondition() {
    const conditionGroup = document.querySelector('.condition-group');
    const newCondition = document.createElement('div');
    newCondition.className = 'condition-item';
    newCondition.innerHTML = `
      <select class="condition-field">
        <option value="">Select field...</option>
        <option value="lead.score">Lead Score</option>
        <option value="customer.customer_type">Customer Type</option>
        <option value="lead.lead_source">Lead Source</option>
        <option value="interaction.interaction_type">Interaction Type</option>
      </select>
      <select class="condition-operator">
        <option value="greater_than">Greater Than</option>
        <option value="less_than">Less Than</option>
        <option value="equals">Equals</option>
        <option value="contains">Contains</option>
      </select>
      <input type="text" class="condition-value" placeholder="Value" />
      <button type="button" class="btn-icon remove-condition">
        <i class="fas fa-trash"></i>
      </button>
    `;
    conditionGroup.appendChild(newCondition);
  }

  addAction() {
    const actionGroup = document.querySelector('.action-group');
    const newAction = document.createElement('div');
    newAction.className = 'action-item';
    newAction.innerHTML = `
      <select class="action-type">
        <option value="">Select action...</option>
        <option value="schedule_followup">Schedule Follow-up</option>
        <option value="send_immediate">Send Immediate</option>
        <option value="create_task">Create Task</option>
        <option value="update_lead">Update Lead</option>
      </select>
      <div class="action-config" style="display: none;">
        <!-- Action-specific configuration will be added here -->
      </div>
      <button type="button" class="btn-icon remove-action">
        <i class="fas fa-trash"></i>
      </button>
    `;
    actionGroup.appendChild(newAction);

    // Bind action type change event
    newAction.querySelector('.action-type').addEventListener('change', (e) => {
      this.showActionConfig(e.target);
    });
  }

  showActionConfig(selectElement) {
    const actionItem = selectElement.closest('.action-item');
    const configDiv = actionItem.querySelector('.action-config');
    const actionType = selectElement.value;

    let configHtml = '';

    switch (actionType) {
      case 'schedule_followup':
        configHtml = `
          <div class="action-config-row">
            <label>Delay (hours):</label>
            <input type="number" class="action-delay" value="24" />
          </div>
          <div class="action-config-row">
            <label>Email Template:</label>
            <select class="action-email-template">
              <option value="">Select template...</option>
              ${this.templates.email.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="action-config-row">
            <label>SMS Template:</label>
            <select class="action-sms-template">
              <option value="">Select template...</option>
              ${this.templates.sms.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
            </select>
          </div>
        `;
        break;
      case 'send_immediate':
        configHtml = `
          <div class="action-config-row">
            <label>Email Template:</label>
            <select class="action-email-template">
              <option value="">Select template...</option>
              ${this.templates.email.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
            </select>
          </div>
          <div class="action-config-row">
            <label>SMS Template:</label>
            <select class="action-sms-template">
              <option value="">Select template...</option>
              ${this.templates.sms.map(t => `<option value="${t.name}">${t.name}</option>`).join('')}
            </select>
          </div>
        `;
        break;
      case 'create_task':
        configHtml = `
          <div class="action-config-row">
            <label>Title:</label>
            <input type="text" class="action-task-title" placeholder="Task title" />
          </div>
          <div class="action-config-row">
            <label>Description:</label>
            <textarea class="action-task-description" placeholder="Task description"></textarea>
          </div>
          <div class="action-config-row">
            <label>Priority:</label>
            <select class="action-task-priority">
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        `;
        break;
    }

    configDiv.innerHTML = configHtml;
    configDiv.style.display = configHtml ? 'block' : 'none';
  }

  async saveCampaign() {
    const formData = new FormData(document.getElementById('campaign-form'));
    const campaignData = {
      name: document.getElementById('campaign-name').value,
      description: document.getElementById('campaign-description').value,
      status: document.getElementById('campaign-status').value,
      start_date: document.getElementById('campaign-start-date').value,
      end_date: document.getElementById('campaign-end-date').value,
      // Add other fields as needed
    };

    try {
      const response = await fetch('/.netlify/functions/followup-campaigns', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(campaignData)
      });

      if (response.ok) {
        const result = await response.json();
        this.campaigns.push(result.campaign);
        this.renderCampaignList();
        document.getElementById('campaign-modal').style.display = 'none';
        this.showNotification('Campaign created successfully', 'success');
      } else {
        throw new Error('Failed to create campaign');
      }
    } catch (error) {
      console.error('Error saving campaign:', error);
      this.showNotification('Failed to save campaign', 'error');
    }
  }

  async saveRule() {
    // Collect rule data from form
    const ruleData = {
      name: document.getElementById('rule-name').value,
      description: document.getElementById('rule-description').value,
      trigger_event: document.getElementById('rule-trigger').value,
      priority: parseInt(document.getElementById('rule-priority').value),
      campaign_id: this.selectedCampaign?.id,
      conditions: this.collectConditions(),
      actions: this.collectActions()
    };

    try {
      const response = await fetch('/.netlify/functions/followup-rules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ruleData)
      });

      if (response.ok) {
        const result = await response.json();
        this.rules.push(result.rule);
        this.renderCampaignDetail();
        document.getElementById('rule-modal').style.display = 'none';
        this.showNotification('Rule created successfully', 'success');
      } else {
        throw new Error('Failed to create rule');
      }
    } catch (error) {
      console.error('Error saving rule:', error);
      this.showNotification('Failed to save rule', 'error');
    }
  }

  collectConditions() {
    const conditions = {};
    const conditionItems = document.querySelectorAll('.condition-item');

    conditionItems.forEach(item => {
      const field = item.querySelector('.condition-field').value;
      const operator = item.querySelector('.condition-operator').value;
      const value = item.querySelector('.condition-value').value;

      if (field && value) {
        conditions[field] = { operator, value };
      }
    });

    return conditions;
  }

  collectActions() {
    const actions = [];
    const actionItems = document.querySelectorAll('.action-item');

    actionItems.forEach(item => {
      const type = item.querySelector('.action-type').value;
      if (!type) return;

      const action = { type };

      // Collect action-specific data
      switch (type) {
        case 'schedule_followup':
          action.delay_hours = parseInt(item.querySelector('.action-delay')?.value) || 24;
          action.email_template = item.querySelector('.action-email-template')?.value;
          action.sms_template = item.querySelector('.action-sms-template')?.value;
          break;
        case 'send_immediate':
          action.email_template = item.querySelector('.action-email-template')?.value;
          action.sms_template = item.querySelector('.action-sms-template')?.value;
          break;
        case 'create_task':
          action.title = item.querySelector('.action-task-title')?.value;
          action.description = item.querySelector('.action-task-description')?.value;
          action.priority = item.querySelector('.action-task-priority')?.value || 'medium';
          break;
      }

      actions.push(action);
    });

    return actions;
  }

  formatTriggerEvent(event) {
    const eventNames = {
      lead_created: 'Lead Created',
      interaction_added: 'Interaction Added',
      appointment_scheduled: 'Appointment Scheduled',
      test_drive_completed: 'Test Drive Completed',
      quote_requested: 'Quote Requested'
    };
    return eventNames[event] || event;
  }

  setLoading(loading) {
    this.isLoading = loading;
    // Add loading indicators as needed
  }

  showError(message) {
    this.showNotification(message, 'error');
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
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FollowupCampaignManager;
}