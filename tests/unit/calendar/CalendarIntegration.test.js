/**
 * Integration tests for the Calendar component
 */
import { 
  initSchedulingCalendar,
  Calendar,
  CalendarRenderer,
  TimeSlotManager,
  FormManager,
  EventHandlers
} from '../../../src/js/refactored/index';

describe('Calendar Integration Tests', () => {
  // Mock DOM elements before each test
  let container;
  let calendar;
  
  beforeEach(() => {
    // Create a mock DOM structure
    container = document.createElement('div');
    container.innerHTML = `
      <div class="calendar-container"></div>
      <div class="time-slots"></div>
      <form class="customer-info-form">
        <div class="appointment-summary"></div>
        <div class="form-group">
          <label for="name">Name</label>
          <input type="text" id="name" name="name" required>
        </div>
        <div class="form-group">
          <label for="email">Email</label>
          <input type="email" id="email" name="email" required>
        </div>
        <div class="form-group">
          <label for="phone">Phone</label>
          <input type="tel" id="phone" name="phone" required>
        </div>
        <button type="submit">Confirm Appointment</button>
      </form>
      <div class="confirmation-container"></div>
    `;
    
    // Add to document body
    document.body.appendChild(container);
    
    // Initialize calendar
    calendar = initSchedulingCalendar(container, {
      debug: true
    });
  });
  
  afterEach(() => {
    // Clean up
    document.body.removeChild(container);
  });
  
  test('should initialize all modules correctly', () => {
    // Assert
    expect(calendar).toBeTruthy();
    expect(calendar.renderer).toBeTruthy();
    expect(calendar.timeSlotManager).toBeTruthy();
    expect(calendar.formManager).toBeTruthy();
    expect(calendar.eventHandlers).toBeTruthy();
    
    // Check that the calendar renders
    expect(container.querySelector('.calendar-grid')).toBeTruthy();
  });
  
  test('should update state and notify observers', () => {
    // Arrange
    const mockObserver = {
      update: jest.fn()
    };
    calendar.addObserver(mockObserver);
    
    // Act
    calendar.updateState({ selectedDate: new Date(2023, 0, 15) });
    
    // Assert
    expect(mockObserver.update).toHaveBeenCalled();
    expect(calendar.getState().selectedDate).toEqual(new Date(2023, 0, 15));
  });
  
  test('should select date and fetch time slots', async () => {
    // Mock time slot fetch
    global.fetch = jest.fn().mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ timeSlots: ['10:00', '10:30', '11:00'] })
      })
    );
    
    // Act
    await calendar.timeSlotManager.selectDate(new Date(2023, 0, 15));
    
    // Assert
    expect(calendar.getState().selectedDate).toEqual(new Date(2023, 0, 15));
    expect(calendar.getState().timeSlots).toEqual(['10:00', '10:30', '11:00']);
    expect(container.querySelector('.time-slots')).toBeTruthy();
  });
  
  test('should select time slot and show form', () => {
    // Arrange
    calendar.updateState({ 
      selectedDate: new Date(2023, 0, 15),
      timeSlots: ['10:00', '10:30', '11:00']
    });
    
    // Act
    calendar.timeSlotManager.selectTimeSlot('10:30');
    
    // Assert
    expect(calendar.getState().selectedTime).toBe('10:30');
    expect(container.querySelector('.customer-info-form').classList.contains('visible')).toBe(true);
  });
  
  test('should validate form correctly', () => {
    // Arrange
    const formData = new FormData();
    formData.append('name', '');
    formData.append('email', 'invalid-email');
    formData.append('phone', '123');
    
    // Act
    const validation = calendar.formManager.validateForm(formData);
    
    // Assert
    expect(validation.isValid).toBe(false);
    expect(validation.errors.name).toBeTruthy();
    expect(validation.errors.email).toBeTruthy();
    expect(validation.errors.phone).toBeTruthy();
  });
  
  test('should confirm appointment successfully', async () => {
    // Mock successful appointment submission
    global.fetch = jest.fn().mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ 
          success: true, 
          confirmationNumber: 'TEST-12345' 
        })
      })
    );
    
    // Arrange
    calendar.updateState({
      selectedDate: new Date(2023, 0, 15),
      selectedTime: '10:30'
    });
    
    // Act - Submit appointment
    const appointmentData = {
      date: new Date(2023, 0, 15),
      time: '10:30',
      name: 'Test User',
      email: 'test@example.com',
      phone: '555-123-4567'
    };
    
    await calendar.formManager.confirmAppointment(appointmentData);
    
    // Assert
    expect(calendar.getState().appointmentConfirmed).toBe(true);
    expect(calendar.getState().confirmationNumber).toBeTruthy();
    expect(container.querySelector('.confirmation-container').classList.contains('visible')).toBe(true);
  });
  
  test('should handle API errors gracefully', async () => {
    // Mock failed appointment submission
    global.fetch = jest.fn().mockImplementation(() => 
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      })
    );
    
    // Arrange
    calendar.updateState({
      selectedDate: new Date(2023, 0, 15),
      selectedTime: '10:30'
    });
    
    // Act - Submit appointment
    const appointmentData = {
      date: new Date(2023, 0, 15),
      time: '10:30',
      name: 'Test User',
      email: 'test@example.com',
      phone: '555-123-4567'
    };
    
    await calendar.formManager.confirmAppointment(appointmentData);
    
    // Assert
    expect(calendar.getState().appointmentConfirmed).not.toBe(true);
    expect(calendar.getState().errors.formSubmission).toBeTruthy();
    expect(container.querySelector('.form-error-message')).toBeTruthy();
  });
  
  test('should reset calendar state', () => {
    // Arrange - Set various state properties
    calendar.updateState({
      selectedDate: new Date(2023, 0, 15),
      selectedTime: '10:30',
      appointmentConfirmed: true,
      confirmationNumber: 'TEST-12345',
      errors: { formSubmission: 'Some error' }
    });
    
    // Act
    calendar.reset();
    
    // Assert
    const state = calendar.getState();
    expect(state.selectedDate).toBeNull();
    expect(state.selectedTime).toBeNull();
    expect(state.appointmentConfirmed).toBe(false);
    expect(Object.keys(state.errors).length).toBe(0);
  });
});
