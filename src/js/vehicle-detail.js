/**
 * Vehicle Detail Page
 * Handles image gallery, features, and contact form for specific vehicle
 */

class VehicleDetail {
  constructor(options = {}) {
    this.container = options.container || document.querySelector('.vehicle-detail');
    this.galleryContainer = options.galleryContainer || document.querySelector('.vehicle-gallery');
    this.currentSlide = 0;
    this.slides = [];

    if (this.container) {
      this.initialize();
    }
  }

  initialize() {
    // Initialize image gallery
    this.initializeGallery();
    
    // Initialize contact form events
    this.initializeContactForm();
    
    // Initialize similar vehicles slider
    this.initializeSimilarVehicles();
  }

  initializeGallery() {
    if (!this.galleryContainer) return;
    
    this.slides = Array.from(this.galleryContainer.querySelectorAll('.vehicle-slide'));
    if (!this.slides.length) return;
    
    // Create navigation buttons
    const prevButton = document.createElement('button');
    prevButton.className = 'gallery-prev';
    prevButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
    
    const nextButton = document.createElement('button');
    nextButton.className = 'gallery-next';
    nextButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
    
    const navContainer = document.createElement('div');
    navContainer.className = 'gallery-nav';
    navContainer.appendChild(prevButton);
    navContainer.appendChild(nextButton);
    
    this.galleryContainer.appendChild(navContainer);
    
    // Add thumbnails
    this.createThumbnails();
    
    // Set up event listeners
    prevButton.addEventListener('click', () => this.prevSlide());
    nextButton.addEventListener('click', () => this.nextSlide());
    
    // Show first slide
    this.showSlide(0);
  }

  createThumbnails() {
    const thumbsContainer = document.createElement('div');
    thumbsContainer.className = 'gallery-thumbnails';
    
    this.slides.forEach((slide, index) => {
      const thumb = document.createElement('div');
      thumb.className = 'gallery-thumb';
      
      // Get the image from the slide
      const slideImg = slide.querySelector('img');
      if (slideImg) {
        const thumbImg = document.createElement('img');
        thumbImg.src = slideImg.src;
        thumbImg.alt = slideImg.alt;
        thumb.appendChild(thumbImg);
      }
      
      thumb.addEventListener('click', () => this.showSlide(index));
      thumbsContainer.appendChild(thumb);
    });
    
    this.galleryContainer.appendChild(thumbsContainer);
    this.thumbs = Array.from(thumbsContainer.querySelectorAll('.gallery-thumb'));
  }

  showSlide(index) {
    if (index < 0) {
      index = this.slides.length - 1;
    } else if (index >= this.slides.length) {
      index = 0;
    }
    
    this.slides.forEach((slide, i) => {
      slide.style.display = i === index ? 'block' : 'none';
    });
    
    if (this.thumbs) {
      this.thumbs.forEach((thumb, i) => {
        if (i === index) {
          thumb.classList.add('active');
        } else {
          thumb.classList.remove('active');
        }
      });
    }
    
    this.currentSlide = index;
  }

  prevSlide() {
    this.showSlide(this.currentSlide - 1);
  }

  nextSlide() {
    this.showSlide(this.currentSlide + 1);
  }

  initializeContactForm() {
    const contactForm = this.container.querySelector('.vehicle-contact-form');
    if (!contactForm) return;
    
    const form = contactForm.querySelector('form');
    const vehicleInfoField = contactForm.querySelector('[name="vehicle-info"]');
    const vehicleTitle = this.container.querySelector('.vehicle-title');
    
    // Pre-populate the vehicle info field if it exists
    if (vehicleInfoField && vehicleTitle) {
      vehicleInfoField.value = vehicleTitle.textContent.trim();
    }
    
    // Handle form submission
    if (form) {
      form.addEventListener('submit', this.handleContactFormSubmit.bind(this));
    }
    
    // Initialize form validation
    this.initializeFormValidation(form);
  }
  
