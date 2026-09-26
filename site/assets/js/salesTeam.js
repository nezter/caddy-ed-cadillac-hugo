/**
 * Sales Team Component
 * Manages sales team profiles, filtering, and contact functionality
 */
class SalesTeam {
  constructor(element) {
    this.element = element;
    this.teamMembers = element.querySelectorAll('.team-member');
    this.filterButtons = element.querySelectorAll('.filter-button');
    this.searchInput = element.querySelector('.search-input');
    
    this.init();
  }
  
  init() {
    // Setup filter buttons
    if (this.filterButtons.length) {
      this.setupFilters();
    }
    
    // Setup search functionality
    if (this.searchInput) {
      this.setupSearch();
    }
    
    // Setup contact form interactions
    this.setupContactForms();
    
    // Initialize any dynamic content
    this.loadSalesMetrics();
  }
  
  setupFilters() {
    this.filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Remove active class from all buttons
        this.filterButtons.forEach(btn => btn.classList.remove('active'));
        
        // Add active class to clicked button
        button.classList.add('active');
        
        const filter = button.dataset.filter;
        
        // Show all team members if filter is 'all'
        if (filter === 'all') {
          this.teamMembers.forEach(member => {
            member.classList.remove('hidden');
          });
          return;
        }
        
        // Filter team members based on department
        this.teamMembers.forEach(member => {
          if (member.dataset.department === filter) {
            member.classList.remove('hidden');
          } else {
            member.classList.add('hidden');
          }
        });
      });
    });
  }
  
  setupSearch() {
    this.searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value.toLowerCase();
      
      this.teamMembers.forEach(member => {
        const name = member.dataset.name.toLowerCase();
        const department = member.dataset.department.toLowerCase();
        const specialties = member.dataset.specialties ? member.dataset.specialties.toLowerCase() : '';
        
        if (name.includes(searchTerm) || 
            department.includes(searchTerm) || 
            specialties.includes(searchTerm)) {
          member.classList.remove('hidden');
        } else {
          member.classList.add('hidden');
        }
      });
    });
  }
  
  setupContactForms() {
    const contactButtons = this.element.querySelectorAll('.contact-button');
    
    contactButtons.forEach(button => {
      button.addEventListener('click', () => {
        const memberId = button.dataset.memberId;
        const form = document.getElementById(`contact-form-${memberId}`);
        
        if (form) {
          // Toggle form visibility
          if (form.classList.contains('hidden')) {
            form.classList.remove('hidden');
            button.textContent = 'Cancel';
          } else {
            form.classList.add('hidden');
            button.textContent = 'Contact Me';
          }
        }
      });
    });
    
    // Form submission handler
    const forms = this.element.querySelectorAll('.member-contact-form');
    forms.forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const memberName = form.dataset.memberName;
        
        // Show loading state
        const submitButton = form.querySelector('button[type="submit"]');
        const originalText = submitButton.textContent;
        submitButton.textContent = 'Sending...';
        submitButton.disabled = true;
        
        // Use fetch API to submit the form
        fetch('/api/contact-salesperson', {
          method: 'POST',
          body: formData
        })
        .then(response => response.json())
        .then(data => {
          // Show success message
          form.innerHTML = `<div class="success-message">
            <p>Thank you for contacting ${memberName}. They will get back to you shortly.</p>
          </div>`;
        })
        .catch(error => {
          console.error('Error:', error);
          submitButton.textContent = originalText;
          submitButton.disabled = false;
          
          // Show error message
          const errorElement = form.querySelector('.error-message') || document.createElement('div');
          errorElement.classList.add('error-message');
          errorElement.textContent = 'Something went wrong. Please try again.';
          
          if (!form.querySelector('.error-message')) {
            form.appendChild(errorElement);
          }
        });
      });
    });
  }
  
  loadSalesMetrics() {
    // Get sales metrics for each team member
    const memberMetrics = this.element.querySelectorAll('.member-metrics');
    
    if (memberMetrics.length) {
      memberMetrics.forEach(metricElement => {
        const memberId = metricElement.dataset.memberId;
        
        // Fetch sales data for this member
        fetch(`/api/sales-metrics/${memberId}`)
          .then(response => response.json())
          .then(data => {
            // Create metrics visualization
            this.renderMemberMetrics(metricElement, data);
          })
          .catch(error => {
            console.error('Error loading sales metrics:', error);
            metricElement.innerHTML = '<p>Sales metrics unavailable</p>';
          });
      });
    }
  }
  
  renderMemberMetrics(element, data) {
    // Create a simple bar chart for member sales stats
    const salesCount = data.salesCount || 0;
    const customerSatisfaction = data.customerSatisfaction || 0;
    const responseTime = data.responseTime || 0;
    
    element.innerHTML = `
      <div class="metric">
        <span class="metric-label">Sales</span>
        <div class="metric-bar">
          <div class="metric-fill" style="width: ${Math.min(100, salesCount)}%"></div>
        </div>
        <span class="metric-value">${salesCount} vehicles</span>
      </div>
      <div class="metric">
        <span class="metric-label">Customer Satisfaction</span>
        <div class="metric-bar">
          <div class="metric-fill" style="width: ${customerSatisfaction}%"></div>
        </div>
        <span class="metric-value">${customerSatisfaction}%</span>
      </div>
      <div class="metric">
        <span class="metric-label">Avg. Response Time</span>
        <div class="metric-bar">
          <div class="metric-fill" style="width: ${Math.min(100, (100 - responseTime * 10))}%"></div>
        </div>
        <span class="metric-value">${responseTime} hours</span>
      </div>
    `;
  }
}

// Initialize all sales team components when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const salesTeamElements = document.querySelectorAll('.sales-team');
  salesTeamElements.forEach(element => {
    new SalesTeam(element);
  });
});

export default SalesTeam;
