# Calendar Component Refactoring

This document outlines the refactoring of the Scheduling Calendar component, describing the new architecture, usage patterns, and implementation details.

## Overview

The original `schedulingCalendar.js` file has been refactored into a modular architecture with clear separation of concerns. The new implementation consists of several specialized modules:

1. **Calendar**: Core class that manages state and coordinates between modules
2. **CalendarRenderer**: Handles all UI rendering
3. **TimeSlotManager**: Manages date and time slot data and API interactions
4. **FormManager**: Handles form validation and submission
5. **EventHandlers**: Centralizes all event handling

## Architecture

The refactored calendar implements a unidirectional data flow pattern:

1. User interactions trigger events
2. Events update the central state
3. State changes notify observers
4. Observers update the UI based on new state

This pattern improves testability, maintainability, and makes the code easier to reason about.

### Class Diagram

```
+-------------+       +-------------------+
|   Calendar  |------>| CalendarRenderer  |
+-------------+       +-------------------+
      |                       ^
      |                       |
      v                       |
+----------------+            |
| TimeSlotManager|            |
+----------------+            |
      |                       |
      v                       |
+-------------+               |
| FormManager |               |
+-------------+               |
      |                       |
      v                       |
+----------------+            |
| EventHandlers  |------------+
+----------------+
```

## Usage

### Basic Initialization

```javascript
import { initSchedulingCalendar } from './refactored/index.js';

// Find container element
const container = document.querySelector('.scheduling-calendar');

// Initialize calendar
const calendar = initSchedulingCalendar(container, {
  debug: true,
  dateFormat: 'YYYY-MM-DD',
  timeFormat: 'HH:mm'
});
```

### Required HTML Structure

The calendar component requires this basic HTML structure:

```html
<div class="scheduling-calendar">
  <div class="calendar-container"></div>
  <div class="time-slots"></div>
  <form class="customer-info-form">
    <!-- Form fields -->
    <div class="appointment-summary"></div>
    <div class="form-group">
      <label for="name">Name</label>
      <input type="text" id="name" name="name" required>
    </div>
    <!-- More form fields -->
    <button type="submit">Confirm Appointment</button>
  </form>
  <div class="confirmation-container"></div>
</div>
```

### Accessing State

You can access the current state of the calendar:

```javascript
const state = calendar.getState();
console.log('Selected date:', state.selectedDate);
console.log('Selected time:', state.selectedTime);
```

### Manual State Updates

You can manually update the state when needed:

```javascript
// Change the current month
const nextMonth = new Date(2023, 1, 1); // February 2023
calendar.updateState({ currentMonth: nextMonth });

// Select a date programmatically
calendar.timeSlotManager.selectDate(new Date(2023, 1, 15));
```

## Module Details

### Calendar

The core class that manages state and coordinates between modules.

**Key Methods:**
- `init()`: Initialize the calendar and its modules
- `updateState(newState)`: Update the calendar state
- `getState()`: Get the current calendar state
- `addObserver(observer)`: Add an observer for state changes
- `reset()`: Reset the calendar to initial state

### CalendarRenderer

Handles all UI rendering based on state changes.

**Key Methods:**
- `renderCalendar()`: Render the calendar grid
- `renderTimeSlots(timeSlots)`: Render available time slots
- `hideTimeSlots()`: Hide the time slots container
- `highlightDate(date)`: Highlight a specific date

### TimeSlotManager

Manages date and time slot data and API interactions.

**Key Methods:**
- `getAvailableDates(year, month)`: Fetch available dates for a month
- `getTimeSlots(date)`: Fetch time slots for a specific date
- `selectDate(date)`: Handle date selection
- `selectTimeSlot(time)`: Handle time slot selection

### FormManager

Handles form validation, submission, and confirmation.

**Key Methods:**
- `validateForm(formData)`: Validate form input data
- `confirmAppointment(data)`: Process appointment confirmation
- `showConfirmation(state)`: Show appointment confirmation message
- `setLoading(isLoading)`: Set loading state for the form

### EventHandlers

Centralizes all event handling.

**Key Methods:**
- `setupMonthNavigation()`: Set up month navigation events
- `setupDateSelection()`: Set up date selection events
- `setupTimeSlotSelection()`: Set up time slot selection events

## Testing

A comprehensive test suite has been created to ensure all components work correctly. The tests cover:

1. Individual module functionality
2. Integration between modules
3. API error handling
4. Form validation
5. State management
6. UI updates

Run the tests using:

```bash
npm test
```

## Implementation Notes

### Error Handling

All API calls are wrapped in try/catch blocks with appropriate error messaging. Fallback mechanisms are provided for:

- Available dates fetching
- Time slot fetching
- Appointment submission

### Accessibility

The refactored calendar pays special attention to accessibility:

- Proper ARIA attributes
- Keyboard navigation
- Focus management
- Screen reader announcements

### Browser Compatibility

The calendar is compatible with all modern browsers (Edge, Chrome, Firefox, Safari) and includes polyfills for older browsers.

