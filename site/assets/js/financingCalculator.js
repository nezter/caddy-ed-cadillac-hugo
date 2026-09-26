/**
 * Financing Calculator Component
 * Helps users calculate monthly payments and explore financing options
 */
class FinancingCalculator {
  constructor(element) {
    this.element = element;
    this.vehiclePrice = element.querySelector('#vehicle-price');
    this.downPayment = element.querySelector('#down-payment');
    this.tradeInValue = element.querySelector('#trade-in-value');
    this.interestRate = element.querySelector('#interest-rate');
    this.loanTerm = element.querySelector('#loan-term');
    this.salesTax = element.querySelector('#sales-tax');
    this.calculateButton = element.querySelector('#calculate-payment');
    this.preApprovalButton = element.querySelector('#pre-approval');
    this.resultsContainer = element.querySelector('.calculator-results');
    this.monthlyPayment = element.querySelector('#monthly-payment');
    this.totalInterest = element.querySelector('#total-interest');
    this.totalPayment = element.querySelector('#total-payment');
    this.presetButtons = element.querySelectorAll('.term-preset');
    this.amortizationTable = element.querySelector('.amortization-table tbody');
    this.amortizationToggle = element.querySelector('.show-amortization');
    
    // Optional vehicle input for when calculator is used on a specific vehicle page
    this.vehicleInput = element.dataset.vehicleId;
    
    this.init();
  }
  
  init() {
    // Load vehicle price if available
    if (this.vehicleInput) {
      this.loadVehiclePrice(this.vehicleInput);
    }
    
    // Set up calculation
    if (this.calculateButton) {
      this.calculateButton.addEventListener('click', () => {
        this.calculatePayment();
      });
    }
    
    // Set up pre-approval form
    if (this.preApprovalButton) {
      this.preApprovalButton.addEventListener('click', () => {
        this.showPreApprovalForm();
      });
    }
    
    // Set up term presets
    if (this.presetButtons) {
      this.setupTermPresets();
    }
    
    // Set up amortization toggle
    if (this.amortizationToggle) {
      this.amortizationToggle.addEventListener('click', () => {
        const table = this.element.querySelector('.amortization-schedule');
        table.classList.toggle('hidden');
        this.amortizationToggle.textContent = table.classList.contains('hidden') 
          ? 'Show Amortization Schedule' 
          : 'Hide Amortization Schedule';
      });
    }
  }
  
  loadVehiclePrice(vehicleId) {
    fetch(`/api/vehicle/${vehicleId}`)
      .then(response => response.json())
      .then(data => {
        if (this.vehiclePrice) {
          this.vehiclePrice.value = data.price;
        }
      })
      .catch(error => {
        console.error('Error loading vehicle price:', error);
      });
  }
  
  setupTermPresets() {
    this.presetButtons.forEach(button => {
      button.addEventListener('click', () => {
        const term = button.dataset.term;
        
        // Remove active class from all buttons
        this.presetButtons.forEach(btn => btn.classList.remove('active'));
        
        // Add active class to clicked button
        button.classList.add('active');
        
        // Set loan term
        if (this.loanTerm) {
          this.loanTerm.value = term;
        }
        
        // Calculate if values are filled
        if (this.areRequiredFieldsFilled()) {
          this.calculatePayment();
        }
      });
    });
  }
  
  areRequiredFieldsFilled() {
    return (
      this.vehiclePrice && this.vehiclePrice.value && 
      this.interestRate && this.interestRate.value && 
      this.loanTerm && this.loanTerm.value
    );
  }
  
