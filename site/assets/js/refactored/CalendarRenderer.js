/**
 * CalendarRenderer
 * Handles all UI rendering for the calendar
 */
class CalendarRenderer {
  /**
   * Create a new CalendarRenderer
   * @param {Calendar} calendar - The parent Calendar instance
   */
  constructor(calendar) {
    this.calendar = calendar;
    this.element = calendar.element;
    
    // Cache DOM elements
    this.calendarContainer = this.element.querySelector('.calendar-container');
    this.timeSlotContainer = this.element.querySelector('.time-slots');
    
    // Bind methods to maintain context
    this.update = this.update.bind(this);
    this.renderCalendar = this.renderCalendar.bind(this);
    this.renderTimeSlots = this.renderTimeSlots.bind(this);
  }
  
  /**
   * Initialize the renderer
   */
  init() {
    // Register as observer
    this.calendar.addObserver(this);
    
    // Initial render
    this.renderCalendar();
  }
  
  /**
   * Update handler called when calendar state changes
   * @param {Object} state - Current calendar state
   */
  update(state) {
    // Re-render calendar if current month changed
    if (this.shouldRenderCalendar(state)) {
      this.renderCalendar();
    }
    
    // Re-render time slots if selected date or available slots changed
    if (this.shouldRenderTimeSlots(state)) {
      this.renderTimeSlots(state.timeSlots);
    }
  }
  
  /**
   * Determine if calendar should be re-rendered
   * @param {Object} state - Current calendar state
   * @returns {boolean} True if calendar should be re-rendered
   */
  shouldRenderCalendar(state) {
    // Re-render if current month has changed
    if (!this._lastRenderedMonth) {
      this._lastRenderedMonth = new Date(state.currentMonth);
      return true;
    }
    
    const currentMonth = state.currentMonth;
    const lastMonth = this._lastRenderedMonth;
    
    const monthChanged = 
      currentMonth.getFullYear() !== lastMonth.getFullYear() || 
      currentMonth.getMonth() !== lastMonth.getMonth();
      
    if (monthChanged) {
      this._lastRenderedMonth = new Date(currentMonth);
    }
    
    return monthChanged || state.availableDates !== this._lastAvailableDates;
  }
  
  /**
   * Determine if time slots should be re-rendered
   * @param {Object} state - Current calendar state
   * @returns {boolean} True if time slots should be re-rendered
   */
  shouldRenderTimeSlots(state) {
    // Render time slots if we have a selected date and slots are available
    const hasSelectedDate = state.selectedDate !== null;
    const hasTimeSlots = state.timeSlots && state.timeSlots.length > 0;
    const slotsChanged = JSON.stringify(state.timeSlots) !== JSON.stringify(this._lastTimeSlots || []);
    
    if (slotsChanged) {
      this._lastTimeSlots = [...state.timeSlots];
    }
    
    return hasSelectedDate && (hasTimeSlots || slotsChanged);
  }
  
  /**
   * Render the calendar grid
   */
  renderCalendar() {
    if (!this.calendarContainer) return;
    
    // Clear existing calendar
    this.calendarContainer.innerHTML = '';
    
    const state = this.calendar.getState();
    const year = state.currentMonth.getFullYear();
    const month = state.currentMonth.getMonth();
    
    // Create header with month and year
    this.renderCalendarHeader(year, month);
    
    // Create day headings
    this.renderDayHeadings();
    
    // Create calendar grid
    this.renderCalendarGrid(year, month, state.availableDates, state.selectedDate);
    
    // Save rendered dates for comparison
    this._lastAvailableDates = [...state.availableDates];
  }
  
  /**
   * Render the calendar header with month navigation
   * @param {number} year - Current year
   * @param {number} month - Current month (0-11)
   */
  renderCalendarHeader(year, month) {
    const calendarHeader = document.createElement('div');
    calendarHeader.classList.add('calendar-header');
    calendarHeader.innerHTML = `
      <button class="prev-month" aria-label="Previous month">&lt;</button>
      <h2>${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
      <button class="next-month" aria-label="Next month">&gt;</button>
    `;
    this.calendarContainer.appendChild(calendarHeader);
  }
  
  /**
   * Render the day headings (Sun, Mon, etc.)
   */
  renderDayHeadings() {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const daysHeader = document.createElement('div');
    daysHeader.classList.add('days-header');
    
    dayNames.forEach(day => {
      const dayElement = document.createElement('div');
      dayElement.classList.add('day-name');
      dayElement.textContent = day;
      daysHeader.appendChild(dayElement);
    });
    
    this.calendarContainer.appendChild(daysHeader);
  }
  
