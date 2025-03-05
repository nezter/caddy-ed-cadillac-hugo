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
  
  setupMonthNavigation() {
    const prevButton = this.element.querySelector('.prev-month');
    const nextButton = this.element.querySelector('.next-month');
    
    if (prevButton) {
      prevButton.addEventListener('click', () => {
        this.currentMonth.setMonth(this.currentMonth.getMonth() - 1);
        this.renderCalendar();
      });
    }
    
    if (nextButton) {
      nextButton.addEventListener('click', () => {
        this.currentMonth.setMonth(this.currentMonth.getMonth() + 1);
        this.renderCalendar();
      });
    }
  }
  
  setupAppointmentType() {
    // Handle appointment type selection
    this.appointmentType.addEventListener('change', (e) => {
      const appointmentType = e.target.value;
      console.log(`Selected appointment type: ${appointmentType}`);
      // Additional logic based on appointment type
    });
  }
  
  setupVehicleSelect() {
    // Handle vehicle selection
    this.vehicleSelect.addEventListener('change', (e) => {
      const vehicleId = e.target.value;
      console.log(`Selected vehicle: ${vehicleId}`);
      // Additional logic based on vehicle selection
    });
  }
  
  setupSalesPersonSelect() {
    // Handle sales person selection
    this.salesPersonSelect.addEventListener('change', (e) => {
      const salesPersonId = e.target.value;
      console.log(`Selected sales person: ${salesPersonId}`);
      // Additional logic based on sales person selection
    });
  }
  
  setupConfirmation() {
    this.confirmButton.addEventListener('click', () => {
      this.confirmAppointment();
    });
  }
  
  setupFormValidation() {
    this.customerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      
      // Basic validation example
      const nameInput = this.customerForm.querySelector('[name="name"]');
      const emailInput = this.customerForm.querySelector('[name="email"]');
      const phoneInput = this.customerForm.querySelector('[name="phone"]');
      
      let isValid = true;
      
      if (!nameInput.value.trim()) {
        isValid = false;
        this.showError(nameInput, 'Name is required');
      }
      
      if (!emailInput.value.trim() || !this.validateEmail(emailInput.value)) {
        isValid = false;
        this.showError(emailInput, 'Valid email is required');
      }
      
      if (!phoneInput.value.trim()) {
        isValid = false;
        this.showError(phoneInput, 'Phone number is required');
      }
      
      if (isValid) {
        this.confirmAppointment();
      }
    });
  }
  
  validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  }
  
  showError(input, message) {
    const formGroup = input.closest('.form-group');
    const errorElement = formGroup.querySelector('.error-message') || document.createElement('div');
    errorElement.classList.add('error-message');
    errorElement.textContent = message;
    
    if (!formGroup.querySelector('.error-message')) {
      formGroup.appendChild(errorElement);
    }
    
    input.classList.add('error');
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
          });
        } else {
          dateCell.classList.add('unavailable');
        }
        
        calendarGrid.appendChild(dateCell);
      }
      
      this.calendarContainer.appendChild(calendarGrid);
      
      // Reattach month navigation events
      this.setupMonthNavigation();
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
    
    // Highlight selected date
    document.querySelectorAll('.calendar-day.selected').forEach(day => {
      day.classList.remove('selected');
    });
    
    const selectedElement = document.querySelector(`.calendar-day:not(.empty):not(.past):nth-child(${date.getDate() + this.getFirstDayOffset()})`);
    if (selectedElement) {
      selectedElement.classList.add('selected');
    }
    
    // Fetch and display available time slots for this date
    this.getTimeSlots(date).then(timeSlots => {
      this.renderTimeSlots(timeSlots);
    });
  }
  
  getFirstDayOffset() {
    // Calculate offset for selecting the proper date element
    const year = this.currentMonth.getFullYear();
    const month = this.currentMonth.getMonth();
    return new Date(year, month, 1).getDay();
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
      return;
    }
    
    // Create time slot elements
    timeSlots.forEach(time => {
      const timeSlot = document.createElement('div');
      timeSlot.classList.add('time-slot');
      timeSlot.textContent = time;
      timeSlot.addEventListener('click', (event) => {
        this.selectTimeSlot(time, event);
      });
      this.timeSlotContainer.appendChild(timeSlot);
    });
  }
  
  selectTimeSlot(time, event) {
    this.selectedTime = time;
    
    // Remove selected class from all time slots
    document.querySelectorAll('.time-slot.selected').forEach(slot => {
      slot.classList.remove('selected');
    });
    
    // Add selected class to clicked time slot
    if (event && event.currentTarget) {
      event.currentTarget.classList.add('selected');
    }
    
    // Show customer info form
    if (this.customerForm) {
      this.customerForm.classList.add('visible');
    }
  }
  
  confirmAppointment() {
    if (!this.selectedDate || !this.selectedTime) {
      alert('Please select a date and time for your appointment.');
      return;
    }
    
    // In a real implementation, this would send data to the server
    // For demo purposes, just show confirmation
    
    const formData = new FormData(this.customerForm);
    const customerData = {};
    
    formData.forEach((value, key) => {
      customerData[key] = value;
    });
    
    const appointmentData = {
      date: this.selectedDate.toLocaleDateString(),
      time: this.selectedTime,
      customer: customerData,
      appointmentType: this.appointmentType ? this.appointmentType.value : 'consultation',
      vehicle: this.vehicleSelect ? this.vehicleSelect.value : null,
      salesPerson: this.salesPersonSelect ? this.salesPersonSelect.value : null
    };
    
    console.log('Appointment confirmed:', appointmentData);
    
    // Show confirmation message
    if (this.confirmationContainer) {
      this.confirmationContainer.innerHTML = `
        <h3>Appointment Confirmed!</h3>
        <p>Date: ${appointmentData.date}</p>
        <p>Time: ${appointmentData.time}</p>
        <p>We look forward to seeing you!</p>
        <button class="new-appointment">Schedule Another</button>
      `;
      
      this.confirmationContainer.classList.add('visible');
      
      // Hide other elements
      if (this.calendarContainer) this.calendarContainer.style.display = 'none';
      if (this.timeSlotContainer) this.timeSlotContainer.style.display = 'none';
      if (this.customerForm) this.customerForm.style.display = 'none';
      
      // Add event listener for scheduling another appointment
      const newAppointmentButton = this.confirmationContainer.querySelector('.new-appointment');
      if (newAppointmentButton) {
        newAppointmentButton.addEventListener('click', () => {
          this.resetScheduler();
        });
      }
    }
  }
  
  resetScheduler() {
    // Reset selected date and time
    this.selectedDate = null;
    this.selectedTime = null;
    
    // Reset form
    if (this.customerForm) {
      this.customerForm.reset();
      this.customerForm.classList.remove('visible');
      this.customerForm.style.display = '';
    }
    
    // Hide confirmation
    if (this.confirmationContainer) {
      this.confirmationContainer.classList.remove('visible');
    }
    
    // Show calendar again
    if (this.calendarContainer) {
      this.calendarContainer.style.display = '';
    }
    
    if (this.timeSlotContainer) {
      this.timeSlotContainer.innerHTML = '';
      this.timeSlotContainer.style.display = '';
    }
    
    // Reset current month to today's month
    this.currentMonth = new Date();
    
    // Render calendar again
    this.renderCalendar();
  }
}

// Export the class for use in other files
export default SchedulingCalendar;