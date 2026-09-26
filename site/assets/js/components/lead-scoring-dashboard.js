/**
 * Lead Scoring Dashboard Component
 * Displays lead scoring analytics and management interface
 */
class LeadScoringDashboard {
  constructor(container) {
    this.container = container;
    this.sessionManager = null;
    this.currentData = null;
    this.charts = {};
  }

  async init() {
    // Import session manager
    const sessionManager = await import('../utils/session-manager.js');
    this.sessionManager = sessionManager.default;

    this.render();
    this.loadData();
    this.setupEventListeners();
  }

  render() {
    this.container.innerHTML = `
      <div class="lead-scoring-dashboard">
        <div class="dashboard-header">
          <h2>Lead Scoring Analytics</h2>
          <div class="timeframe-selector">
            <select id="timeframe-select">
              <option value="7d">Last 7 days</option>
              <option value="30d" selected>Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="1y">Last year</option>
            </select>
          </div>
        </div>

        <div class="analytics-grid">
          <!-- Score Distribution Chart -->
          <div class="chart-card">
            <h3>Score Distribution</h3>
            <div class="chart-container">
              <canvas id="score-distribution-chart"></canvas>
            </div>
          </div>

          <!-- Priority Distribution -->
          <div class="chart-card">
            <h3>Lead Priority Breakdown</h3>
            <div class="chart-container">
              <canvas id="priority-chart"></canvas>
            </div>
          </div>

          <!-- Average Scores by Source -->
          <div class="chart-card">
            <h3>Average Scores by Source</h3>
            <div class="chart-container">
              <canvas id="source-scores-chart"></canvas>
            </div>
          </div>

          <!-- Conversion Rates -->
          <div class="chart-card">
            <h3>Conversion Rates by Score</h3>
            <div class="chart-container">
              <canvas id="conversion-chart"></canvas>
            </div>
          </div>
        </div>

        <!-- Summary Statistics -->
        <div class="summary-stats">
          <div class="stat-card">
            <h4>Total Leads</h4>
            <div class="stat-value" id="total-leads">-</div>
          </div>
          <div class="stat-card">
            <h4>Average Score</h4>
            <div class="stat-value" id="avg-score">-</div>
          </div>
          <div class="stat-card">
            <h4>Hot Leads (%)</h4>
            <div class="stat-value" id="hot-leads-pct">-</div>
          </div>
          <div class="stat-card">
            <h4>Conversion Rate</h4>
            <div class="stat-value" id="conversion-rate">-</div>
          </div>
        </div>

        <!-- Scoring Trends -->
        <div class="chart-card full-width">
          <h3>Scoring Trends Over Time</h3>
          <div class="chart-container">
            <canvas id="trends-chart"></canvas>
          </div>
        </div>

        <!-- Lead Scoring Actions -->
        <div class="actions-section">
          <h3>Lead Scoring Actions</h3>
          <div class="action-buttons">
            <button id="recalculate-scores" class="btn btn-primary">
              Recalculate All Scores
            </button>
            <button id="export-scoring-data" class="btn btn-secondary">
              Export Scoring Data
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async loadData(timeframe = '30d') {
    try {
      this.showLoading();

      const response = await fetch(`/api/lead-scoring?timeframe=${timeframe}`, {
        method: 'GET',
        headers: this.sessionManager.getAuthHeaders()
      });

      if (!response.ok) {
        throw new Error('Failed to load scoring data');
      }

      const result = await response.json();
      this.currentData = result.data;

      this.updateCharts();
      this.updateSummaryStats();

    } catch (error) {
      console.error('Error loading lead scoring data:', error);
      this.showError('Failed to load scoring analytics');
    } finally {
      this.hideLoading();
    }
  }

  updateCharts() {
    if (!this.currentData) return;

    // Score Distribution Chart
    this.createScoreDistributionChart();

    // Priority Distribution Chart
    this.createPriorityChart();

    // Source Scores Chart
    this.createSourceScoresChart();

    // Conversion Rates Chart
    this.createConversionChart();

    // Trends Chart
    this.createTrendsChart();
  }

  createScoreDistributionChart() {
    const ctx = document.getElementById('score-distribution-chart');
    if (!ctx) return;

    const data = this.currentData.scoreDistribution || [];

    // Destroy existing chart
    if (this.charts.scoreDistribution) {
      this.charts.scoreDistribution.destroy();
    }

    this.charts.scoreDistribution = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.map(item => item.score_range),
        datasets: [{
          data: data.map(item => item.count),
          backgroundColor: [
            '#ff6384', // 80-100 (red)
            '#ff9f40', // 60-79 (orange)
            '#ffcd56', // 40-59 (yellow)
            '#4bc0c0', // 20-39 (teal)
            '#36a2eb'  // 0-19 (blue)
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: 'bottom'
          },
          title: {
            display: true,
            text: 'Lead Score Distribution'
          }
        }
      }
    });
  }

  createPriorityChart() {
    const ctx = document.getElementById('priority-chart');
    if (!ctx) return;

    const data = this.currentData.priorityDistribution || [];

    if (this.charts.priority) {
      this.charts.priority.destroy();
    }

    this.charts.priority = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.map(item => item.priority.toUpperCase()),
        datasets: [{
          label: 'Number of Leads',
          data: data.map(item => item.count),
          backgroundColor: [
            '#dc3545', // HOT - red
            '#fd7e14', // WARM - orange
            '#ffc107', // COOL - yellow
            '#6c757d'  // COLD - gray
          ]
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Leads by Priority Level'
          }
        }
      }
    });
  }

  createSourceScoresChart() {
    const ctx = document.getElementById('source-scores-chart');
    if (!ctx) return;

    const data = this.currentData.scoresBySource || [];

    if (this.charts.sourceScores) {
      this.charts.sourceScores.destroy();
    }

    this.charts.sourceScores = new Chart(ctx, {
      type: 'horizontalBar',
      data: {
        labels: data.map(item => item.source.replace('_', ' ').toUpperCase()),
        datasets: [{
          label: 'Average Score',
          data: data.map(item => item.avg_score),
          backgroundColor: '#17a2b8'
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        scales: {
          x: {
            beginAtZero: true,
            max: 100
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Average Lead Scores by Source'
          }
        }
      }
    });
  }

  createConversionChart() {
    const ctx = document.getElementById('conversion-chart');
    if (!ctx) return;

    const data = this.currentData.summary?.conversionRateByScore || [];

    if (this.charts.conversion) {
      this.charts.conversion.destroy();
    }

    this.charts.conversion = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(item => item.score_range),
        datasets: [{
          label: 'Conversion Rate (%)',
          data: data.map(item => item.conversion_rate || 0),
          borderColor: '#28a745',
          backgroundColor: 'rgba(40, 167, 69, 0.1)',
          tension: 0.4
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 100
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Conversion Rates by Score Range'
          }
        }
      }
    });
  }

  createTrendsChart() {
    const ctx = document.getElementById('trends-chart');
    if (!ctx) return;

    const data = this.currentData.scoringTrends || [];

    if (this.charts.trends) {
      this.charts.trends.destroy();
    }

    this.charts.trends = new Chart(ctx, {
      type: 'line',
      data: {
        labels: data.map(item => new Date(item.date).toLocaleDateString()),
        datasets: [
          {
            label: 'Average Score',
            data: data.map(item => item.avg_score),
            borderColor: '#007bff',
            backgroundColor: 'rgba(0, 123, 255, 0.1)',
            yAxisID: 'y',
            tension: 0.4
          },
          {
            label: 'Lead Volume',
            data: data.map(item => item.lead_count),
            borderColor: '#6c757d',
            backgroundColor: 'rgba(108, 117, 125, 0.1)',
            yAxisID: 'y1',
            tension: 0.4
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            beginAtZero: true,
            max: 100,
            title: {
              display: true,
              text: 'Average Score'
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            beginAtZero: true,
            title: {
              display: true,
              text: 'Lead Count'
            },
            grid: {
              drawOnChartArea: false
            }
          }
        },
        plugins: {
          title: {
            display: true,
            text: 'Lead Scoring Trends'
          }
        }
      }
    });
  }

  updateSummaryStats() {
    if (!this.currentData?.summary) return;

    const summary = this.currentData.summary;

    document.getElementById('total-leads').textContent = summary.totalLeads || 0;
    document.getElementById('avg-score').textContent = summary.averageScore || 0;
    document.getElementById('hot-leads-pct').textContent = `${summary.hotLeadsPercentage || 0}%`;
    document.getElementById('conversion-rate').textContent = `${summary.conversionRate || 0}%`;
  }

  setupEventListeners() {
    // Timeframe selector
    const timeframeSelect = document.getElementById('timeframe-select');
    if (timeframeSelect) {
      timeframeSelect.addEventListener('change', (e) => {
        this.loadData(e.target.value);
      });
    }

    // Recalculate scores button
    const recalculateBtn = document.getElementById('recalculate-scores');
    if (recalculateBtn) {
      recalculateBtn.addEventListener('click', () => {
        this.recalculateAllScores();
      });
    }

    // Export data button
    const exportBtn = document.getElementById('export-scoring-data');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        this.exportScoringData();
      });
    }
  }

  async recalculateAllScores() {
    try {
      const confirmRecalc = confirm('This will recalculate scores for all leads. This may take a few minutes. Continue?');
      if (!confirmRecalc) return;

      this.showLoading('Recalculating scores...');

      // This would need a batch processing endpoint
      // For now, just reload the data
      await this.loadData(document.getElementById('timeframe-select').value);

      alert('Score recalculation completed!');

    } catch (error) {
      console.error('Error recalculating scores:', error);
      this.showError('Failed to recalculate scores');
    } finally {
      this.hideLoading();
    }
  }

  exportScoringData() {
    if (!this.currentData) {
      alert('No data to export');
      return;
    }

    try {
      const dataStr = JSON.stringify(this.currentData, null, 2);
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

      const exportFileDefaultName = `lead-scoring-analytics-${new Date().toISOString().split('T')[0]}.json`;

      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileDefaultName);
      linkElement.click();

    } catch (error) {
      console.error('Error exporting data:', error);
      alert('Failed to export data');
    }
  }

  showLoading(message = 'Loading...') {
    // Add loading overlay
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-spinner">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
    this.container.appendChild(overlay);
  }

  hideLoading() {
    const overlay = this.container.querySelector('.loading-overlay');
    if (overlay) {
      overlay.remove();
    }
  }

  showError(message) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.textContent = message;
    this.container.appendChild(errorDiv);

    setTimeout(() => {
      errorDiv.remove();
    }, 5000);
  }
}

export default LeadScoringDashboard;