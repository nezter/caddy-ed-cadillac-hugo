/**
 * TimeSlotManager
 * Manages time slot data and API interactions
 */
class TimeSlotManager {
  /**
   * Create a new TimeSlotManager
   * @param {Calendar} calendar - The parent Calendar instance
   */
  constructor(calendar) {
    this.calendar = calendar;
    
    // Bind methods to maintain context
    this.getAvailableDates = this.getAvailableDates.bind(this);
    this.getTimeSlots = this.getTimeSlots.bind(this);
    this.selectDate = this.selectDate.bind(this);
    this.selectTimeSlot = this.selectTimeSlot.bind(this);
    
    // API endpoints
    this.endpoints = {
      availableDates: '/api/available-dates',
      timeSlots: '/api/available-times'
    };
  }
  
  /**
   * Initialize the time slot manager
   */
  init() {
    // Register as observer if needed
    // this.calendar.addObserver(this);
    
    // Set up initial state
    const today = new Date();
    this.getAvailableDates(today.getFullYear(), today.getMonth());
  }
  
  /**
   * Get available dates for a specified month
   * @param {number} year - The year
   * @param {number} month - The month (0-11)
   * @returns {Promise<Array>} Promise resolving to available dates
   */
  async getAvailableDates(year, month) {
    try {
      // Attempt to fetch from API
      const url = new URL(this.endpoints.availableDates, window.location.origin);
      url.searchParams.append('year', year);
      url.searchParams.append('month', month + 1); // API expects 1-based month
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const availableDates = data.availableDates || [];
      
      // Update state with available dates
      this.calendar.updateState({ availableDates });
      
      return availableDates;
    } catch (error) {
      console.error('Error fetching available dates:', error);
      this.calendar.updateState({ 
        errors: { 
          ...this.calendar.getState().errors, 
          datesFetch: 'Failed to load available dates'
        }
      });
      
      // Fallback to simulated data
      const fallbackDates = this.getFallbackDates(year, month);
      this.calendar.updateState({ availableDates: fallbackDates });
      return fallbackDates;
    }
  }
  
  /**
   * Generate fallback dates when API fails
   * @param {number} year - The year
   * @param {number} month - The month (0-11)
   * @returns {Array} Array of available date strings
   */
  getFallbackDates(year, month) {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const availableDates = [];
    const today = new Date();
    
    // Make weekdays (Monday-Saturday) available, excluding past dates
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const isPast = date < new Date(today.setHours(0, 0, 0, 0));
      const isSunday = date.getDay() === 0;
      
      // Only include future dates that aren't Sundays
      if (!isPast && !isSunday) {
        availableDates.push(this.formatDateString(year, month + 1, day));
      }
    }
    
    return availableDates;
  }
  
  /**
   * Get available time slots for a specific date
   * @param {Date} date - The selected date
   * @returns {Promise<Array>} Promise resolving to available time slots
   */
  async getTimeSlots(date) {
    if (!date) return [];
    
    try {
      // Format date for API
      const formattedDate = date.toISOString().split('T')[0];
      
      // Attempt to fetch from API
      const url = new URL(this.endpoints.timeSlots, window.location.origin);
      url.searchParams.append('date', formattedDate);
      
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      const timeSlots = data.timeSlots || [];
      
      // Update state with time slots
      this.calendar.updateState({ timeSlots });
      
      return timeSlots;
    } catch (error) {
      console.error('Error fetching time slots:', error);
      this.calendar.updateState({ 
        errors: { 
          ...this.calendar.getState().errors, 
          slotsFetch: 'Failed to load time slots'
        }
      });
      
      // Fallback to simulated data
      const fallbackSlots = this.getFallbackTimeSlots(date);
      this.calendar.updateState({ timeSlots: fallbackSlots });
      return fallbackSlots;
    }
  }
  
  /**
   * Generate fallback time slots when API fails
   * @param {Date} date - The selected date
   * @returns {Array} Array of available time slots
   */
  getFallbackTimeSlots(date) {
    const timeSlots = [];
    const day = date.getDay();
    
    // Business hours (10am - 6pm for weekdays, 9am - 5pm for Saturday)
    if (day >= 1 && day <= 5) { // Monday to Friday
      for (let hour = 10; hour < 18; hour++) {
        timeSlots.push(`${hour}:00`);
        timeSlots.push(`${hour}:30`);
      }
    } else if (day === 6) { // Saturday
      for (let hour = 9; hour < 17; hour++) {
        timeSlots.push(`${hour}:00`);
        timeSlots.push(`${hour}:30`);
      }
    }
    
    return timeSlots;
  }
  
  /**
   * Handle date selection
   * @param {Date} date - The selected date
   */
  selectDate(date) {
    if (!date) return;
    
    // Update state with selected date
    this.calendar.updateState({ 
      selectedDate: date,
      selectedTime: null,
      timeSlots: [] // Clear time slots until new ones are loaded
    });
    
    // Fetch available time slots for the selected date
    this.getTimeSlots(date);
  }
  
  /**
   * Handle time slot selection
   * @param {string} time - The selected time
   */
  selectTimeSlot(time) {
    if (!time) return;
    
    // Update state with selected time
    this.calendar.updateState({ selectedTime: time });
  }
  
  /**
   * Format date as a string (YYYY-MM-DD)
   * @param {number} year - The year
   * @param {number} month - The month (1-12)
   * @param {number} day - The day of month
   * @returns {string} Formatted date string
   */
  formatDateString(year, month, day) {
    // Ensure month and day are zero-padded
    const paddedMonth = month.toString().padStart(2, '0');
    const paddedDay = day.toString().padStart(2, '0');
    
    return `${year}-${paddedMonth}-${paddedDay}`;
  }
  
  /**
   * Check if a date is available for booking
   * @param {Date} date - Date to check
   * @returns {boolean} True if the date is available
   */
  isDateAvailable(date) {
    if (!date) return false;
    
    const state = this.calendar.getState();
    const dateStr = this.formatDateString(
      date.getFullYear(), 
      date.getMonth() + 1, 
      date.getDate()
    );
    
    return state.availableDates.includes(dateStr);
  }
  
  /**
   * Get formatted date string for the currently selected date
   * @returns {string} Formatted date or empty string if no date selected
   */
  getFormattedSelectedDate() {
    const state = this.calendar.getState();
    if (!state.selectedDate) return '';
    
    return state.selectedDate.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }
}

export default TimeSlotManager;
