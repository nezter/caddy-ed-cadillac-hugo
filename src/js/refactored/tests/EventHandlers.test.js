/**
 * Tests for the EventHandlers class
 */
describe('EventHandlers', () => {
  let EventHandlers;
  let mockElement;
  let mockCalendar;
  let eventHandlers;
  let mockTimeSlotManager;
  let mockRenderer;
  let mockFormManager;
  
  beforeEach(() => {
    // Import EventHandlers class
    EventHandlers = require('../EventHandlers').default;
    
    // Create mock element
    mockElement = document.createElement('div');
    mockElement.innerHTML = `
      <div class="calendar-container">
        <button class="prev-month">&lt;</button>
        <button class="next-month">&gt;</button>
        <div class="calendar-grid">
          <div class="calendar-day available" data-date="2023-1-15">15</div>
        </div>
      </div>
      <div class="time-slots">
        <div class="time-slot" data-time="10:30">10:30</div>
      </div>
      <select class="appointment-type">
        <option value="Test Drive">Test Drive</option>
      </select>
      <select class="vehicle-select">
        <option value="SUV">SUV</option>
      </select>
      <select class="salesperson-select">
        <option value="John Doe">John Doe</option>
      </select>
      <form class="customer-info-form"></form>
    `;
    
    // Create mock calendar
    mockCalendar = {
      element: mockElement,
      updateState: jest.fn(),
      getState: jest.fn().mockReturnValue({
        currentMonth: new Date(2023, 0, 1)
      })
    };
    
    // Create mock modules
    mockTimeSlotManager = {
      selectDate: jest.fn(),
      selectTimeSlot: jest.fn()
    };
    mockRenderer = {};
    mockFormManager = {
      confirmAppointment: jest.fn()
    };
    
    // Create EventHandlers instance
    eventHandlers = new EventHandlers(mockCalendar);
    eventHandlers.timeSlotManager = mockTimeSlotManager;
    eventHandlers.renderer = mockRenderer;
    eventHandlers.formManager = mockFormManager;
  });
  
  test('should handle month navigation', () => {
    // Set up month navigation
    eventHandlers.setupMonthNavigation();
    
    // Click previous month button
    const prevButton = mockElement.querySelector('.prev-month');
    prevButton.click();
    
    // Verify state update
    expect(mockCalendar.updateState).toHaveBeenCalledWith({
      currentMonth: expect.any(Date)
    });
    expect(mockCalendar.updateState.mock.calls[0][0].currentMonth.getMonth()).toBe(11); // December (0-based)
    
    // Reset mock
    mockCalendar.updateState.mockClear();
    
    // Click next month button
    const nextButton = mockElement.querySelector('.next-month');
    nextButton.click();
    
    // Verify state update
    expect(mockCalendar.updateState).toHaveBeenCalledWith({
      currentMonth: expect.any(Date)
    });
    expect(mockCalendar.updateState.mock.calls[0][0].currentMonth.getMonth()).toBe(1); // February (0-based)
  });
  
  test('should handle date selection', () => {
    // Set up date selection
    eventHandlers.setupDateSelection();
    
    // Click on date cell
    const dateCell = mockElement.querySelector('.calendar-day.available');
    dateCell.click();
    
    // Verify selectDate was called
    expect(mockTimeSlotManager.selectDate).toHaveBeenCalled();
    expect(mockTimeSlotManager.selectDate.mock.calls[0][0]).toBeInstanceOf(Date);
    expect(mockTimeSlotManager.selectDate.mock.calls[0][0].getDate()).toBe(15);
  });
  
  test('should handle time slot selection', () => {
    // Set up time slot selection
    eventHandlers.setupTimeSlotSelection();
    
    // Click on time slot
    const timeSlot = mockElement.querySelector('.time-slot');
    timeSlot.click();
    
    // Verify selectTimeSlot was called
    expect(mockTimeSlotManager.selectTimeSlot).toHaveBeenCalledWith('10:30');
  });
  
  test('should handle appointment type selection', () => {
    // Set up appointment type selection
    eventHandlers.setupAppointmentType();
    
    // Change appointment type
    const select = mockElement.querySelector('.appointment-type');
    select.value = 'Test Drive';
    select.dispatchEvent(new Event('change'));
    
    // Verify state update
    expect(mockCalendar.updateState).toHaveBeenCalledWith({
      appointmentType: 'Test Drive'
    });
  });
  
  test('should handle vehicle selection', () => {
    // Set up vehicle selection
    eventHandlers.setupVehicleSelect();
    
    // Change vehicle selection
    const select = mockElement.querySelector('.vehicle-select');
    select.value = 'SUV';
    select.dispatchEvent(new Event('change'));
    
    // Verify state update
    expect(mockCalendar.updateState).toHaveBeenCalledWith({
      selectedVehicle: 'SUV'
    });
  });
  
  test('should handle salesperson selection', () => {
    // Set up salesperson selection
    eventHandlers.setupSalesPersonSelect();
    
    // Change salesperson selection
    const select = mockElement.querySelector('.salesperson-select');
    select.value = 'John Doe';
    select.dispatchEvent(new Event('change'));
    
    // Verify state update
    expect(mockCalendar.updateState).toHaveBeenCalledWith({
      selectedSalesPerson: 'John Doe'
    });
  });
  
  test('should handle form submission', () => {
    // Set up form submission
    eventHandlers.setupFormSubmission();
    
    // Submit form
    const form = mockElement.querySelector('.customer-info-form');
    form.dispatchEvent(new Event('submit'));
    
    // Verify confirmAppointment was called
    expect(mockFormManager.confirmAppointment).toHaveBeenCalled();
  });
  
  test('should properly initialize all event handlers', () => {
    // Spy on setup methods
    jest.spyOn(eventHandlers, 'setupMonthNavigation');
    jest.spyOn(eventHandlers, 'setupDateSelection');
    jest.spyOn(eventHandlers, 'setupTimeSlotSelection');
    jest.spyOn(eventHandlers, 'setupAppointmentType');
    jest.spyOn(eventHandlers, 'setupVehicleSelect');
    jest.spyOn(eventHandlers, 'setupSalesPersonSelect');
    jest.spyOn(eventHandlers, 'setupFormSubmission');
    
    // Initialize event handlers
    eventHandlers.init({
      renderer: mockRenderer,
      timeSlotManager: mockTimeSlotManager,
      formManager: mockFormManager
    });
    
    // Verify all setup methods were called
    expect(eventHandlers.setupMonthNavigation).toHaveBeenCalled();
    expect(eventHandlers.setupDateSelection).toHaveBeenCalled();
    expect(eventHandlers.setupTimeSlotSelection).toHaveBeenCalled();
    expect(eventHandlers.setupAppointmentType).toHaveBeenCalled();
    expect(eventHandlers.setupVehicleSelect).toHaveBeenCalled();
    expect(eventHandlers.setupSalesPersonSelect).toHaveBeenCalled();
    expect(eventHandlers.setupFormSubmission).toHaveBeenCalled();
  });
});
