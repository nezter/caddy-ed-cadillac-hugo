/**
 * Appointment Scheduler
 * Handles appointment scheduling with sales representatives
 */
// Kept in a constant so the endpoint is greppable in one place. The
// endpoint gate in ci/verify-endpoints.js scans for literals like this and
// fails the build if the function is renamed or the call is deleted.
const ENDPOINT = '/.netlify/functions/schedule-test-drive';

class AppointmentScheduler {
  constructor() {
    this.appointmentForm = document.getElementById('appointment-form');
    this.salesRepSelector = document.getElementById('sales-rep-selector');
    this.dateSelector = document.getElementById('appointment-date');
    this.timeSelector = document.getElementById('appointment-time');
    this.appointmentType = document.getElementById('appointment-type');
    this.availabilityContainer = document.getElementById('time-availability');
    
    if (!this.appointmentForm) return;
    
    // State
    this.salesReps = [];
    this.selectedDate = null;
    this.selectedRep = null;
    this.availableTimes = [];
    this.timeSlotDuration = 30; // minutes

    // The submit machinery. The status line lives in the page markup
    // (site/content/test-drive.md); it is created here for robustness if an
    // older build of the page is still cached without it.
    this.submitButton = this.appointmentForm.querySelector('button[type="submit"]');
    this.status = document.getElementById('appointment-status');
    if (!this.status) {
      this.status = document.createElement('p');
      this.status.id = 'appointment-status';
      this.status.className = 'form-message';
      this.status.setAttribute('role', 'status');
      this.status.hidden = true;
      this.appointmentForm.appendChild(this.status);
    }

    // Initialize
    this.init();
  }
  
