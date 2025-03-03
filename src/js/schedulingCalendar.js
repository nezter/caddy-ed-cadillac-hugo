/**
 * Scheduling Calendar Component
 * Manages test drive and appointment scheduling
 */
class SchedulingCalendar {
  constructor(element) {
    this.element = element;
    this.calendarContainer = element.querySelector('.calendar-container');
    this.appointmentType = element.querySelector('.appointment-type');
    this.vehicleSelect = element.querySelector('.vehicle-select');
    this.salesPersonSelect = element.querySelector('.salesperson-select');
    this.timeSlotContainer = element.querySelector('.time-slots');
    this.confirmationContainer = element.querySelector('.confirmation-container');
    this.confirmButton = element.querySelector('.confirm-appointment');
    this.customerForm = element.querySelector('.customer-info-form');
    this.selectedDate = null;
    this.selectedTime = null;
    this.currentMonth = new Date();
    
    this.init();
  }
  
  init() {
    // Render calendar for current month
    this.renderCalendar();
    
    // Set up month navigation
    this.setupMonthNavigation();
    
    // Set up appointment type selection
    if (this.appointmentType) {
      this.setupAppointmentType();
    }
    
    // Setup vehicle selection
    if (this.vehicleSelect) {
      this.setupVehicleSelect();
    }
    
    // Setup sales person selection
    if (this.salesPersonSelect) {
      this.setupSalesPersonSelect();
    }
    
    // Setup confirmation button
    if (this.confirmButton) {
      this.setupConfirmation();
    }
    
    // Initialize customer form validation
    if (this.customerForm) {
      this.setupFormValidation();
    }
  }
  
  renderCalendar() {
    if (!this.calendarContainer) return;
    
    // Clear existing calendar
    this.calendarContainer.innerHTML = '';
    
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    
    // Create header with month and year
    const calendarHeader = document.createElement('div');
    calendarHeader.classList.add('calendar-header');
    calendarHeader.innerHTML = `
      <button class="prev-month">&lt;</button>
      <h2>${new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
      <button class="next-month">&gt;</button>
    `;
    this.calendarContainer.appendChild(calendarHeader);
    
    // Create day headings
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
    
    // Create calendar grid
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
    
    // Get available dates from API
    this.getAvailableDates(year, month).then(availableDates => {
      // Create cells for each day of the month
      for (let day = 1; day <= daysInMonth; day++) {
        const dateCell = document.createElement('div');
        dateCell.classList.add('calendar-day');
        dateCell.textContent = day;
        
        // Check if this date is available
        const dateString = `${year}-${month + 1}-${day}`;
        const isAvailable = availableDates.includes(dateString);
        
        // Check if this date is in the past
        const isInPast = new Date(year, month, day) < new Date(today.setHours(0, 0, 0, 0));
        
        // Check if this is today
        const isToday = day === currentDay && month === currentMonth && year === currentYear;
        
        if (isToday) {
          dateCell.classList.add('today');
        }
        
        if (isInPast) {
          dateCell.classList.add('past');
        } else if (isAvailable) {
          dateCell.classList.add('available');
          dateCell.addEventListener('click', () => {
            this.selectDate(new Date(year, month, day));
            
            // Remove selected class from all cells
            document.querySelectorAll('.calendar-day.selected').forEach(cell => {
              cell.classList.remove('selected');
            });
            
            // Add selected class to this cell
            dateCell.classList.add('selected');
          });
        } else {
          dateCell.classList.add('unavailable');
        }
        
        calendarGrid.appendChild(dateCell);
      }
      
      this.calendarContainer.appendChild(calendarGrid);
    });
  }
  
  async getAvailableDates(year, month) {
    // In a real implementation, this would be an API call
    // For demo purposes, we'll simulate availability
    
    try {
      const response = await fetch(`/api/available-dates?year=${year}&month=${month + 1}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch available dates');
      }
      
      const data = await response.json();
      return data.availableDates || [];
    } catch (error) {
      console.error('Error fetching available dates:', error);
      
      // Return some dummy data for demonstration
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const availableDates = [];
      
      // Make weekdays available (no Sundays)
      for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(year, month, day);
        if (date >= new Date() && date.getDay() !== 0) {
          availableDates.push(`${year}-${month + 1}-${day}`);
        }
      }
      
      return availableDates;
    }
  }
  
  selectDate(date) {
    this.selectedDate = date;
    
    // Fetch and display available time slots for this date
    this.getTimeSlots(date).then(timeSlots => {
      this.renderTimeSlots(timeSlots);
    });
  }
  
  async getTimeSlots(date) {
    // In a real implementation, this would be an API call
    // For demo purposes, we'll simulate available times
    
    try {
      const formattedDate = date.toISOString().split('T')[0];
      const response = await fetch(`/api/available-times?date=${formattedDate}`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch available time slots');
      }
      
      const data = await response.json();
      return data.timeSlots || [];
    } catch (error) {
      console.error('Error fetching time slots:', error);
      
      // Return some dummy data for demonstration
      const timeSlots = [];
      const day = date.getDay();
      
      // Business hours (10am - 6pm for weekdays, 9am - 5pm for Saturday)
      if (day >= 1 && day <= 5) { // Monday to Friday
        for (let hour = 10; hour < 18; hour++) {
          timeSlots.push(`${hour}:00`);
          timeSlots.push(`${hour}:30`);
        }
      } else if (day === 6) { // Saturday
        for (let hour = 9; hour < 17; hour++) {
          timeSlots.push(`${hour}:00`);
          timeSlots.push(`${hour}:30`);
        }
      }
      
      return timeSlots;
    }
  }
  
  renderTimeSlots(timeSlots) {
    if (!this.timeSlotContainer) return;
    
    // Clear existing time slots
    this.timeSlotContainer.innerHTML = '';
    
    if (timeSlots.length === 0) {
      const message = document.createElement('p');
      message.textContent = 'No available time slots for this date.';
      this.timeSlotContainer.appendChild(message);
      return