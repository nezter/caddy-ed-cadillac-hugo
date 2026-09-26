/**
 * Simple carousel component
 */
class Carousel {
  constructor(element) {
    this.element = element;
    this.container = element.querySelector('.carousel-container');
    this.slides = element.querySelectorAll('.carousel-slide');
    this.prevButton = element.querySelector('.carousel-prev');
    this.nextButton = element.querySelector('.carousel-next');
    this.indicators = element.querySelector('.carousel-indicators');
    this.currentIndex = 0;
    this.slideWidth = 0;
    this.autoplayInterval = null;
    this.autoplayDelay = element.dataset.autoplayDelay || 5000;
    this.autoplay = element.dataset.autoplay === 'true';
    
    this.init();
  }
  
  init() {
    if (this.slides.length <= 1) return;
    
    // Add event listeners
    if (this.prevButton) {
      this.prevButton.addEventListener('click', () => this.prev());
    }
    if (this.nextButton) {
      this.nextButton.addEventListener('click', () => this.next());
    }
    
    // Create indicators if container exists
    if (this.indicators) {
      this.createIndicators();
    }
    
    // Handle resize events
    window.addEventListener('resize', () => {
      this.setSlideWidth();
      this.goToSlide(this.currentIndex);
    });
    
    // Initialize slide width and position
    this.setSlideWidth();
    
    // Setup autoplay if enabled
    if (this.autoplay) {
      this.startAutoplay();
      
      // Pause on hover
      this.element.addEventListener('mouseenter', () => this.stopAutoplay());
      this.element.addEventListener('mouseleave', () => this.startAutoplay());
    }
    
    // Add swipe support for touch devices
    this.setupTouchEvents();
  }
  
  setSlideWidth() {
    this.slideWidth = this.element.offsetWidth;
    this.slides.forEach(slide => {
      slide.style.width = `${this.slideWidth}px`;
    });
    this.container.style.width = `${this.slideWidth * this.slides.length}px`;
  }
  
  createIndicators() {
    this.indicators.innerHTML = '';
    const fragment = document.createDocumentFragment();
    
    this.slides.forEach((_, index) => {
      const button = document.createElement('button');
      button.classList.add('carousel-indicator');
      if (index === 0) button.classList.add('active');
      button.addEventListener('click', () => this.goToSlide(index));
      fragment.appendChild(button);
    });
    
    this.indicators.appendChild(fragment);
  }
  
  updateIndicators() {
    const indicators = this.indicators.querySelectorAll('.carousel-indicator');
    indicators.forEach((indicator, index) => {
      if (index === this.currentIndex) {
        indicator.classList.add('active');
      } else {
        indicator.classList.remove('active');
      }
    });
  }
  
  prev() {
    if (this.currentIndex <= 0) {
      this.goToSlide(this.slides.length - 1);
    } else {
      this.goToSlide(this.currentIndex - 1);
    }
  }
  
  next() {
    if (this.currentIndex >= this.slides.length - 1) {
      this.goToSlide(0);
    } else {
      this.goToSlide(this.currentIndex + 1);
    }
  }
  
  goToSlide(index) {
    this.currentIndex = index;
    const offset = -this.slideWidth * this.currentIndex;
    this.container.style.transform = `translateX(${offset}px)`;
    
    if (this.indicators) {
      this.updateIndicators();
    }
  }
  
  startAutoplay() {
    this.autoplayInterval = setInterval(() => {
      this.next();
    }, this.autoplayDelay);
  }
  
  stopAutoplay() {
    clearInterval(this.autoplayInterval);
  }
  
  setupTouchEvents() {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    
    this.container.addEventListener('touchstart', (e) => {
      isDragging = true;
      startX = e.touches[0].clientX;
      this.container.style.transition = 'none';
    }, { passive: true });
    
    this.container.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      
      currentX = e.touches[0].clientX;
      const diffX = currentX - startX;
      const offset = -this.slideWidth * this.currentIndex + diffX;
      this.container.style.transform = `translateX(${offset}px)`;
    }, { passive: true });
    
    this.container.addEventListener('touchend', () => {
      if (!isDragging) return;
      
      isDragging = false;
      this.container.style.transition = '';
      
      const diffX = currentX - startX;
      const threshold = this.slideWidth * 0.2; // 20% of slide width
      
      if (Math.abs(diffX) > threshold) {
        if (diffX > 0) {
          this.prev();
        } else {
          this.next();
        }
      } else {
        // Return to current slide
        this.goToSlide(this.currentIndex);
      }
    });
  }
}

// Initialize all carousels when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const carousels = document.querySelectorAll('.carousel');
  carousels.forEach(carousel => {
    new Carousel(carousel);
  });
});

export default Carousel;