  handleContactFormSubmit(event) {
    event.preventDefault();
    
    const form = event.target;
    if (!this.validateForm(form)) return;
    
    // Show loading state
    const submitBtn = form.querySelector('[type="submit"]');
    const originalBtnText = submitBtn.textContent;
    submitBtn.textContent = 'Sending...';
    submitBtn.disabled = true;
    
    // Get form data
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Submit the form data using fetch API
    fetch('/api/inquire', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    })
    .then(response => response.json())
    .then(result => {
      // Show success message
      const successMsg = document.createElement('div');
      successMsg.className = 'form-success';
      successMsg.textContent = 'Thank you for your interest! Our team will contact you shortly.';
      form.innerHTML = '';
      form.appendChild(successMsg);
    })
    .catch(error => {
      // Show error message
      console.error('Form submission error:', error);
      const errorMsg = document.createElement('div');
      errorMsg.className = 'form-error';
      errorMsg.textContent = 'Sorry, there was a problem submitting your request. Please try again or call us directly.';
      form.prepend(errorMsg);
      
      // Reset button
      submitBtn.textContent = originalBtnText;
      submitBtn.disabled = false;
    });
  }
  
  initializeFormValidation(form) {
    if (!form) return;
    
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(input => {
      input.addEventListener('blur', () => {
        this.validateInput(input);
      });
    });
  }
  
  validateInput(input) {
    const isRequired = input.hasAttribute('required');
    const value = input.value.trim();
    let isValid = true;
    const errorMessage = input.nextElementSibling?.classList.contains('error-message') 
      ? input.nextElementSibling 
      : null;
    
    // Check if field is required and empty
    if (isRequired && value === '') {
      isValid = false;
      this.showInputError(input, errorMessage, 'This field is required');
      return false;
    }
    
    // Validate email format
    if (input.type === 'email' && value !== '') {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(value)) {
        isValid = false;
        this.showInputError(input, errorMessage, 'Please enter a valid email address');
        return false;
      }
    }
    
    // Validate phone format
    if (input.type === 'tel' && value !== '') {
      const phonePattern = /^[0-9\-\+\s\(\)]{10,15}$/;
      if (!phonePattern.test(value)) {
        isValid = false;
        this.showInputError(input, errorMessage, 'Please enter a valid phone number');
        return false;
      }
    }
    
    // Clear error if valid
    if (isValid) {
      input.classList.remove('invalid');
      if (errorMessage) {
        errorMessage.textContent = '';
        errorMessage.style.display = 'none';
      }
    }
    
    return isValid;
  }
  
  showInputError(input, errorMessage, text) {
    input.classList.add('invalid');
    
    if (!errorMessage) {
      errorMessage = document.createElement('div');
      errorMessage.className = 'error-message';
      input.parentNode.insertBefore(errorMessage, input.nextSibling);
    }
    
    errorMessage.textContent = text;
    errorMessage.style.display = 'block';
  }
  
  validateForm(form) {
    const inputs = form.querySelectorAll('input, select, textarea');
    let isFormValid = true;
    
    inputs.forEach(input => {
      if (!this.validateInput(input)) {
        isFormValid = false;
      }
    });
    
    return isFormValid;
  }
  
  initializeSimilarVehicles() {
    const similarVehiclesContainer = this.container.querySelector('.similar-vehicles');
    if (!similarVehiclesContainer) return;
    
    const slider = similarVehiclesContainer.querySelector('.similar-vehicles-slider');
    if (!slider) return;
    
    const slides = slider.querySelectorAll('.vehicle-card');
    if (slides.length < 2) return;
    
    // Create navigation buttons
    const prevButton = document.createElement('button');
    prevButton.className = 'slider-prev';
    prevButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
    
    const nextButton = document.createElement('button');
    nextButton.className = 'slider-next';
    nextButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>';
    
    const navContainer = document.createElement('div');
    navContainer.className = 'slider-nav';
    navContainer.appendChild(prevButton);
    navContainer.appendChild(nextButton);
    
    similarVehiclesContainer.appendChild(navContainer);
    
    // Set up slider functionality
    let currentPosition = 0;
    const slideWidth = slides[0].offsetWidth + parseInt(window.getComputedStyle(slides[0]).marginRight);
    const maxPosition = (slides.length - Math.floor(slider.offsetWidth / slideWidth)) * slideWidth;
    
    // Update slide position
    const updateSliderPosition = () => {
      slider.style.transform = `translateX(-${currentPosition}px)`;
      
      // Disable/enable navigation buttons
      prevButton.disabled = currentPosition === 0;
      nextButton.disabled = currentPosition >= maxPosition;
    };
    
    // Set up event listeners
    prevButton.addEventListener('click', () => {
      currentPosition = Math.max(0, currentPosition - slideWidth);
      updateSliderPosition();
    });
    
    nextButton.addEventListener('click', () => {
      currentPosition = Math.min(maxPosition, currentPosition + slideWidth);
      updateSliderPosition();
    });
    
    // Initialize position
    updateSliderPosition();
    
    // Update on window resize
    window.addEventListener('resize', () => {
      const newSlideWidth = slides[0].offsetWidth + parseInt(window.getComputedStyle(slides[0]).marginRight);
      const newMaxPosition = (slides.length - Math.floor(slider.offsetWidth / newSlideWidth)) * newSlideWidth;
      
      currentPosition = Math.min(currentPosition, newMaxPosition);
      updateSliderPosition();
    });
  }
}

// Initialize the vehicle detail page functionality
document.addEventListener('DOMContentLoaded', () => {
  new VehicleDetail();
});

export default VehicleDetail;