/**
 * Finance Calculator
 * Allows users to calculate monthly payments based on price, down payment, interest rate, and term
 */

class FinanceCalculator {
  constructor(options = {}) {
    this.container = options.container || document.querySelector('.finance-calculator');
    this.vehiclePrice = options.price || 0;
    this.downPayment = options.downPayment || 0;
    this.interestRate = options.interestRate || 4.9;
    this.term = options.term || 60;
    this.results = null;
    
    if (this.container) {
      this.initialize();
    }
  }
  
  initialize() {
    // Set up the calculator form
    this.createCalculatorForm();
    
    // Initialize event listeners
    this.initializeEvents();
    
    // If we have a vehicle price already, set it in the form
    if (this.vehiclePrice > 0) {
      const priceInput = this.container.querySelector('#vehicle-price');
      if (priceInput) {
        priceInput.value = this.vehiclePrice;
      }
    }
    
    // Calculate initial results
    this.calculatePayment();
  }
  
  createCalculatorForm() {
    // Only create the form if it doesn't exist
    if (this.container.querySelector('form')) return;
    
    const form = document.createElement('form');
    form.className = 'calculator-form';
    form.setAttribute('novalidate', true);
    
    form.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label for="vehicle-price">Vehicle Price ($)</label>
          <input type="number" id="vehicle-price" name="vehicle-price" min="0" step="100" value="${this.vehiclePrice}" required>
        </div>
        <div class="form-group">
          <label for="down-payment">Down Payment ($)</label>
          <input type="number" id="down-payment" name="down-payment" min="0" step="100" value="${this.downPayment}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label for="interest-rate">Interest Rate (%)</label>
          <input type="number" id="interest-rate" name="interest-rate" min="0" max="20" step="0.1" value="${this.interestRate}" required>
        </div>
        <div class="form-group">
          <label for="loan-term">Loan Term (months)</label>
          <select id="loan-term" name="loan-term" required>
            <option value="24" ${this.term === 24 ? 'selected' : ''}>24 months (2 years)</option>
            <option value="36" ${this.term === 36 ? 'selected' : ''}>36 months (3 years)</option>
            <option value="48" ${this.term === 48 ? 'selected' : ''}>48 months (4 years)</option>
            <option value="60" ${this.term === 60 ? 'selected' : ''}>60 months (5 years)</option>
            <option value="72" ${this.term === 72 ? 'selected' : ''}>72 months (6 years)</option>
            <option value="84" ${this.term === 84 ? 'selected' : ''}>84 months (7 years)</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="calculator-button" id="calculate-btn">Calculate Payment</button>
      </div>
      
      <div class="calculator-results">
        <div class="result-item">
          <span class="result-label">Monthly Payment:</span>
          <span class="result-value" id="monthly-payment">$0</span>
        </div>
        <div class="result-item">
          <span class="result-label">Loan Amount:</span>
          <span class="result-value" id="loan-amount">$0</span>
        </div>
        <div class="result-item">
          <span class="result-label">Total Interest:</span>
          <span class="result-value" id="total-interest">$0</span>
        </div>
        <div class="result-item">
          <span class="result-label">Total Cost:</span>
          <span class="result-value" id="total-cost">$0</span>
        </div>
      </div>
      
      <div class="calculator-disclaimer">
        <p>This calculator is for estimation purposes only. Your actual payment may vary based on credit approval, final pricing, taxes, fees, and other factors.</p>
      </div>
    `;
    
    this.container.appendChild(form);
  }
  
  initializeEvents() {
    const calculateBtn = this.container.querySelector('#calculate-btn');
    if (calculateBtn) {
      calculateBtn.addEventListener('click', () => this.calculatePayment());
    }
    
    // Add input event listeners to auto-calculate on change
    const inputs = this.container.querySelectorAll('input, select');
    inputs.forEach(input => {
      input.addEventListener('change', () => this.calculatePayment());
    });
    
    // Handle form submission
    const form = this.container.querySelector('form');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        this.calculatePayment();
      });
    }
  }
  
  calculatePayment() {
    // Get values from form
    const priceInput = this.container.querySelector('#vehicle-price');
    const downPaymentInput = this.container.querySelector('#down-payment');
    const interestRateInput = this.container.querySelector('#interest-rate');
    const termInput = this.container.querySelector('#loan-term');
    
    if (!priceInput || !downPaymentInput || !interestRateInput || !termInput) {
      console.error('Missing calculator inputs');
      return;
    }
    
    // Parse values
    const price = parseFloat(priceInput.value) || 0;
    const downPayment = parseFloat(downPaymentInput.value) || 0;
    const interestRate = parseFloat(interestRateInput.value) || 0;
    const term = parseInt(termInput.value) || 60;
    
    // Calculate loan amount
    const loanAmount = price - downPayment;
    
    if (loanAmount <= 0) {
      this.updateResults(0, 0, 0, price);
      return;
    }
    
    // Calculate monthly payment
    const monthlyInterest = interestRate / 100 / 12;
    let monthlyPayment = 0;
    
    if (monthlyInterest === 0) {
      monthlyPayment = loanAmount / term;
    } else {
      monthlyPayment = loanAmount * 
        (monthlyInterest * Math.pow(1 + monthlyInterest, term)) / 
        (Math.pow(1 + monthlyInterest, term) - 1);
    }
    
    // Calculate total interest
    const totalPayment = monthlyPayment * term;
    const totalInterest = totalPayment - loanAmount;
    const totalCost = totalPayment + downPayment;
    
    // Store results
    this.results = {
      monthlyPayment,
      loanAmount,
      totalInterest,
      totalCost
    };
    
    // Update the UI
    this.updateResults(monthlyPayment, loanAmount, totalInterest, totalCost);
  }
  
  updateResults(monthlyPayment, loanAmount, totalInterest, totalCost) {
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    });
    
    const monthlyPaymentElement = this.container.querySelector('#monthly-payment');
    const loanAmountElement = this.container.querySelector('#loan-amount');
    const totalInterestElement = this.container.querySelector('#total-interest');
    const totalCostElement = this.container.querySelector('#total-cost');
    
    if (monthlyPaymentElement) {
      monthlyPaymentElement.textContent = formatter.format(monthlyPayment);
    }
    
    if (loanAmountElement) {
      loanAmountElement.textContent = formatter.format(loanAmount);
    }
    
    if (totalInterestElement) {
      totalInterestElement.textContent = formatter.format(totalInterest);
    }
    
    if (totalCostElement) {
      totalCostElement.textContent = formatter.format(totalCost);
    }
  }
  
  getResults() {
    return this.results;
  }
}

// Initialize the calculator if it's on the page
document.addEventListener('DOMContentLoaded', () => {
  const calculatorElement = document.querySelector('.finance-calculator');
  if (calculatorElement) {
    // Check if we have a price from the page
    const vehiclePrice = parseFloat(calculatorElement.dataset.vehiclePrice) || 0;
    
    new FinanceCalculator({
      container: calculatorElement,
      price: vehiclePrice
    });
  }
});

export default FinanceCalculator;
