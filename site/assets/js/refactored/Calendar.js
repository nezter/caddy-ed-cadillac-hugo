/**
 * Calendar Class
 * Core class that coordinates the scheduling calendar functionality
 */
class Calendar {
  /**
   * Create a new Calendar instance
   * @param {HTMLElement} element - The container element for the calendar
   * @param {Object} options - Configuration options
   */
  constructor(element, options = {}) {
    if (!element) {
      throw new Error('Calendar requires a valid DOM element');
    }
    
    this.element = element;
    this.options = Object.assign({
      // Default options
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm',
      startOfWeek: 0, // 0 = Sunday
      minDate: new Date()
    }, options);
    
    // Initialize state
    this.state = {
      currentMonth: new Date(),
      selectedDate: null,
      selectedTime: null,
      availableDates: [],
      timeSlots: [],
      formData: {},
      isSubmitting: false,
      errors: {}
    };
    
    // Initialize observers array
    this.observers = [];
    
    // Create modules (will be initialized in init())
    this.renderer = null;
    this.timeSlotManager = null;
    this.formManager = null;
    this.eventHandlers = null;
  }
  
  /**
   * Initialize the calendar and its modules
   */
  init() {
    // Ensure all modules are created
    if (!this.renderer || !this.timeSlotManager || !this.formManager || !this.eventHandlers) {
      console.error('Calendar modules not properly initialized');
      return;
    }
    
    // Initialize all modules
    this.renderer.init();
    this.timeSlotManager.init();
    this.formManager.init();
    this.eventHandlers.init({
      renderer: this.renderer,
      timeSlotManager: this.timeSlotManager,
      formManager: this.formManager
    });
    
    // Get available dates for current month
    const currentMonth = this.state.currentMonth;
    this.timeSlotManager.getAvailableDates(
      currentMonth.getFullYear(),
      currentMonth.getMonth()
    );
    
    // Log initialization
    if (this.options.debug) {
      console.debug('Calendar initialized', this.getState());
    }
  }
  
  /**
   * Reset the calendar to initial state
   */
  reset() {
    // Reset to initial state
    this.updateState({
      currentMonth: new Date(),
      selectedDate: null,
      selectedTime: null,
      availableDates: [],
      timeSlots: [],
      formData: {},
      isSubmitting: false,
      appointmentConfirmed: false,
      errors: {}
    });
    
    // Additional reset actions can be added here
    if (this.options.debug) {
      console.debug('Calendar reset to initial state');
    }
  }
  
  /**
   * Update the calendar state and notify observers
   * @param {Object} newState - Partial state to be updated
   */
  updateState(newState) {
    this.state = { ...this.state, ...newState };
    this.notifyObservers();
  }
  
  /**
   * Get the current calendar state
   * @returns {Object} The current state
   */
  getState() {
    return { ...this.state };
  }
  
  /**
   * Add an observer to be notified of state changes
   * @param {Object} observer - An object with an update method
   */
  addObserver(observer) {
    if (observer && typeof observer.update === 'function') {
      this.observers.push(observer);
    }
  }
  
  /**
   * Notify all observers about state changes
   */
  notifyObservers() {
    this.observers.forEach(observer => {
      observer.update(this.getState());
    });
  }
}

export default Calendar;
