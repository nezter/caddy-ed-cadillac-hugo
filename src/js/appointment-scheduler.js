/**
 * Appointment Scheduler
 * Handles appointment scheduling with sales representatives
 */
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
    // This would normally fetch from an API, but for demo purposes we'll use mock data
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve([
          {
            id: 'rep1',
            name: 'John Smith',
            position: 'Sales Consultant',
            image: '/images/sales-reps/john-smith.jpg',
            specialties: ['Escalade', 'CT5']
          },
          {
            id: 'rep2',
            name: 'Sarah Johnson',
            position: 'Senior Sales Consultant',
            image: '/images/sales-reps/sarah-johnson.jpg',
            specialties: ['XT5', 'XT6']
          },
          {
            id: 'rep3',
            name: 'Miguel Rodriguez',
            position: 'Sales Manager',
            image: '/images/sales-reps/miguel-rodriguez.jpg',
            specialties: ['Luxury Vehicles', 'Financing']
          },
          {
            id: 'rep4',
            name: 'Emily Chen',
            position: 'Client Advisor',
            image: '/images/sales-reps/emily-chen.jpg',
            specialties: ['Lyriq', 'Electric Vehicles']
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
    
    showError(message) {
      console.error(message);
      // Display error to the user
    }
    
    updateAvailableTimes() {
      // Implementation for updating available times based on selected rep and date
      console.log(`Updating times for rep: ${this.selectedRep} on date: ${this.selectedDate}`);
    }
  }