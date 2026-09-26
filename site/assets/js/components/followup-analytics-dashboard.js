/**
 * Follow-up Analytics Dashboard Component
 * Displays email/SMS analytics, open rates, click tracking, and conversion attribution
 */

class FollowupAnalyticsDashboard {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.analyticsData = null;
    this.selectedPeriod = 30; // days
    this.isLoading = false;

    this.init();
  }

  async init() {
    this.render();
    await this.loadAnalyticsData();
    this.bindEvents();
  }

  render() {
    this.container.innerHTML = `
      <div class="analytics-dashboard">
        <div class="analytics-header">
          <h2>Follow-up Analytics Dashboard</h2>
          <div class="period-selector">
            <label for="analytics-period">Time Period:</label>
            <select id="analytics-period">
              <option value="7">Last 7 days</option>
              <option value="30" selected>Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
          </div>
        </div>

        <!-- Loading State -->
        <div id="analytics-loading" class="loading-state" style="display: none;">
          <div class="spinner"></div>
          <p>Loading analytics data...</p>
        </div>

        <!-- Overview Metrics -->
        <div id="overview-metrics" class="metrics-grid" style="display: none;">
          <div class="metric-card">
            <div class="metric-icon">
              <i class="fas fa-paper-plane"></i>
            </div>
            <div class="metric-content">
              <div class="metric-value" id="total-sent">0</div>
              <div class="metric-label">Total Sent</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon">
              <i class="fas fa-envelope-open"></i>
            </div>
            <div class="metric-content">
              <div class="metric-value" id="open-rate">0%</div>
              <div class="metric-label">Open Rate</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon">
              <i class="fas fa-mouse-pointer"></i>
            </div>
            <div class="metric-content">
              <div class="metric-value" id="click-rate">0%</div>
              <div class="metric-label">Click Rate</div>
            </div>
          </div>

          <div class="metric-card">
            <div class="metric-icon">
              <i class="fas fa-users"></i>
            </div>
            <div class="metric-content">
              <div class="metric-value" id="total-conversions">0</div>
              <div class="metric-label">Conversions</div>
            </div>
          </div>
        </div>

        <!-- Charts and Detailed Analytics -->
        <div id="detailed-analytics" class="analytics-content" style="display: none;">
          <!-- Campaign Performance -->
          <div class="analytics-section">
            <h3>Campaign Performance</h3>
            <div class="campaign-table-container">
              <table id="campaign-performance-table" class="analytics-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Sent</th>
                    <th>Opened</th>
                    <th>Clicked</th>
                    <th>Open Rate</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody id="campaign-performance-body">
                  <tr>
                    <td colspan="6" class="loading-row">Loading campaign data...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Conversion Attribution -->
          <div class="analytics-section">
            <h3>Conversion Attribution</h3>
            <div class="conversion-chart-container">
              <canvas id="conversion-attribution-chart" width="400" height="200"></canvas>
            </div>
            <div class="conversion-table-container">
              <table id="conversion-attribution-table" class="analytics-table">
                <thead>
                  <tr>
                    <th>Campaign</th>
                    <th>Attributed Conversions</th>
                    <th>Touchpoints</th>
                    <th>Attribution Rate</th>
                  </tr>
                </thead>
                <tbody id="conversion-attribution-body">
                  <tr>
                    <td colspan="4" class="loading-row">Loading conversion data...</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- Recent Activity -->
          <div class="analytics-section">
            <h3>Recent Activity</h3>
            <div class="activity-feed">
              <div id="activity-list" class="activity-list">
                <div class="activity-item loading">
                  <div class="activity-icon"><i class="fas fa-spinner fa-spin"></i></div>
                  <div class="activity-content">Loading recent activity...</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Error State -->
        <div id="analytics-error" class="error-state" style="display: none;">
          <div class="error-icon">
            <i class="fas fa-exclamation-triangle"></i>
          </div>
          <h3>Unable to Load Analytics</h3>
          <p>There was an error loading the analytics data. Please try again later.</p>
          <button id="retry-analytics" class="btn btn-primary">Retry</button>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // Period selector
    const periodSelect = this.container.querySelector('#analytics-period');
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        this.selectedPeriod = parseInt(e.target.value);
        this.loadAnalyticsData();
      });
    }

    // Retry button
    const retryBtn = this.container.querySelector('#retry-analytics');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.loadAnalyticsData());
    }
  }

  async loadAnalyticsData() {
    this.showLoading(true);
    this.showError(false);

    try {
      const response = await fetch(`/api/followup-analytics/dashboard?days=${this.selectedPeriod}`);
      const data = await response.json();

      if (data.success) {
        this.analyticsData = data.data;
        this.updateDashboard();
        this.showLoading(false);
      } else {
        throw new Error(data.error || 'Failed to load analytics data');
      }
    } catch (error) {
      console.error('Error loading analytics data:', error);
      this.showError(true);
      this.showLoading(false);
    }
  }

  updateDashboard() {
    if (!this.analyticsData) return;

    // Update overview metrics
    this.updateOverviewMetrics();

    // Update campaign performance table
    this.updateCampaignPerformance();

    // Update conversion attribution
    this.updateConversionAttribution();

    // Update recent activity
    this.updateRecentActivity();

    // Show analytics content
    this.showAnalyticsContent(true);
  }

  updateOverviewMetrics() {
    const overall = this.analyticsData.overall || {};

    this.setMetricValue('total-sent', overall.sent_followups || 0);
    this.setMetricValue('open-rate', `${overall.open_rate || 0}%`);
    this.setMetricValue('click-rate', `${overall.click_rate || 0}%`);
    this.setMetricValue('total-conversions', overall.total_conversions || 0);
  }

  setMetricValue(metricId, value) {
    const element = this.container.querySelector(`#${metricId}`);
    if (element) {
      element.textContent = value;
    }
  }

  updateCampaignPerformance() {
    const campaigns = this.analyticsData.campaigns || [];
    const tbody = this.container.querySelector('#campaign-performance-body');

    if (campaigns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty-row">No campaign data available</td></tr>';
      return;
    }

    tbody.innerHTML = campaigns.map(campaign => `
      <tr>
        <td>${this.escapeHtml(campaign.campaign_name || 'Unnamed Campaign')}</td>
        <td>${campaign.total_followups || 0}</td>
        <td>${campaign.opened_followups || 0}</td>
        <td>${campaign.clicked_followups || 0}</td>
        <td>${campaign.open_rate || 0}%</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="viewCampaignDetails('${campaign.campaign_id}')">
            <i class="fas fa-chart-bar"></i> Details
          </button>
        </td>
      </tr>
    `).join('');
  }

  updateConversionAttribution() {
    const conversions = this.analyticsData.conversions || [];
    const tbody = this.container.querySelector('#conversion-attribution-body');

    if (conversions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-row">No conversion data available</td></tr>';
      return;
    }

    tbody.innerHTML = conversions.map(conversion => {
      const attributionRate = conversion.touchpoints > 0 ?
        ((conversion.attributed_conversions / conversion.touchpoints) * 100).toFixed(1) : 0;

      return `
        <tr>
          <td>${this.escapeHtml(conversion.campaign_name || 'Unnamed Campaign')}</td>
          <td>${conversion.attributed_conversions || 0}</td>
          <td>${conversion.touchpoints || 0}</td>
          <td>${attributionRate}%</td>
        </tr>
      `;
    }).join('');
  }

  updateRecentActivity() {
    const activities = this.analyticsData.recentActivity || [];
    const activityList = this.container.querySelector('#activity-list');

    if (activities.length === 0) {
      activityList.innerHTML = `
        <div class="activity-item empty">
          <div class="activity-icon"><i class="fas fa-info-circle"></i></div>
          <div class="activity-content">No recent activity</div>
        </div>
      `;
      return;
    }

    activityList.innerHTML = activities.slice(0, 20).map(activity => {
      const icon = this.getActivityIcon(activity.event_type);
      const description = this.getActivityDescription(activity);
      const timeAgo = this.getTimeAgo(new Date(activity.event_timestamp));

      return `
        <div class="activity-item">
          <div class="activity-icon">${icon}</div>
          <div class="activity-content">
            <div class="activity-description">${description}</div>
            <div class="activity-meta">${timeAgo}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  getActivityIcon(eventType) {
    const icons = {
      'sent': '<i class="fas fa-paper-plane text-primary"></i>',
      'opened': '<i class="fas fa-envelope-open text-success"></i>',
      'clicked': '<i class="fas fa-mouse-pointer text-info"></i>',
      'bounced': '<i class="fas fa-exclamation-triangle text-danger"></i>',
      'unsubscribed': '<i class="fas fa-ban text-warning"></i>'
    };
    return icons[eventType] || '<i class="fas fa-circle text-muted"></i>';
  }

  getActivityDescription(activity) {
    const customerName = `${activity.first_name || ''} ${activity.last_name || ''}`.trim() || 'Unknown Customer';
    const campaignName = activity.campaign_name || 'campaign';

    switch (activity.event_type) {
      case 'sent':
        return `${customerName} received a follow-up from ${campaignName}`;
      case 'opened':
        return `${customerName} opened a follow-up from ${campaignName}`;
      case 'clicked':
        return `${customerName} clicked a link in ${campaignName}`;
      case 'bounced':
        return `Follow-up to ${customerName} bounced`;
      case 'unsubscribed':
        return `${customerName} unsubscribed from communications`;
      default:
        return `${customerName} had activity with ${campaignName}`;
    }
  }

  getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  }

  showLoading(show) {
    const loading = this.container.querySelector('#analytics-loading');
    const content = this.container.querySelector('#detailed-analytics');
    const metrics = this.container.querySelector('#overview-metrics');

    if (loading) loading.style.display = show ? 'block' : 'none';
    if (content) content.style.display = show ? 'none' : 'block';
    if (metrics) metrics.style.display = show ? 'none' : 'block';
  }

  showAnalyticsContent(show) {
    const content = this.container.querySelector('#detailed-analytics');
    const metrics = this.container.querySelector('#overview-metrics');

    if (content) content.style.display = show ? 'block' : 'none';
    if (metrics) metrics.style.display = show ? 'block' : 'none';
  }

  showError(show) {
    const error = this.container.querySelector('#analytics-error');
    const content = this.container.querySelector('#detailed-analytics');
    const metrics = this.container.querySelector('#overview-metrics');

    if (error) error.style.display = show ? 'block' : 'none';
    if (content) content.style.display = show ? 'none' : 'block';
    if (metrics) metrics.style.display = show ? 'none' : 'block';
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Global function for campaign details (can be implemented later)
function viewCampaignDetails(campaignId) {
  console.log('View campaign details:', campaignId);
  // TODO: Implement campaign detail view
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FollowupAnalyticsDashboard;
}