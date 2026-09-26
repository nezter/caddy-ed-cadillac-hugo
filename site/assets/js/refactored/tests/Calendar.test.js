/**
 * Tests for the Calendar class
 */
describe('Calendar', () => {
  let Calendar;
  let mockElement;
  let calendar;
  
  beforeEach(() => {
    // Import Calendar class
    Calendar = require('../Calendar').default;
    
    // Create mock element
    mockElement = document.createElement('div');
    mockElement.innerHTML = `
      <div class="calendar-container"></div>
      <div class="time-slots"></div>
      <form class="customer-info-form"></form>
      <div class="confirmation-container"></div>
    `;
    
    // Create calendar instance
    calendar = new Calendar(mockElement);
  });
  
  test('should initialize with default state', () => {
    // Verify initial state
    const state = calendar.getState();
    expect(state.selectedDate).toBeNull();
    expect(state.selectedTime).toBeNull();
    expect(state.availableDates).toEqual([]);
    expect(state.timeSlots).toEqual([]);
  });
  
  test('should update state correctly', () => {
    // Update state
    const newDate = new Date(2023, 0, 15);
    calendar.updateState({ selectedDate: newDate });
    
    // Verify state was updated
    const state = calendar.getState();
    expect(state.selectedDate).toEqual(newDate);
  });
  
  test('should notify observers when state changes', () => {
    // Create mock observer
    const mockObserver = {
      update: jest.fn()
    };
    
    // Add observer
    calendar.addObserver(mockObserver);
    
    // Update state
    calendar.updateState({ selectedDate: new Date() });
    
    // Verify observer was notified
    expect(mockObserver.update).toHaveBeenCalled();
  });
  
  test('should throw error if initialized without element', () => {
    expect(() => {
      new Calendar(null);
    }).toThrow('Calendar requires a valid DOM element');
  });
});
