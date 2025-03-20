# HIGH-01 Implementation Next Steps - 2023-12-29

## Current Progress

We've completed the initial analysis phase for HIGH-01 (Refactor schedulingCalendar.js) and have created the skeleton files for the new modular architecture. The main components have been set up:

1. Core Calendar class with state management
2. CalendarRenderer for UI management
3. TimeSlotManager for date/time data
4. FormManager for form handling
5. EventHandlers for centralized event management

## Next Implementation Steps

### 1. Complete Calendar Core Implementation (1.5 hours)

- Implement the `init()` method in the Calendar class
- Add configuration validation
- Create methods for initializing all modules
- Add calendar reset functionality
- Implement state logging for debugging

```javascript
// Example init() implementation
init() {
  // Initialize all modules first
  this.renderer.init();
  this.timeSlotManager.init();
  this.formManager.init();
  this.eventHandlers.init({
    renderer: this.renderer,
    timeSlotManager: this.timeSlotManager,
    formManager: this.formManager
  });
  
  // Initial state setup
  const today = new Date();
  this.updateState({
    currentMonth: today
  });
  
  // Log initialization
  console.debug('Calendar initialized', this.getState());
}
```

### 2. Implement CalendarRenderer Module (2 hours)

- Complete the `renderCalendar()` method to create the calendar grid
- Implement date cell rendering with available dates highlighting
- Add month navigation UI rendering
- Create methods for updating UI based on state changes

```javascript
// Example renderCalendar() implementation
renderCalendar() {
  if (!this.calendarContainer) return;
  
  // Clear existing calendar
  this.calendarContainer.innerHTML = '';
  
  const state = this.calendar.getState();
  const year = state.currentMonth.getFullYear();
  const month = state.currentMonth.getMonth();
  
  // Create header with month and year
  const calendarHeader = document.createElement('div');
  calendarHeader.classList.add('calendar-header');
  calendarHeader.innerHTML = `
    <button class="prev-month">&lt;</button>
    <h2>${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
    <button class="next-month">&gt;</button>
  `;
  this.calendarContainer.appendChild(calendarHeader);
  
  // Create day headings and calendar grid
  // ...remainder of calendar grid creation
}
```

### 3. Implement TimeSlotManager Module (2 hours)

- Complete the `getAvailableDates()` method with proper API handling
- Implement the `getTimeSlots()` method for retrieving time slots
- Create date selection functionality
- Implement time slot selection with state updates

```javascript
// Example getAvailableDates() implementation
async getAvailableDates(year, month) {
  try {
    // Attempt to fetch from API
    const response = await fetch(`/api/available-dates?year=${year}&month=${month + 1}`);
    
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
    return this.getFallbackDates(year, month);
  }
}
```

### 4. Implement FormManager Module (1.5 hours)

- Complete form validation logic
- Implement error display functionality
- Create form data collection and processing
- Add confirmation display methods

```javascript
// Example validateForm() implementation
validateForm(formData) {
  const errors = {};
  
  // Name validation
  const name = formData.get('name');
  if (!name || name.trim() === '') {
    errors.name = 'Name is required';
  }
  
  // Email validation
  const email = formData.get('email');
  if (!email || !this.validateEmail(email)) {
    errors.email = 'Valid email is required';
  }
  
  // Phone validation
  const phone = formData.get('phone');
  if (!phone || phone.trim() === '') {
    errors.phone = 'Phone number is required';
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}
```

### 5. Implement EventHandlers Module (1 hour)

- Complete event handler methods
- Add event delegation for calendar date selection
- Implement listener cleanup on reset
- Add accessibility event handling

```javascript
// Example event delegation for date selection
setupDateSelection() {
  const calendarGrid = this.element.querySelector('.calendar-grid');
  
  if (calendarGrid) {
    calendarGrid.addEventListener('click', (event) => {
      const dateCell = event.target.closest('.calendar-day:not(.empty):not(.past)');
      
      if (dateCell && dateCell.classList.contains('available')) {
        const day = parseInt(dateCell.textContent, 10);
        const state = this.calendar.getState();
        const selectedDate = new Date(
          state.currentMonth.getFullYear(),
          state.currentMonth.getMonth(),
          day
        );
        
        this.timeSlotManager.selectDate(selectedDate);
      }
    });
  }
}
```

### 6. Integration Testing (2 hours)

- Create test cases for each module
- Test interactions between modules
- Verify state updates and UI rendering
- Compare behavior with original implementation
- Fix any integration issues

```javascript
// Example test for Calendar and CalendarRenderer integration
test('should render calendar when month changes', () => {
  // Arrange
  const calendarEl = document.createElement('div');
  calendarEl.innerHTML = '<div class="calendar-container"></div>';
  const calendar = new Calendar(calendarEl);
  const renderer = new CalendarRenderer(calendar);
  calendar.renderer = renderer;
  renderer.init();
  
  // Spy on renderer method
  const renderSpy = jest.spyOn(renderer, 'renderCalendar');
  
  // Act - change month
  const newMonth = new Date(2023, 5, 1); // June 2023
  calendar.updateState({ currentMonth: newMonth });
  
  // Assert
  expect(renderSpy).toHaveBeenCalled();
  expect(calendarEl.querySelector('.calendar-header h2').textContent)
    .toContain('June 2023');
});
```

## Timeline for Completion

- December 29: Complete Calendar core and CalendarRenderer (3.5 hours)
- December 30: Complete TimeSlotManager and FormManager (3.5 hours)
- January 2: Complete EventHandlers and testing (3 hours)

## Success Criteria Checklist

As you implement each component, verify against these success criteria:

- [ ] All methods follow single responsibility principle (under 25 lines)
- [ ] Clear separation between UI, data, and event handling
- [ ] Consistent error handling throughout
- [ ] JSDoc comments for all public methods
- [ ] Tests passing for all implemented functionality
- [ ] State management working correctly
- [ ] No regression in user experience
