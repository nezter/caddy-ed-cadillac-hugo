/**
 * Performance Tracker
 * Helps sales professionals track and visualize their performance metrics
 */
class PerformanceTracker {
  constructor() {
    this.trackerElement = document.getElementById('performance-tracker');
    
    // Only initialize if tracker exists
    if (!this.trackerElement) return;
    
    // Sales rep data
    this.salesRep = {
      id: this.trackerElement.dataset.salesId,
      name: this.trackerElement.dataset.salesName
    };
    
    // Tracker sections
    this.metricsContainer = document.getElementById('performance-metrics');
    this.goalsContainer = document.getElementById('performance-goals');
    this.trendsContainer = document.getElementById('performance-trends');
    this.timeframeSelector = document.getElementById('performance-timeframe');
    
    // State
    this.timeframe = 'month'; // default timeframe
    this.chartInstances = {};
    
    // Initialize
    this.init();
  }
  
  init() {
    // Check authentication
    this.checkAuth()
      .then(isAuthenticated => {
        if (isAuthenticated) {
          this.setupTracker();
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
  
  setupTracker() {
    // Show loading state
    this.showLoading();
    
    // Setup timeframe selector
    if (this.timeframeSelector) {
      this.timeframeSelector.addEventListener('change', () => {
        this.timeframe = this.timeframeSelector.value;
        this.refreshTracker();
      });
    }
    
    // Load initial data
    Promise.all([
      this.fetchPerformanceData(),
      this.fetchGoals(),
      this.fetchTrends()
    ])
    .then(() => {
      this.hideLoading();
      
      // Setup refresh button
      const refreshBtn = this.trackerElement.querySelector('.refresh-button');
      if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
          this.refreshTracker();
        });
      }
    })
    .catch(error => {
      console.error('Error setting up tracker:', error);
      this.hideLoading();
      this.showError('Failed to load performance data. Please try again.');
    });
  }
  
  fetchPerformanceData() {
    const url = new URL('/api/sales/performance', window.location.origin);
    url.searchParams.append('salesId', this.salesRep.id);
    url.searchParams.append('timeframe', this.timeframe);
    
    return fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch performance data');
      }
      return response.json();
    })
    .then(data => {
      this.renderPerformanceMetrics(data);
      return data;
    });
  }
  
  fetchGoals() {
    const url = new URL('/api/sales/goals', window.location.origin);
    url.searchParams.append('salesId', this.salesRep.id);
    url.searchParams.append('timeframe', this.timeframe);
    
    return fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch goals');
      }
      return response.json();
    })
    .then(data => {
      this.renderGoals(data);
      return data;
    });
  }
  
  fetchTrends() {
    const url = new URL('/api/sales/trends', window.location.origin);
    url.searchParams.append('salesId', this.salesRep.id);
    url.searchParams.append('timeframe', this.timeframe);
    
    return fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to fetch trends');
      }
      return response.json();
    })
    .then(data => {
      this.renderTrends(data);
      return data;
    });
  }
  
  renderPerformanceMetrics(data) {
    if (!this.metricsContainer) return;
    
    const metrics = data.metrics || [];
    let html = '<div class="metrics-grid">';
    
    metrics.forEach(metric => {
      const percentChange = metric.percentChange || 0;
      const trendClass = percentChange >= 0 ? 'trend-up' : 'trend-down';
      const trendIcon = percentChange >= 0 ? '↑' : '↓';
      
      html += `
        <div class="metric-card">
          <div class="metric-title">${metric.title}</div>
          <div class="metric-value">${metric.value}</div>
          <div class="metric-comparison ${trendClass}">
            ${trendIcon} ${Math.abs(percentChange)}% ${percentChange >= 0 ? 'increase' : 'decrease'}
          </div>
          <div class="metric-subtitle">${metric.subtitle || 'vs. previous period'}</div>
        </div>
      `;
    });
    
    html += '</div>';
    this.metricsContainer.innerHTML = html;
  }
  
  renderGoals(data) {
    if (!this.goalsContainer) return;
    
    const goals = data.goals || [];
    
    if (goals.length === 0) {
      this.goalsContainer.innerHTML = `
        <div class="empty-state">
          <p>No goals have been set for this period.</p>
          <button class="set-goals-btn">Set Goals</button>
        </div>
      `;
      
      // Setup set goals button
      const setGoalsBtn = this.goalsContainer.querySelector('.set-goals-btn');
      if (setGoalsBtn) {
        setGoalsBtn.addEventListener('click', () => {
          this.showGoalSettingModal();
        });
      }
      
      return;
    }
    
    let html = '<div class="goals-grid">';
    
    goals.forEach(goal => {
      const percentage = Math.min(100, Math.round((goal.current / goal.target) * 100)) || 0;
      const statusClass = percentage >= 100 ? 'complete' : (percentage >= 75 ? 'near-complete' : '');
      
      html += `
        <div class="goal-card ${statusClass}">
          <div class="goal-info">
            <div class="goal-title">${goal.title}</div>
            <div class="goal-value">${goal.current} / ${goal.target}</div>
          </div>
          <div class="goal-progress">
            <div class="progress-bar">
              <div class="progress-fill" style="width: ${percentage}%"></div>
            </div>
            <div class="progress-text">${percentage}% Complete</div>
          </div>
        </div>
      `;
    });
    
    html += `
      </div>
      <div class="goals-actions">
        <button class="edit-goals-btn">Edit Goals</button>
      </div>
    `;
    
    this.goalsContainer.innerHTML = html;
    
    // Setup edit goals button
    const editGoalsBtn = this.goalsContainer.querySelector('.edit-goals-btn');
    if (editGoalsBtn) {
      editGoalsBtn.addEventListener('click', () => {
        this.showGoalSettingModal(data.goals);
      });
    }
  }
  
  renderTrends(data) {
    if (!this.trendsContainer) return;
    
    // Clear existing charts
    this.trendsContainer.innerHTML = `
      <div class="chart-container">
        <canvas id="sales-trend-chart"></canvas>
      </div>
      <div class="chart-container">
        <canvas id="leads-trend-chart"></canvas>
      </div>
    `;
    
    // Render sales trend chart
    this.renderSalesTrendChart(data.salesTrend);
    
    // Render leads trend chart
    this.renderLeadsTrendChart(data.leadsTrend);
  }
  
  renderSalesTrendChart(data) {
    const canvas = document.getElementById('sales-trend-chart');
    if (!canvas) return;
    
    // If Chart.js is available
    if (typeof Chart !== 'undefined') {
      if (this.chartInstances.salesTrend) {
        this.chartInstances.salesTrend.destroy();
      }
      
      this.chartInstances.salesTrend = new Chart(canvas, {
        type: 'line',
        data: {
          labels: data.labels,
          datasets: [{
            label: 'Sales Volume',
            data: data.values,
            borderColor: 'rgba(66, 133, 244, 1)',
            backgroundColor: 'rgba(66, 133, 244, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: 'Sales Trend',
              font: {
                size: 16
              }
            },
            legend: {
              display: false
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              grace: '5%'
            }
          }
        }
      });
    } else {
      // Fallback if Chart.js is not available
      canvas.parentElement.innerHTML = `
        <div class="chart-fallback">
          <h3>Sales Trend</h3>
          <p>Chart library not available. Please check console for errors.</p>
        </div>
      `;
    }
  }
  
  renderLeadsTrendChart(data) {
    const canvas = document.getElementById('leads-trend-chart');
    if (!canvas) return;
    
    // If Chart.js is available
    if (typeof Chart !== 'undefined') {
      if (this.chartInstances.leadsTrend) {
        this.chartInstances.leadsTrend.destroy();
      }
      
      this.chartInstances.leadsTrend = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: data.labels,
          datasets: [{
            label: 'New Leads',
            data: data.newLeads,
            backgroundColor: 'rgba(52, 168, 83, 0.7)'
          }, {
            label: 'Conversion Rate',
            data: data.conversionRate,
            backgroundColor: 'rgba(251, 188, 5, 0.7)',
            type: 'line',
            yAxisID: 'y1',
            borderColor: 'rgba(251, 188, 5, 1)',
            borderWidth: 2,
            fill: false
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: 'Leads & Conversion Rate',
              font: {
                size: 16
              }
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              title: {
                display: true,
                text: 'Number of Leads'
              }
            },
            y1: {
              beginAtZero: true,
              position: 'right',
              title: {
                display: true,
                text: 'Conversion Rate (%)'
              },
              grid: {
                drawOnChartArea: false
              },
              ticks: {
                callback: function(value) {
                  return value + '%';
                }
              },
              max: 100
            }
          }
        }
      });
    } else {
      // Fallback if Chart.js is not available
      canvas.parentElement.innerHTML = `
        <div class="chart-fallback">
          <h3>Leads & Conversion Trend</h3>
          <p>Chart library not available. Please check console for errors.</p>
        </div>
      `;
    }
  }
  
  showGoalSettingModal(existingGoals = []) {
    const modal = document.createElement('div');
    modal.className = 'modal goals-modal';
    
    // Prepare goals form HTML
    let goalsFormHTML = '';
    const goalTypes = [
      { id: 'sales_volume', title: 'Sales Volume' },
      { id: 'revenue', title: 'Revenue' },
      { id: 'leads_generated', title: 'Leads Generated' },
      { id: 'appointments_set', title: 'Appointments Set' },
      { id: 'test_drives', title: 'Test Drives' },
      { id: 'conversion_rate', title: 'Lead to Sale Conversion Rate' }
    ];
    
    goalTypes.forEach(type => {
      const existingGoal = existingGoals.find(g => g.id === type.id);
      const currentValue = existingGoal ? existingGoal.current : 0;
      const targetValue = existingGoal ? existingGoal.target : '';
      
      goalsFormHTML += `
        <div class="goal-form-group">
          <label for="goal-${type.id}">${type.title}</label>
          <div class="goal-input-group">
            <div class="goal-current">
              <span>Current: ${currentValue}</span>
            </div>
            <div class="goal-target">
              <span>Target: </span>
              <input type="number" id="goal-${type.id}" name="goal-${type.id}" 
                min="1" value="${targetValue}" placeholder="Set target">
            </div>
          </div>
        </div>
      `;
    });
    
    modal.innerHTML = `
      <div class="modal-overlay"></div>
      <div class="modal-container">
        <button class="modal-close">&times;</button>
        <div class="modal-content">
          <h3>${existingGoals.length > 0 ? 'Edit Goals' : 'Set Goals'}</h3>
          <p>Define your targets for the ${this.timeframe === 'year' ? 'year' : 
            (this.timeframe === 'quarter' ? 'quarter' : 'month')}.</p>
          
          <form id="goals-form">
            ${goalsFormHTML}
            <div class="form-actions">
              <button type="submit" class="primary-button">Save Goals</button>
              <button type="button" class="secondary-button cancel-button">Cancel</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Add animation
    setTimeout(() => {
      modal.classList.add('show');
    }, 10);
    
    // Close button functionality
    const closeButton = modal.querySelector('.modal-close');
    closeButton.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 500);
    });
    
    // Cancel button functionality
    const cancelButton = modal.querySelector('.cancel-button');
    cancelButton.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 500);
    });
    
    // Close on overlay click
    const overlay = modal.querySelector('.modal-overlay');
    overlay.addEventListener('click', () => {
      modal.classList.remove('show');
      setTimeout(() => {
        document.body.removeChild(modal);
      }, 500);
    });
    
    // Form submission
    const form = modal.querySelector('#goals-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Collect goals data
      const goalsData = [];
      goalTypes.forEach(type => {
        const targetInput = form.querySelector(`#goal-${type.id}`);
        const target = parseInt(targetInput.value, 10);
        
        if (!isNaN(target)) {
          const existingGoal = existingGoals.find(g => g.id === type.id);
          goalsData.push({
            id: type.id,
            title: type.title,
            target: target,
            current: existingGoal ? existingGoal.current : 0
          });
        }
      });
      
      this.saveGoals(goalsData)
        .then(() => {
          modal.classList.remove('show');
          setTimeout(() => {
            document.body.removeChild(modal);
          }, 500);
        })
        .catch(error => {
          console.error('Error saving goals:', error);
          alert('Failed to save goals. Please try again.');
        });
    });
  }
  
  saveGoals(goalsData) {
    return fetch('/api/sales/save-goals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        salesId: this.salesRep.id,
        timeframe: this.timeframe,
        goals: goalsData
      })
    })
    .then(response => {
      if (!response.ok) {
        throw new Error('Failed to save goals');
      }
      return response.json();
    })
    .then(() => {
      // Refresh goals display
      return this.fetchGoals();
    });
  }
  
  refreshTracker() {
    this.showLoading();
    
    Promise.all([
      this.fetchPerformanceData(),
      this.fetchGoals(),
      this.fetchTrends()
    ])
    .then(() => {
      this.hideLoading();
    })
    .catch(error => {
      console.error('Error refreshing tracker:', error);
      this.hideLoading();
      this.showError('Failed to refresh performance data. Please try again.');
    });
  }
  
  showLoading() {
    const existingLoader = this.trackerElement.querySelector('.loader');
    if (existingLoader) return;
    
    const loader = document.createElement('div');
    loader.className = 'loader';
    loader.innerHTML = '<div class="spinner"></div><p>Loading data...</p>';
    
    this.trackerElement.appendChild(loader);
  }
  
  hideLoading() {
    const loader = this.trackerElement.querySelector('.loader');
    if (loader) {
      loader.remove();
    }
  }
  
  showError(message) {
    const error = document.createElement('div');
    error.className = 'error-message';
    error.textContent = message;
    
    this.trackerElement.appendChild(error);
    
    setTimeout(() => {
      error.remove();
    }, 5000);
  }
  
  showLoginPrompt() {
    this.trackerElement.innerHTML = `
      <div class="login-prompt">
        <h3>Authentication Required</h3>
        <p>Please login to access your performance dashboard.</p>
        <a href="/sales/login" class="login-button">Login</a>
      </div>
    `;
  }
}

// Initialize performance tracker
document.addEventListener('DOMContentLoaded', () => {
  new PerformanceTracker();
});

export default PerformanceTracker;
