/**
 * Scheduling Calendar Module Entry Point
 * Initializes and exports the refactored calendar functionality
 */
import Calendar from './Calendar';
import CalendarRenderer from './CalendarRenderer';
import TimeSlotManager from './TimeSlotManager';
import FormManager from './FormManager';
import EventHandlers from './EventHandlers';
import { checkBrowserCompatibility, applyPolyfills } from './compatibility';

/**
 * Initialize a scheduling calendar on the specified element
 * @param {HTMLElement} element - The calendar container element
 * @param {Object} options - Configuration options
 * @returns {Calendar} The initialized calendar instance
 */
function initSchedulingCalendar(element, options = {}) {
  // Check compatibility and apply polyfills
  if (!checkBrowserCompatibility()) {
    console.warn('Browser may not fully support the scheduling calendar. Some features may not work.');
  }
  applyPolyfills();
  
  if (!element) {
    console.error('Cannot initialize scheduling calendar: Element not found');
    return null;
  }
  
  try {
    // Create the calendar instance
    const calendar = new Calendar(element, options);
    
    // Create module instances
    const renderer = new CalendarRenderer(calendar);
    const timeSlotManager = new TimeSlotManager(calendar);
    const formManager = new FormManager(calendar);
    const eventHandlers = new EventHandlers(calendar);
    
    // Store module references in calendar
    calendar.renderer = renderer;
    calendar.timeSlotManager = timeSlotManager;
    calendar.formManager = formManager;
    calendar.eventHandlers = eventHandlers;
    
    // Initialize calendar (this will initialize all modules)
    calendar.init();
    
    return calendar;
  } catch (error) {
    console.error('Error initializing scheduling calendar:', error);
    return null;
  }
}

export { 
  initSchedulingCalendar, 
  Calendar,
  CalendarRenderer,
  TimeSlotManager,
  FormManager,
  EventHandlers
};
