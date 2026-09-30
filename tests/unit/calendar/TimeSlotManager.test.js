/**
 * @jest-environment jsdom
 *
 * The calendar module under test is browser code: it builds DOM nodes and
 * attaches event listeners, so it needs a document. The suite-level
 * `testEnvironment` is "node" (the serverless functions are not browser code),
 * hence this per-file override.
 */
/**
 * Unit tests for the TimeSlotManager component
 */
import TimeSlotManager from '../../../site/assets/js/refactored/TimeSlotManager';

    // The code passes a URL OBJECT to fetch, not a string -- which is better,
    // because `new URL(path, origin)` resolves the base for it. These assertions
    // were written for a string, so expect.stringContaining() was compared
    // against a URL object and could never match. Jest prints the object as its
    // href, which makes the failure look like a near-miss on the path rather
    // than a type mismatch.

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
    expect(String(global.fetch.mock.calls[0][0]))
      .toContain('/.netlify/functions/available-dates?year=2023&month=1');
    
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
    // A month that is actually in the FUTURE.
    //
    // The test hardcoded (2023, 0). getFallbackDates() deliberately excludes past
    // dates -- a booking calendar that offers a day in 2023 is broken -- so this test
    // went red purely because time passed, and the failure read as "the fallback is
    // broken" rather than "the fixture is stale". Computing the month means it
    // cannot rot again.
    const future = new Date();
    future.setMonth(future.getMonth() + 2);
    const result = await timeSlotManager.getAvailableDates(
      future.getFullYear(), future.getMonth());
    
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
    expect(String(global.fetch.mock.calls[0][0]))
      .toContain('/.netlify/functions/available-times?date=2023-01-15');
    
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