  init() {
    // Fetch sales reps
    this.fetchSalesReps()
      .then(reps => {
        this.salesReps = reps;
        this.populateSalesReps();
      })
      .catch(error => {
        console.error('Failed to fetch sales reps:', error);
        this.showError('Unable to load sales representatives. Please try again or call us directly.');
      });
    
    // Set up event listeners
    this.setupEventListeners();

    // Time choices and submission. The select shipped with only its
    // placeholder option -- nothing ever filled it -- and nothing ever
    // handled the submit; see setupSubmit() for the rest of that story.
    this.setupTimeOptions();
    this.setupSubmit();

    // Set default date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (this.dateSelector) {
      this.dateSelector.min = tomorrow.toISOString().split('T')[0];
      this.dateSelector.value = tomorrow.toISOString().split('T')[0];
      this.selectedDate = tomorrow;
    }
  }
  
  fetchSalesReps() {
    // There is one sales specialist here, not a team. The mock data this replaced
    // invented four reps with stock photos that exist nowhere in the build, and a
    // visitor who picked "Sarah Johnson" would have been booking with nobody.
    //
    // The id is stable so a future multi-rep feed can replace this array without
    // touching the rendering code.
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          {
            id: 'caddy-ed',
            name: 'Caddy Ed',
            position: 'Sales Specialist',
            image: null,
            specialties: ['All models']
          }
        ]);
      }, 500);
    });
  }
  
    populateSalesReps() {
      if (!this.salesRepSelector) return;
      
      let options = '<option value="">Select a Sales Representative</option>';
      options += '<option value="any">Any Available Representative</option>';
      
      this.salesReps.forEach(rep => {
        options += `<option value="${rep.id}">${rep.name} - ${rep.position}</option>`;
      });
      
      this.salesRepSelector.innerHTML = options;
      
      // Check if there's a pre-selected rep (from URL)
      const urlParams = new URLSearchParams(window.location.search);
      const preSelectedRep = urlParams.get('rep');
      
      if (preSelectedRep) {
        this.salesRepSelector.value = preSelectedRep;
        this.selectedRep = preSelectedRep;
      }
    }
  
    setupEventListeners() {
      // Add event listeners for form elements
      if (this.salesRepSelector) {
        this.salesRepSelector.addEventListener('change', (e) => {
          this.selectedRep = e.target.value;
          this.updateAvailableTimes();
        });
      }
      
      if (this.dateSelector) {
        this.dateSelector.addEventListener('change', (e) => {
          this.selectedDate = new Date(e.target.value);
          this.updateAvailableTimes();
        });
      }
    }
    
    /** Mirror the booking forms' time choices: 9:00 am to 6:00 pm. */
    setupTimeOptions() {
      if (!this.timeSelector || this.timeSelector.options.length > 1) return;
      for (let h = 9; h <= 18; h++) {
        const value = String(h).padStart(2, '0') + ':00';
        const label = h < 12 ? h + ':00 am' : h === 12 ? '12:00 pm' : (h - 12) + ':00 pm';
        this.timeSelector.appendChild(new Option(label, value));
      }
    }

    /**
     * Submit the appointment request.
     *
     * This form posted to /api/appointments -- a path that resolves to
     * NOTHING: the blanket /api/* rewrite was removed from netlify.toml and
     * no function answers there, so "Request this appointment" could never
     * succeed. It now posts exactly the way the test-drive forms do, to
     * schedule-test-drive, with its fields mapped to that function's names
     * ('general-enquiry' because this form does not name a specific car).
     */
    setupSubmit() {
      if (!this.appointmentForm) return;
      this.appointmentForm.addEventListener('submit', (event) => {
        event.preventDefault();
        const name = (document.getElementById('appointment-name') || {}).value || '';
        const email = (document.getElementById('appointment-email') || {}).value || '';
        const phone = (document.getElementById('appointment-phone') || {}).value || '';
        const date = this.dateSelector ? this.dateSelector.value : '';
        const time = this.timeSelector ? this.timeSelector.value : '';

        const fail = (text, focusEl) => {
          this.setStatus('error', text);
          if (focusEl) focusEl.focus();
        };
        if (!String(name).trim()) return fail('Please add your name.', document.getElementById('appointment-name'));
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) return fail('Please add a valid email address.', document.getElementById('appointment-email'));
        if (String(phone).replace(/\D/g, '').length < 7) return fail('Please add a phone number Ed can confirm on.', document.getElementById('appointment-phone'));
        if (!date) return fail('Please choose a day.', this.dateSelector);
        if (!time) return fail('Please choose a time.', this.timeSelector);

        const typeLabel = this.appointmentType && this.appointmentType.selectedIndex >= 0
          ? this.appointmentType.options[this.appointmentType.selectedIndex].text : '';
        const repLabel = this.salesRepSelector && this.salesRepSelector.selectedIndex >= 0
          ? this.salesRepSelector.options[this.salesRepSelector.selectedIndex].text : '';

        const payload = {
          vehicleId: 'general-enquiry',
          vehicleTitle: '',
          fullName: String(name).trim(),
          email: String(email).trim(),
          phone: String(phone).trim(),
          preferredDate: date,
          preferredTime: time,
          comments: 'Appointment type: ' + typeLabel + '. Representative: ' + repLabel + '.',
        };

        const idle = this.submitButton ? this.submitButton.textContent : '';
        if (this.submitButton) {
          this.submitButton.disabled = true;
          this.submitButton.textContent = 'Sending\u2026';
        }
        this.setStatus('pending', 'Sending your request\u2026');

        fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(payload),
        })
          .then((response) => response.json().catch(() => ({})).then((body) => ({ ok: response.ok, body })))
          .then((result) => {
            if (result.ok && result.body && result.body.success) {
              this.setStatus('success', 'Request sent for ' + date + ' at ' + time +
                ". I'll confirm the exact time shortly \u2014 usually the same day.");
              this.appointmentForm.reset();
              if (this.submitButton) { this.submitButton.disabled = false; this.submitButton.textContent = idle; }
              return;
            }
            const message = (result.body && result.body.message) ||
              'The request could not be sent. Please try again, or call ' + (this.appointmentForm.dataset.phone || '803-431-6180') + '.';
            this.setStatus('error', message);
            if (this.submitButton) { this.submitButton.disabled = false; this.submitButton.textContent = 'Try again'; }
          })
          .catch(() => {
            this.setStatus('error', 'The request could not be sent. Please try again, or call ' +
              (this.appointmentForm.dataset.phone || '803-431-6180') + '.');
            if (this.submitButton) { this.submitButton.disabled = false; this.submitButton.textContent = 'Try again'; }
          });
      });
    }

    setStatus(kind, text) {
      if (!this.status) return;
      this.status.className = 'form-message' +
        (kind === 'error' ? ' form-message--error' : kind === 'success' ? ' form-message--success' : '');
      this.status.textContent = text;
      this.status.hidden = false;
    }

    showError(message) {
      console.error(message);
      // Display error to the user
    }
    
    updateAvailableTimes() {
      // Implementation for updating available times based on selected rep and date
      console.log(`Updating times for rep: ${this.selectedRep} on date: ${this.selectedDate}`);
    }
  }

// The class must actually run. There was no `new AppointmentScheduler()`
// anywhere in this repository, which is why this form was inert on arrival
// as well as pointed at a dead endpoint.
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('appointment-form')) new AppointmentScheduler();
});