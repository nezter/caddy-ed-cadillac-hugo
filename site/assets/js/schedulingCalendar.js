/**
 * Scheduling Calendar Component
 * Manages test drive and appointment scheduling
 */
import { initSchedulingCalendar } from './refactored/index.js';

class SchedulingCalendar {
  /**
   * Create a new SchedulingCalendar
   * @param {HTMLElement|string} element - The calendar container element or selector
   */
  constructor(element) {
    if (typeof element === 'string') {
      element = document.querySelector(element);
    }
    
    if (!element) {
      console.error('SchedulingCalendar: Container element not found');
      return;
    }
    
    // Initialize with new refactored implementation
    this.calendar = initSchedulingCalendar(element, {
      debug: false,
      dateFormat: 'YYYY-MM-DD',
      timeFormat: 'HH:mm'
    });
  }
  
  /**
   * Reset the calendar to initial state
   */
  reset() {
    if (this.calendar) {
      this.calendar.reset();
    }
  }
  
  /**
   * Get the current calendar state
   * @returns {Object} The current state object
   */
  getState() {
    return this.calendar ? this.calendar.getState() : {};
  }
}

// Initialize the scheduling calendar when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  const calendarElements = document.querySelectorAll('.scheduling-calendar');
  calendarElements.forEach(element => new SchedulingCalendar(element));
});

export default SchedulingCalendar;