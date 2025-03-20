/**
 * Unit tests for the EventHandlers component
 */
import EventHandlers from '../../../src/js/refactored/EventHandlers';

describe('EventHandlers', () => {
  let eventHandlers;
  let mockCalendar;
  let mockElement;
  let mockRenderer;
  let mockTimeSlotManager;
  let mockFormManager;
  
  beforeEach(() => {
    // Create mock DOM elements
    mockElement = document.createElement('div');
    mockElement.innerHTML = `
      <div class="calendar-container">
        <div class="calendar-header">
          <button class="prev-month">&lt;</button>
          <h2>January 2023</h2>
          <button class="next-month">&gt;</button>
        </div>
        <div class="calendar-grid">
          <div class="calendar-day available" data-date="2023-1-15">15</div>
        </div>
      </div>
      <div class="time-slots">
        <div class="time-slot" data-time="10:30">10:30</div>
      </div>
      <div class="appointment-type-container">
        <select class="appointment-type">
          <option value="Test Drive">Test Drive</option>
          <option value="Service">Service</option>
        </select>
      </div>
      <div class="vehicle-container">
        <select class="vehicle-select">
          <option value="SUV">SUV</option>
          <option value="Sedan">Sedan</option>
        </select>
      </div>
      <div class="salesperson-container">
        <select class="salesperson-select">
          <option value="John Doe">John Doe</option>
          <option value="Jane Smith">Jane Smith</option>
        </select>
      </div>
      <form class="customer-info-form"></form>
    `;
    
    // Create mock modules
    mockRenderer = { update: jest.fn() };
    mockTimeSlotManager = { 
      selectDate: jest.fn(),
      selectTimeSlot: jest.fn()
    };
    mockFormManager = { confirmAppointment: jest.fn() };
    
    // Create mock calendar
    mockCalendar = {
      updateState: jest.fn(),
      getState: jest.fn().mockReturnValue({
        currentMonth: new Date(2023, 0, 1) // January 2023
      }),
      element: mockElement
    };
    
    // Create EventHandlers instance
    eventHandlers = new EventHandlers(mockCalendar);
    
    // Set mock modules
    eventHandlers.renderer = mockRenderer;
    eventHandlers.timeSlotManager = mockTimeSlotManager;
    eventHandlers.formManager = mockFormManager;
  });
  
  test('should initialize correctly', () => {
    // Spy on setup methods
    jest.spyOn(eventHandlers, 'setupMonthNavigation');
    jest.spyOn(eventHandlers, 'setupDateSelection');
    jest.spyOn(eventHandlers, 'setupTimeSlotSelection');
    jest.spyOn(eventHandlers, 'setupAppointmentType');
    jest.spyOn(eventHandlers, 'setupVehicleSelect');
    jest.spyOn(eventHandlers, 'setupSalesPersonSelect');
    
    // Call init
    eventHandlers.init({
      renderer: mockRenderer,
      timeSlotManager: mockTimeSlotManager,
      formManager: mockFormManager
    });
    
    // Check if setup methods were called
    expect(eventHandlers.setupMonthNavigation).toHaveBeenCalled();
    expect(eventHandlers.setupDateSelection).toHaveBeenCalled();
    expect(eventHandlers.setupTimeSlotSelection).toHaveBeenCalled();
    expect(eventHandlers.setupAppointmentType).toHaveBeenCalled();
    expect(eventHandlers.setupVehicleSelect).toHaveBeenCalled();
    expect(eventHandlers.setupSalesPersonSelect).toHaveBeenCalled();
  });
  
  test('should handle month navigation', () => {
    // Set up month navigation
    eventHandlers.setupMonthNavigation();
    
    // Simulate clicking previous month button
    const prevButton = mockElement.querySelector('.prev-month');
    prevButton.click();
    
    // Check if updateState was called with previous month
    expect(mockCalendar.updateState).toHaveBeenCalledWith({
      currentMonth: expect.any(Date)
    });
    
    // Reset mock to check next button
    mockCalendar.updateState.mockClear();
    
    // Simulate clicking next month button
    const nextButton = mockElement.querySelector('.next-month');
    nextButton.click();
    
    // Check if updateState was called with next month
    expect(mockCalendar.updateState).toHaveBeenCalledWith({
      currentMonth: expect.any(Date)
    });
  });
  
  test('should handle date selection', () => {
    // Set up date selection
    eventHandlers.setupDateSelection();
    
    // Simulate clicking on a date
    const dateCell = mockElement.querySelector('.calendar-day.available');
    dateCell.click();
    
    // Check if selectDate was called with correct date
    expect(mockTimeSlotManager.selectDate).toHaveBeenCalledWith(expect.any(Date));
  });
  
  test('should handle time slot selection', () => {
    // Set up time slot selection
    eventHandlers.setupTimeSlotSelection();
    
    // Simulate clicking on a time slot
    const timeSlot = mockElement.querySelector('.time-slot');
    timeSlot.click();
    
    // Check if selectTimeSlot was called with correct time
    expect(mockTimeSlotManager.selectTimeSlot).toHaveBeenCalledWith('10:30');
  });
  
  test('should handle appointment type selection', () => {
    // Set up appointment type selection
    eventHandlers.setupAppointmentType();
    
    // Simulate selecting an appointment type
    const appointmentType = mockElement.querySelector('.appointment-type');
    appointmentType.value = 'Service';
    appointmentType.dispatchEvent(new Event('change'));
    
    // Check if updateState was called with correct appointment type
    expect(mockCalendar.updateState).toHaveBeenCalledWith({ appointmentType: 'Service' });
  });
  
  test('should handle vehicle selection', () => {
    // Set up vehicle selection
    eventHandlers.setupVehicleSelect();
    
    // Simulate selecting a vehicle
    const vehicleSelect = mockElement.querySelector('.vehicle-select');
    vehicleSelect.value = 'SUV';
    vehicleSelect.dispatchEvent(new Event('change'));
    
    // Check if updateState was called with correct vehicle
    expect(mockCalendar.updateState).toHaveBeenCalledWith({ selectedVehicle: 'SUV' });
  });
  
  test('should handle salesperson selection', () => {
    // Set up salesperson selection
    eventHandlers.setupSalesPersonSelect();
    
    // Simulate selecting a salesperson
    const salesPersonSelect = mockElement.querySelector('.salesperson-select');
    salesPersonSelect.value = 'Jane Smith';
    salesPersonSelect.dispatchEvent(new Event('change'));
    
    // Check if updateState was called with correct salesperson
    expect(mockCalendar.updateState).toHaveBeenCalledWith({ selectedSalesPerson: 'Jane Smith' });
  });
});