  calculatePayment() {
    // Get values from inputs
    const price = parseFloat(this.vehiclePrice.value) || 0;
    const downPayment = parseFloat(this.downPayment.value) || 0;
    const tradeIn = parseFloat(this.tradeInValue.value) || 0;
    const interestRate = parseFloat(this.interestRate.value) || 0;
    const loanTermMonths = parseFloat(this.loanTerm.value) || 0;
    const salesTax = parseFloat(this.salesTax.value) || 0;
    
    // Calculate loan amount (price + tax - down payment - trade-in)
    const taxAmount = price * (salesTax / 100);
    const loanAmount = price + taxAmount - downPayment - tradeIn;
    
    // Calculate monthly payment
    if (interestRate === 0) {
      // Simple division for 0% interest
      const payment = loanAmount / loanTermMonths;
      this.updateResults(payment, 0, loanAmount);
    } else {
      // Standard loan formula
      const monthlyRate = interestRate / 100 / 12;
      const payment = loanAmount * (monthlyRate * Math.pow(1 + monthlyRate, loanTermMonths)) / 
                     (Math.pow(1 + monthlyRate, loanTermMonths) - 1);
      
      const totalPayment = payment * loanTermMonths;
      const totalInterest = totalPayment - loanAmount;
      
      this.updateResults(payment, totalInterest, totalPayment);
      this.generateAmortizationSchedule(loanAmount, monthlyRate, payment, loanTermMonths);
    }
    
    // Show results
    if (this.resultsContainer) {
      this.resultsContainer.classList.remove('hidden');
    }
  }
  
  updateResults(monthlyPayment, totalInterest, totalPayment) {
    // Format currency values
    const formatCurrency = (value) => {
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    };
    
    // Update result elements
    if (this.monthlyPayment) {
      this.monthlyPayment.textContent = formatCurrency(monthlyPayment);
    }
    
    if (this.totalInterest) {
      this.totalInterest.textContent = formatCurrency(totalInterest);
    }
    
    if (this.totalPayment) {
      this.totalPayment.textContent = formatCurrency(totalPayment);
    }
  }
  
