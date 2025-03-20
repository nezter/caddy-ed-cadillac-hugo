/**
 * EventHandlers
 * Centralizes event handling for the calendar
 */
class EventHandlers {
  /**
   * Create a new EventHandlers instance
   * @param {Calendar} calendar - The parent Calendar instance
   */
  constructor(calendar) {
    this.calendar = calendar;
    this.element = calendar.element;
    
    // References to other modules
    this.renderer = null;
    this.timeSlotManager = null;
    this.formManager = null;
    
    // Bind methods to maintain context
    this.setupMonthNavigation = this.setupMonthNavigation.bind(this);
    this.setupDateSelection = this.setupDateSelection.bind(this);
    this.setupTimeSlotSelection = this.setupTimeSlotSelection.bind(this);
    this.setupAppointmentType = this.setupAppointmentType.bind(this);
    this.setupVehicleSelect = this.setupVehicleSelect.bind(this);
    this.setupSalesPersonSelect = this.setupSalesPersonSelect.bind(this);
    this.setupFormSubmission = this.setupFormSubmission.bind(this);
  }
  
  /**
   * Initialize event handlers
   * @param {Object} modules - References to other calendar modules
   */
  init(modules) {
    this.renderer = modules.renderer;
    this.timeSlotManager = modules.timeSlotManager;
    this.formManager = modules.formManager;
    
    // Set up all event listeners
    this.setupMonthNavigation();
    this.setupDateSelection();
    this.setupTimeSlotSelection();
    this.setupAppointmentType();
    this.setupVehicleSelect();
    this.setupSalesPersonSelect();
    this.setupFormSubmission();
  }
  
  /**
   * Set up month navigation events
   */
  setupMonthNavigation() {
    const prevButton = this.element.querySelector('.prev-month');
    const nextButton = this.element.querySelector('.next-month');
    
    if (prevButton) {
      prevButton.addEventListener('click', () => {
        const state = this.calendar.getState();
        const newMonth = new Date(state.currentMonth);
        newMonth.setMonth(newMonth.getMonth() - 1);
        this.calendar.updateState({ currentMonth: newMonth });
      });
    }
    
    if (nextButton) {
      nextButton.addEventListener('click', () => {
        const state = this.calendar.getState();
        const newMonth = new Date(state.currentMonth);
        newMonth.setMonth(newMonth.getMonth() + 1);
        this.calendar.updateState({ currentMonth: newMonth });
      });
    }
  }
  
  /**
   * Set up date selection events using event delegation
   */
  setupDateSelection() {
    if (!this.element) return;
    
    this.element.addEventListener('click', (event) => {
      // Find if click was on an available date cell
      const dateCell = event.target.closest('.calendar-day.available');
      if (!dateCell) return;
      
      // Get date from the cell
      const dateAttr = dateCell.getAttribute('data-date');
      if (!dateAttr) return;
      
      // Parse the date string (format: YYYY-MM-DD)
      const [year, month, day] = dateAttr.split('-').map(num => parseInt(num, 10));
      const selectedDate = new Date(year, month - 1, day); // Month is 0-based in JS Date
      
      // Select the date
      this.timeSlotManager.selectDate(selectedDate);
    });
  }
  
  /**
   * Set up time slot selection events using event delegation
   */
  setupTimeSlotSelection() {
    if (!this.element) return;
    
    const timeSlotContainer = this.element.querySelector('.time-slots');
    if (!timeSlotContainer) return;
    
    timeSlotContainer.addEventListener('click', (event) => {
      // Find if click was on a time slot
      const timeSlot = event.target.closest('.time-slot');
      if (!timeSlot) return;
      
      // Get time from the slot
      const time = timeSlot.getAttribute('data-time');
      if (!time) return;
      
      // Select the time slot
      this.timeSlotManager.selectTimeSlot(time);
    });
  }
  
  /**
   * Set up appointment type selection events
   */
  setupAppointmentType() {
    const appointmentType = this.element.querySelector('.appointment-type');
    
    if (appointmentType) {
      appointmentType.addEventListener('change', (e) => {
        this.calendar.updateState({ appointmentType: e.target.value });
      });
    }
  }
  
  /**
   * Set up vehicle selection events
   */
  setupVehicleSelect() {
    const vehicleSelect = this.element.querySelector('.vehicle-select');
    
    if (vehicleSelect) {
      vehicleSelect.addEventListener('change', (e) => {
        this.calendar.updateState({ selectedVehicle: e.target.value });
      });
    }
  }
  
  /**
   * Set up sales person selection events
   */
  setupSalesPersonSelect() {
    const salesPersonSelect = this.element.querySelector('.salesperson-select');
    
    if (salesPersonSelect) {
      salesPersonSelect.addEventListener('change', (e) => {
        this.calendar.updateState({ selectedSalesPerson: e.target.value });
      });
    }
  }
  
  /**
   * Set up form submission events
   */
  setupFormSubmission() {
    const customerForm = this.element.querySelector('.customer-info-form');
    
    if (customerForm) {
      customerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.formManager.confirmAppointment();
      });
    }
  }
}

export default EventHandlers;
