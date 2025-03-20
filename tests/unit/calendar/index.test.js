/**
 * Unit tests for the calendar module entry point
 */
import { 
  initSchedulingCalendar,
  Calendar,
  CalendarRenderer,
  TimeSlotManager,
  FormManager,
  EventHandlers
} from '../../../src/js/refactored/index';
import * as compatibility from '../../../src/js/refactored/compatibility';

describe('Calendar Module Entry Point', () => {
  let container;
  
  beforeEach(() => {
    // Mock compatibility functions
    jest.spyOn(compatibility, 'checkBrowserCompatibility').mockReturnValue(true);
    jest.spyOn(compatibility, 'applyPolyfills').mockImplementation(() => {});
    
    // Create container element
    container = document.createElement('div');
    container.innerHTML = `
      <div class="calendar-container"></div>
      <div class="time-slots"></div>
      <form class="customer-info-form"></form>
      <div class="confirmation-container"></div>
    `;
    
    // Add to document
    document.body.appendChild(container);
  });
  
  afterEach(() => {
    // Clean up
    document.body.removeChild(container);
    jest.restoreAllMocks();
  });
  
  test('should export all necessary modules', () => {
    // Check exports
    expect(Calendar).toBeDefined();
    expect(CalendarRenderer).toBeDefined();
    expect(TimeSlotManager).toBeDefined();
    expect(FormManager).toBeDefined();
    expect(EventHandlers).toBeDefined();
    expect(initSchedulingCalendar).toBeDefined();
  });
  
  test('should check browser compatibility and apply polyfills', () => {
    // Call initSchedulingCalendar
    initSchedulingCalendar(container);
    
    // Check if compatibility functions were called
    expect(compatibility.checkBrowserCompatibility).toHaveBeenCalled();
    expect(compatibility.applyPolyfills).toHaveBeenCalled();
  });
  
  test('should initialize calendar with all modules', () => {
    // Mock Calendar and module initialization
    const mockInit = jest.fn();
    const mockCalendar = {
      init: mockInit,
      element: container
    };
    
    // Mock Calendar constructor
    jest.spyOn(Calendar.prototype, 'constructor').mockImplementation(() => mockCalendar);
    
    // Call initSchedulingCalendar
    const result = initSchedulingCalendar(container);
    
    // Check if init was called
    expect(mockInit).toHaveBeenCalled();
    
    // Check if result is calendar instance
    expect(result).toBe(mockCalendar);
  });
  
  test('should return null if container is not found', () => {
    // Call initSchedulingCalendar with null container
    const result = initSchedulingCalendar(null);
    
    // Check result
    expect(result).toBeNull();
  });
  
  test('should handle errors during initialization', () => {
    // Mock console.error
    jest.spyOn(console, 'error').mockImplementation(() => {});
    
    // Mock Calendar constructor to throw error
    jest.spyOn(Calendar.prototype, 'constructor').mockImplementation(() => {
      throw new Error('Test error');
    });
    
    // Call initSchedulingCalendar
    const result = initSchedulingCalendar(container);
    
    // Check if error was logged
    expect(console.error).toHaveBeenCalled();
    
    // Check result
    expect(result).toBeNull();
  });
});
