/**
 * Unit tests for the TimeSlotManager component
 */
import TimeSlotManager from '../../../src/js/refactored/TimeSlotManager';

describe('TimeSlotManager', () => {
  let timeSlotManager;
  let mockCalendar;
  
  beforeEach(() => {
    // Create mock calendar
    mockCalendar = {
      updateState: jest.fn(),
      getState: jest.fn().mockReturnValue({
        availableDates: [],
        timeSlots: [],
        errors: {}
      })
    };
    
    // Create TimeSlotManager instance
    timeSlotManager = new TimeSlotManager(mockCalendar);
    
    // Mock fetch
    global.fetch = jest.fn();
  });
  
  test('should initialize correctly', () => {
    // Spy on getAvailableDates
    jest.spyOn(timeSlotManager, 'getAvailableDates');
    
    // Call init
    timeSlotManager.init();
    
    // Check if getAvailableDates was called with current month
    expect(timeSlotManager.getAvailableDates).toHaveBeenCalled();
  });
  
  test('should fetch available dates from API', async () => {
    // Mock successful API response
    const mockAvailableDates = ['2023-01-15', '2023-01-16', '2023-01-17'];
    global.fetch.mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ availableDates: mockAvailableDates })
      })
    );
    
    // Call getAvailableDates
    const result = await timeSlotManager.getAvailableDates(2023, 0);
    
    // Check if fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/available-dates?year=2023&month=1'));
    
    // Check if state was updated
    expect(mockCalendar.updateState).toHaveBeenCalledWith({ availableDates: mockAvailableDates });
    
    // Check return value
    expect(result).toEqual(mockAvailableDates);
  });
  
  test('should handle API error when fetching dates', async () => {
    // Mock failed API response
    global.fetch.mockImplementation(() => 
      Promise.resolve({
        ok: false,
        status: 500
      })
    );
    
    // Call getAvailableDates
    const result = await timeSlotManager.getAvailableDates(2023, 0);
    
    // Check if error state was updated
    expect(mockCalendar.updateState).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.objectContaining({
          datesFetch: expect.any(String)
        })
      })
    );
    
    // Check if fallback dates were returned
    expect(result).toEqual(expect.any(Array));
    expect(result.length).toBeGreaterThan(0);
  });
  
  test('should fetch time slots for a date', async () => {
    // Mock successful API response
    const mockTimeSlots = ['10:00', '10:30', '11:00'];
    global.fetch.mockImplementation(() => 
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ timeSlots: mockTimeSlots })
      })
    );
    
    // Call getTimeSlots
    const date = new Date(2023, 0, 15);
    const result = await timeSlotManager.getTimeSlots(date);
    
    // Check if fetch was called correctly
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('/api/available-times?date=2023-01-15'));
    
    // Check if state was updated
    expect(mockCalendar.updateState).toHaveBeenCalledWith({ timeSlots: mockTimeSlots });
    
    // Check return value
    expect(result).toEqual(mockTimeSlots);
  });
  
  test('should handle API error when fetching time slots', async () => {
    // Mock failed API response
    global.fetch.mockImplementation(() => 
      Promise.resolve({
        ok: false,
        status: 500
      })
    );
    
    // Call getTimeSlots
    const date = new Date(2023, 0, 15);
    const result = await timeSlotManager.getTimeSlots(date);
    
    // Check if error state was updated
    expect(mockCalendar.updateState).toHaveBeenCalledWith(
      expect.objectContaining({
        errors: expect.objectContaining({
          slotsFetch: expect.any(String)
        })
      })
    );
    
    // Check if fallback time slots were returned
    expect(result).toEqual(expect.any(Array));
  });
  
  test('should select a date correctly', () => {
    // Spy on getTimeSlots
    jest.spyOn(timeSlotManager, 'getTimeSlots').mockResolvedValue([]);
    
    // Call selectDate
    const date = new Date(2023, 0, 15);
    timeSlotManager.selectDate(date);
    
    // Check if state was updated
    expect(mockCalendar.updateState).toHaveBeenCalledWith({ 
      selectedDate: date,
      selectedTime: null,
      timeSlots: []
    });
    
    // Check if getTimeSlots was called
    expect(timeSlotManager.getTimeSlots).toHaveBeenCalledWith(date);
  });
  
  test('should select a time slot correctly', () => {
    // Call selectTimeSlot
    timeSlotManager.selectTimeSlot('10:30');
    
    // Check if state was updated
    expect(mockCalendar.updateState).toHaveBeenCalledWith({ selectedTime: '10:30' });
  });
  
  test('should format date string correctly', () => {
    // Call formatDateString
    const result = timeSlotManager.formatDateString(2023, 1, 5);
    
    // Check result
    expect(result).toBe('2023-01-05');
  });
  
  test('should check if date is available', () => {
    // Mock getState to return available dates
    mockCalendar.getState.mockReturnValue({
      availableDates: ['2023-01-15', '2023-01-16']
    });
    
    // Check available date
    const availableDate = new Date(2023, 0, 15);
    expect(timeSlotManager.isDateAvailable(availableDate)).toBe(true);
    
    // Check unavailable date
    const unavailableDate = new Date(2023, 0, 20);
    expect(timeSlotManager.isDateAvailable(unavailableDate)).toBe(false);
  });
  
  test('should get formatted selected date', () => {
    // Mock getState to return selected date
    const selectedDate = new Date(2023, 0, 15);
    mockCalendar.getState.mockReturnValue({
      selectedDate
    });
    
    // Call getFormattedSelectedDate
    const result = timeSlotManager.getFormattedSelectedDate();
    
    // Check result contains date information
    expect(result).toContain('January');
    expect(result).toContain('15');
    expect(result).toContain('2023');
  });
});