  /**
   * Render the calendar grid with date cells
   * @param {number} year - Current year
   * @param {number} month - Current month (0-11)
   * @param {Array} availableDates - Array of available dates
   * @param {Date} selectedDate - Currently selected date
   */
  renderCalendarGrid(year, month, availableDates, selectedDate) {
    const calendarGrid = document.createElement('div');
    calendarGrid.classList.add('calendar-grid');
    
    // Get first day of month and number of days in month
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Get current date for highlighting today
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay; i++) {
      const emptyDay = document.createElement('div');
      emptyDay.classList.add('calendar-day', 'empty');
      calendarGrid.appendChild(emptyDay);
    }
    
    // Create cells for each day of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateCell = document.createElement('div');
      dateCell.classList.add('calendar-day');
      dateCell.setAttribute('data-date', `${year}-${month + 1}-${day}`);
      dateCell.textContent = day;
      
      // Check if this date is available
      const dateString = `${year}-${month + 1}-${day}`;
      const isAvailable = availableDates.includes(dateString);
      
      // Check if this date is in the past
      const cellDate = new Date(year, month, day);
      const isInPast = cellDate < new Date(today.setHours(0, 0, 0, 0));
      
      // Check if this is today
      const isToday = day === currentDay && month === currentMonth && year === currentYear;
      
      // Check if this is the selected date
      const isSelected = selectedDate && 
                        day === selectedDate.getDate() && 
                        month === selectedDate.getMonth() && 
                        year === selectedDate.getFullYear();
      
      // Add appropriate classes
      if (isToday) {
        dateCell.classList.add('today');
      }
      
      if (isInPast) {
        dateCell.classList.add('past');
      } else if (isAvailable) {
        dateCell.classList.add('available');
        // We don't add event listeners here - that's the EventHandlers module's job
      } else {
        dateCell.classList.add('unavailable');
      }
      
      if (isSelected) {
        dateCell.classList.add('selected');
      }
      
      calendarGrid.appendChild(dateCell);
    }
    
    this.calendarContainer.appendChild(calendarGrid);
  }
  
  /**
   * Render available time slots
   * @param {Array} timeSlots - Available time slots
   */
  renderTimeSlots(timeSlots) {
    if (!this.timeSlotContainer) return;
    
    // Clear existing time slots
    this.timeSlotContainer.innerHTML = '';
    
    if (!timeSlots || timeSlots.length === 0) {
      const message = document.createElement('p');
      message.classList.add('time-slots-message');
      message.textContent = 'No available time slots for this date.';
      this.timeSlotContainer.appendChild(message);
      return;
    }
    
    // Create container for slots
    const slotsGrid = document.createElement('div');
    slotsGrid.classList.add('time-slots-grid');
    
    // Create time slot elements
    timeSlots.forEach(time => {
      const timeSlot = document.createElement('div');
      timeSlot.classList.add('time-slot');
      timeSlot.setAttribute('data-time', time);
      timeSlot.textContent = time;
      
      // Check if this slot is currently selected
      const state = this.calendar.getState();
      if (state.selectedTime === time) {
        timeSlot.classList.add('selected');
      }
      
      slotsGrid.appendChild(timeSlot);
    });
    
    this.timeSlotContainer.appendChild(slotsGrid);
    
    // Show container
    this.timeSlotContainer.classList.add('visible');
  }
  
  /**
   * Highlight a specific date cell
   * @param {Date} date - The date to highlight
   */
  highlightDate(date) {
    if (!date || !this.calendarContainer) return;
    
    // Remove existing highlight
    const selected = this.calendarContainer.querySelector('.calendar-day.selected');
    if (selected) {
      selected.classList.remove('selected');
    }
    
    // Add highlight to new date
    const dateStr = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    const dateCell = this.calendarContainer.querySelector(`.calendar-day[data-date="${dateStr}"]`);
    
    if (dateCell) {
      dateCell.classList.add('selected');
    }
  }
  
  /**
   * Hide the time slots container
   */
  hideTimeSlots() {
    if (this.timeSlotContainer) {
      this.timeSlotContainer.classList.remove('visible');
    }
  }
}

export default CalendarRenderer;
