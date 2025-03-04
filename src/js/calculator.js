document.addEventListener('DOMContentLoaded', function() {
  // Find all payment calculator buttons
  const calculatorButtons = document.querySelectorAll('.calculate-payment');
  
  calculatorButtons.forEach(button => {
    button.addEventListener('click', function() {
      const vehiclePrice = parseFloat(this.dataset.price || 0);
      const vehicleYear = this.dataset.year || '';
      const vehicleMake = this.dataset.make || '';
      const vehicleModel = this.dataset.model || '';
      
      showCalculator({
        price: vehiclePrice,
        year: vehicleYear,
        make: vehicleMake,
        model: vehicleModel
      });
    });
  });
  
  function showCalculator(vehicle) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'modal calculator-modal';
    
    modal.innerHTML = `
      <div class="modal-content">
        <span class="close">&times;</span>
        <div class="calculator-container">
          <h2>Payment Calculator</h2>
          <h3>${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>
          <p class="vehicle-price">Vehicle Price: $${formatNumber(vehicle.price)}</p>
          
          <form id="payment-calculator">
            <div class="form-row">
              <div class="form-group">
                <label for="down-payment">Down Payment</label>
                <input type="number" id="down-payment" name="downPayment" value="${Math.round(vehicle.price * 0.1)}" min="0">
              </div>
              <div class="form-group">
                <label for="trade-in-value">Trade-In Value</label>
                <input type="number" id="trade-in-value" name="tradeInValue" value="0" min="0">
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label for="interest-rate">Interest Rate (%)</label>
                <input type="number" id="interest-rate" name="interestRate" value="3.9" min="0" step="0.1">
              </div>
              <div class="form-group">
                <label for="loan-term">Loan Term (months)</label>
                <select id="loan-term" name="loanTerm">
                  <option value="36">36 months</option>
                  <option value="48">48 months</option>
                  <option value="60" selected>60 months</option>
                  <option value="72">72 months</option>
                  <option value="84">84 months</option>
                </select>
              </div>
            </div>
            
            <div class="calculator-results">
              <div class="result">
                <span class="label">Estimated Monthly Payment:</span>
                <span class="value" id="monthly-payment">$0</span>
              </div>
              <div class="result">
                <span class="label">Total Loan Amount:</span>
                <span class="value" id="loan-amount">$0</span>
              </div>
              <div class="result">
                <span class="label">Total Interest Paid:</span>
                <span class="value" id="total-interest">$0</span>
              </div>
            </div>
            
            <button type="button" class="btn btn-primary" id="calculate-button">Calculate</button>
            <div class="disclaimer">
              <p>This calculator provides estimates only and does not represent an offer of credit. 
              Actual rates and terms will vary based on creditworthiness and other factors.</p>
            </div>
          </form>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Set up calculator functionality
    const form = document.getElementById('payment-calculator');
    const calculateButton = document.getElementById('calculate-button');
    
    calculateButton.addEventListener('click', function() {
      calculatePayment(vehicle.price);
    });
    
    // Initial calculation
    calculatePayment(vehicle.price);
    
    // Close modal when clicking X or outside the modal
    const closeBtn = modal.querySelector('.close');
    closeBtn.addEventListener('click', () => {
      modal.remove();
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    // Prevent closing when clicking inside the modal content
    const modalContent = modal.querySelector('.modal-content');
    modalContent.addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }
  
  function calculatePayment(vehiclePrice) {
    const downPayment = parseFloat(document.getElementById('down-payment').value) || 0;
    const tradeInValue = parseFloat(document.getElementById('trade-in-value').value) || 0;
    const interestRate = parseFloat(document.getElementById('interest-rate').value) || 0;
    const loanTerm = parseInt(document.getElementById('loan-term').value) || 60;
    
    // Calculate loan amount
    const loanAmount = vehiclePrice - downPayment - tradeInValue;
    
    // Calculate monthly payment (PMT formula)
    const monthlyInterestRate = interestRate / 100 / 12;
    let monthlyPayment = 0;
    
    if (monthlyInterestRate === 0) {
      monthlyPayment = loanAmount / loanTerm;
    } else {
      monthlyPayment = loanAmount * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, loanTerm) / 
                      (Math.pow(1 + monthlyInterestRate, loanTerm) - 1);
    }
    
    // Calculate total interest
    const totalInterest = (monthlyPayment * loanTerm) - loanAmount;
    
    // Update results
    document.getElementById('monthly-payment').textContent = '$' + formatNumber(monthlyPayment.toFixed(2));
    document.getElementById('loan-amount').textContent = '$' + formatNumber(loanAmount.toFixed(2));
    document.getElementById('total-interest').textContent = '$' + formatNumber(totalInterest.toFixed(2));
  }
  
  function formatNumber(number) {
    return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  }
});
