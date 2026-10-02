/**
 * Financing Calculator Component
 * Helps users calculate monthly payments and explore financing options
 */

/**
 * Escape a value for interpolation into innerHTML.
 *
 * The pre-approval result panel is built from strings that partly come from the
 * server and partly from the failed request itself (`err.message`, the list of
 * missing fields). Those are not attacker-controlled in the ordinary sense, but
 * writing them into innerHTML unescaped means one future field that IS
 * customer-supplied turns this panel into an injection point.
 *
 * It is defined here rather than assumed: this file had no such helper, and
 * three call sites were written against one that did not exist -- which would
 * have thrown ReferenceError on the success path and turned a working submission
 * into "Not sent".
 */
function escapeHtml(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

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
    fetch(`/.netlify/functions/vehicle-details/${vehicleId}`)
      .then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
          })
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
        <button type="button" class="close-modal" aria-label="Close">&times;</button>
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
    
    // Close: the top ×, the "Done" button the success panel renders, and a
    // click on the backdrop. ONE delegated listener on the modal, because the
    // panel is REPLACED after a successful submission -- binding the buttons
    // directly bound only the ones that existed at open time, so "Done" on
    // the success panel was a button that did nothing at all.
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('.close-modal')) {
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
      
      // JSON, not FormData.
      //
      // This posted `body: formData` -- multipart/form-data -- and the function
      // does `JSON.parse(event.body)`. That throws, the function answers 400
      // `{error: 'Invalid JSON body'}`, and this code never looked at the status:
      // it went straight to rendering the success panel. So the customer was
      // shown "Application Submitted! Your confirmation number is: undefined" for
      // a request that was rejected, recorded nothing, and emailed nothing.
      const payload = {};
      formData.forEach((value, key) => { payload[key] = value; });

      fetch('/.netlify/functions/pre-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      .then(response =>
        response.json().catch(() => ({})).then(data => ({ ok: response.ok, status: response.status, data }))
      )
      .then(({ ok, status, data }) => {
        const modalBody = modal.querySelector('.modal-body');

        // Anything that is not a 2xx says what went wrong and offers a retry.
        // A failed submission must never reach the success panel -- that is the
        // whole bug this function had.
        if (!ok) {
          const missing = Array.isArray(data.fields) && data.fields.length
            ? ' Still needed: ' + data.fields.join(', ') + '.'
            : '';
          modalBody.innerHTML =
            '<h2>Not sent</h2>' +
            '<div class="success-message">' +
              '<p>' + escapeHtml(String(data.error || data.message || ('The request failed (HTTP ' + status + ').'))) + escapeHtml(missing) + '</p>' +
              '<p>Please try again, or call the dealership and we will take the details over the phone.</p>' +
            '</div>';
          submitButton.disabled = false;
          submitButton.textContent = 'Try again';
          return;
        }

        // The wording is taken FROM the response rather than written here, so the
        // modal and the server cannot drift into telling the customer two
        // different stories about the same submission. There is no confirmation
        // number to print -- the function returns null on purpose, because no
        // lender integration exists yet.
        modalBody.innerHTML = `
          <h2>${data.received ? 'Application received' : 'Not received'}</h2>
          <div class="success-message">
            <p>${escapeHtml(String(data.message || ''))}</p>
            <p>We have your details and one of our finance specialists will call you about your options.</p>
            <div class="next-steps">
              <h3>Next Steps:</h3>
              <ul>
                <li>Gather required documents (proof of income, ID, etc.)</li>
                <li>Our finance specialist will call to walk through rates and terms</li>
                  <li>Bring a driver's licence and proof of income to the appointment</li>
                </ul>
              </div>
              <button type="button" class="close-modal">Done</button>
            </div>
          `;
      })
      .catch(err => {
        // There was no .catch at all, so any network failure -- offline, DNS, a
        // 502 from the platform -- left the button disabled and reading
        // "Submitting..." for ever, with no message and no way back except
        // reloading the page and losing the form.
        const modalBody = modal.querySelector('.modal-body');
        if (modalBody) {
          modalBody.innerHTML =
            '<h2>Not sent</h2>' +
            '<div class="success-message">' +
              '<p>Could not reach the server: ' + escapeHtml(err.message) + '</p>' +
              '<p>Please try again, or call the dealership.</p>' +
            '</div>';
        }
        submitButton.disabled = false;
        submitButton.textContent = 'Try again';
      });
    });
  }
}

/**
 * Mount, on request only.
 *
 * This used to run on DOMContentLoaded, which meant the calculator was live
 * on every visit to /financing/. Two of its code paths call endpoints that do
 * not exist -- loadVehiclePrice hits /api/vehicle/<id>, and the pre-approval
 * modal posts to /api/pre-approval -- so a visitor who filled the form in saw
 * either a silent failure or a fake confirmation.
 *
 * It is now opt-in. The page renders a toggle that is OFF by default; the
 * calculator does not exist in the DOM until the visitor turns it on, and
 * until then no field is focusable and no handler is attached. That is a dead
 * form, which is the correct state for a calculator that cannot honestly
 * finish what it starts.
 *
 * When the endpoints exist this becomes a one-line change back: call
 * mountFinancingCalculator() from the toggle's click handler without the gate,
 * or drop the hidden attribute from the container.
 */
function mountFinancingCalculator() {
  const el = document.getElementById('financing-calculator');
  if (!el || el.dataset.mounted === 'true') return;
  el.dataset.mounted = 'true';
  el.hidden = false;
  el.setAttribute('aria-hidden', 'false');
  return new FinancingCalculator(el);
}

function initFinancingToggle() {
  const toggle = document.getElementById('financing-calculator-toggle');
  const el = document.getElementById('financing-calculator');
  if (!toggle || !el) return;

  // The container starts hidden and stays that way until the visitor acts.
  el.hidden = true;
  el.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'financing-calculator');

  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    if (open) {
      el.hidden = true;
      el.setAttribute('aria-hidden', 'true');
    } else {
      mountFinancingCalculator();
    }
  });
}

document.addEventListener('DOMContentLoaded', initFinancingToggle);

export default FinancingCalculator;
export { mountFinancingCalculator, initFinancingToggle };