  generateAmortizationSchedule(loanAmount, monthlyRate, monthlyPayment, loanTermMonths) {
    if (!this.amortizationTable) return;
    
    // Clear existing table
    this.amortizationTable.innerHTML = '';
    
    let remainingBalance = loanAmount;
    let totalInterest = 0;
    
    // Format currency values
    const formatCurrency = (value) => {
      return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(value);
    };
    
    // Generate amortization schedule
    for (let month = 1; month <= loanTermMonths; month++) {
      const interestPayment = remainingBalance * monthlyRate;
      const principalPayment = monthlyPayment - interestPayment;
      
      totalInterest += interestPayment;
      remainingBalance -= principalPayment;
      
      if (remainingBalance < 0) remainingBalance = 0;
      
      // Create table row
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${month}</td>
        <td>${formatCurrency(monthlyPayment)}</td>
        <td>${formatCurrency(principalPayment)}</td>
        <td>${formatCurrency(interestPayment)}</td>
        <td>${formatCurrency(totalInterest)}</td>
        <td>${formatCurrency(remainingBalance)}</td>
      `;
      
      this.amortizationTable.appendChild(row);
    }
  }
  
  showPreApprovalForm() {
    // Create modal for pre-approval form
    const modal = document.createElement('div');
    modal.classList.add('pre-approval-modal');
    
    // Get calculated values for application
    const price = parseFloat(this.vehiclePrice.value) || 0;
    const downPayment = parseFloat(this.downPayment.value) || 0;
    const loanTerm = parseFloat(this.loanTerm.value) || 0;
    
    modal.innerHTML = `
      <div class="modal-content">
        <button class="close-modal">&times;</button>
        <div class="modal-body">
          <h2>Pre-Approval Application</h2>
          <p>Complete the form below to get pre-approved for financing.</p>
          
          <form id="pre-approval-form">
            <div class="form-section">
              <h3>Loan Information</h3>
              <div class="form-row">
                <div class="form-group">
                  <label for="requested-amount">Requested Amount</label>
                  <input type="number" id="requested-amount" name="requestedAmount" value="${price - downPayment}" required>
                </div>
                <div class="form-group">
                  <label for="requested-term">Requested Term</label>
                  <input type="number" id="requested-term" name="requestedTerm" value="${loanTerm}" required>
                </div>
              </div>
            </div>
            
            <div class="form-section">
              <h3>Personal Information</h3>
              <div class="form-row">
                <div class="form-group">
                  <label for="first-name">First Name</label>
                  <input type="text" id="first-name" name="firstName" required>
                </div>
                <div class="form-group">
                  <label for="last-name">Last Name</label>
                  <input type="text" id="last-name" name="lastName" required>
                </div>
              </div>
              <div class="form-group">
                <label for="email">Email Address</label>
                <input type="email" id="email" name="email" required>
              </div>
              <div class="form-group">
                <label for="phone">Phone Number</label>
                <input type="tel" id="phone" name="phone" required>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="birth-date">Date of Birth</label>
                  <input type="date" id="birth-date" name="birthDate" required>
                </div>
                <div class="form-group">
                  <label for="ssn-last4">Last 4 of SSN</label>
                  <input type="text" id="ssn-last4" name="ssnLast4" maxlength="4" pattern="[0-9]{4}" required>
                </div>
              </div>
            </div>
            
            <div class="form-section">
              <h3>Address Information</h3>
              <div class="form-group">
                <label for="street-address">Street Address</label>
                <input type="text" id="street-address" name="streetAddress" required>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="city">City</label>
                  <input type="text" id="city" name="city" required>
                </div>
                <div class="form-group">
                  <label for="state">State</label>
                  <input type="text" id="state" name="state" required>
                </div>
                <div class="form-group">
                  <label for="zip">ZIP Code</label>
                  <input type="text" id="zip" name="zip" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="housing-status">Housing Status</label>
                  <select id="housing-status" name="housingStatus" required>
                    <option value="">Select...</option>
                    <option value="own">Own</option>
                    <option value="rent">Rent</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div class="form-group">
                  <label for="monthly-housing">Monthly Housing Payment</label>
                  <input type="number" id="monthly-housing" name="monthlyHousing" required>
                </div>
              </div>
            </div>
            
            <div class="form-section">
              <h3>Employment & Income</h3>
              <div class="form-group">
                <label for="employer">Employer Name</label>
                <input type="text" id="employer" name="employer" required>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="job-title">Job Title</label>
                  <input type="text" id="job-title" name="jobTitle" required>
                </div>
                <div class="form-group">
                  <label for="employment-length">Years Employed</label>
                  <input type="number" id="employment-length" name="employmentLength" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label for="annual-income">Annual Income</label>
                  <input type="number" id="annual-income" name="annualIncome" required>
                </div>
                <div class="form-group">
                  <label for="other-income">Other Income (Optional)</label>
                  <input type="number" id="other-income" name="otherIncome">
                </div>
              </div>
            </div>
            
            <div class="form-section">
              <h3>Consent</h3>
              <div class="form-group checkbox">
                <input type="checkbox" id="credit-check" name="creditCheckConsent" required>
                <label for="credit-check">I consent to a credit check and authorize Cadillac of South Charlotte to obtain my credit report.</label>
              </div>
              <div class="form-group checkbox">
                <input type="checkbox" id="terms" name="termsConsent" required>
                <label for="terms">I agree to the <a href="/terms">terms and conditions</a> and <a href="/privacy">privacy policy</a>.</label>
              </div>
            </div>
            
            <div class="form-actions">
              <button type="submit" class="submit-button">Submit Application</button>
            </div>
          </form>
        </div>
      </div>
    `;
    
    // Add modal to DOM
    document.body.appendChild(modal);
    
    // Prevent body scrolling
    document.body.classList.add('modal-open');
    
    // Setup close button
    const closeButton = modal.querySelector('.close-modal');
    closeButton.addEventListener('click', () => {
      document.body.removeChild(modal);
      document.body.classList.remove('modal-open');
    });
    
    // Close modal on outside click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
        document.body.classList.remove('modal-open');
      }
    });
    
    // Handle form submission
    const form = modal.querySelector('#pre-approval-form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      
      const formData = new FormData(form);
      const submitButton = form.querySelector('.submit-button');
      
      submitButton.textContent = 'Submitting...';
      submitButton.disabled = true;
      
      fetch('/api/pre-approval', {
        method: 'POST',
        body: formData
      })
      .then(response => response.json())
      .then(data => {
        // Replace form with success message
        const modalBody = modal.querySelector('.modal-body');
        modalBody.innerHTML = `
          <h2>Application Submitted!</h2>
          <div class="success-message">
            <p>Thank you for your application. Your confirmation number is: <strong>${data.confirmationNumber}</strong></p>
            <p>One of our finance specialists will contact you within 24 hours to discuss your options.</p>
            <div class="next-steps">
              <h3>Next Steps:</h3>
              <ul>
                <li>Review your email for confirmation details</li>
                <li>Gather required documents (proof of income, ID, etc.)</li>
                <li>Our finance