/**
 * Lead Generator Module
 * Handles lead capture forms, popups, and tracking
 */

class LeadGenerator {
  constructor(options = {}) {
    this.popupDelay = options.popupDelay || 30000; // 30 seconds
    this.exitIntentEnabled = options.exitIntentEnabled !== false;
    this.scrollDepthTrigger = options.scrollDepthTrigger || 50; // 50%
    this.cookieDuration = options.cookieDuration || 7; // 7 days
    
    this.popupShown = false;
    
    this.initialize();
  }
  
  initialize() {
    // Check if popups are already dismissed via cookie
    if (this.getCookie('popup_dismissed')) {
      return;
    }
    
    // Set up all lead capture forms
    this.initializeForms();
    
    // Set up timed popup
    setTimeout(() => {
      this.showPopup('timed');
    }, this.popupDelay);
    
    // Set up exit intent popup
    if (this.exitIntentEnabled) {
      this.initializeExitIntent();
    }
    
    // Set up scroll depth trigger
    this.initializeScrollTrigger();
    
    // Set up CTA button triggers
    this.initializeCTATriggers();
  }
  
  initializeForms() {
    const leadForms = document.querySelectorAll('.lead-form, .newsletter-form, .contact-form');
    
    leadForms.forEach(form => {
      form.addEventListener('submit', (e) => {
        // Form validation is handled by contact-form.js
        // Here we just track the submission
        this.trackFormSubmission(form.id || form.classList[0]);
      });
    });
  }
  
  initializeExitIntent() {
    document.addEventListener('mouseout', (e) => {
      if (!e.toElement && !e.relatedTarget && e.clientY < 10 && !this.popupShown) {
        this.showPopup('exit');
      }
    });
    
    // For mobile, detect back button press
    window.addEventListener('popstate', (e) => {
      if (!this.popupShown) {
        this.showPopup('exit');
        history.pushState(null, document.title, window.location.href);
      }
    });
    
    // Push current state
    history.pushState(null, document.title, window.location.href);
  }
  
  initializeScrollTrigger() {
    window.addEventListener('scroll', () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = document.documentElement.clientHeight;
      
      const scrollPercent = (scrollTop / (scrollHeight - clientHeight)) * 100;
      
      if (scrollPercent >= this.scrollDepthTrigger && !this.popupShown) {
        this.showPopup('scroll');
      }
    });
  }
  
  initializeCTATriggers() {
    const ctaButtons = document.querySelectorAll('[data-lead-trigger]');
    
    ctaButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        const popupId = button.dataset.leadTarget;
        
        if (popupId) {
          e.preventDefault();
          this.showSpecificPopup(popupId, 'cta');
        }
      });
    });
  }
  
  showSpecificPopup(popupId, triggerType) {
    const popup = document.getElementById(popupId);
    
    if (!popup) return;
    
    popup.classList.add('active');
    this.popupShown = true;
    
    // Track popup display
    this.trackPopupDisplay(popupId, triggerType);
    
    // Add close handlers
    this.setupPopupCloseHandlers(popup);
  }
  
  showPopup(triggerType) {
    if (this.popupShown) return;
    
    // Determine which popup to show based on trigger type and page
    let popupId = 'lead-popup';
    
    // Vehicle detail page - show financing popup
    if (window.location.pathname.includes('/vehicles/') || 
        document.querySelector('.vehicle-detail')) {
      popupId = 'financing-popup';
    }
    // Contact page - show appointment popup
    else if (window.location.pathname.includes('/contact') || 
             document.querySelector('.contact-page')) {
      popupId = 'appointment-popup';
    }
    
    const popup = document.getElementById(popupId);
    if (!popup) return;
    
    popup.classList.add('active');
    this.popupShown = true;
    
    // Track popup display
    this.trackPopupDisplay(popupId, triggerType);
    
    // Add close handlers
    this.setupPopupCloseHandlers(popup);
  }
  
  setupPopupCloseHandlers(popup) {
    const closeButtons = popup.querySelectorAll('.popup-close, [data-close]');
    
    closeButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.preventDefault();
        this.closePopup(popup);
      });
    });
    
    // Close on overlay click
    popup.addEventListener('click', (e) => {
      if (e.target === popup) {
        this.closePopup(popup);
      }
    });
    
    // Close on escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closePopup(popup);
      }
    });
  }
  
  closePopup(popup) {
    popup.classList.remove('active');
    
    // Set cookie to prevent popups for a period
    this.setCookie('popup_dismissed', 'true', this.cookieDuration);
    
    // Track popup close
    this.trackPopupClose(popup.id);
  }
  
  trackFormSubmission(formId) {
    // Track form submission - compatible with analytics.js
    if (window.dataLayer) {
      window.dataLayer.push({
        event: 'formSubmission',
        formId: formId
      });
    }
    
    console.log(`Form submitted: ${formId}`);
  }
  
  trackPopupDisplay(popupId, triggerType) {
    // Track popup display - compatible with analytics.js
    if (window.dataLayer) {
      window.dataLayer.push({
        event: 'popupDisplay',
        popupId: popupId,
        triggerType: triggerType
      });
    }
    
    console.log(`Popup displayed: ${popupId}, Trigger: ${triggerType}`);
  }
  
  trackPopupClose(popupId) {
    // Track popup close - compatible with analytics.js
    if (window.dataLayer) {
      window.dataLayer.push({
        event: 'popupClose',
        popupId: popupId
      });
    }
    
    console.log(`Popup closed: ${popupId}`);
  }
  
  setCookie(name, value, days) {
    let expires = '';
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
      expires = `; expires=${date.toUTCString()}`;
    }
    document.cookie = `${name}=${value}${expires}; path=/`;
  }
  
  getCookie(name) {
    const nameEQ = `${name}=`;
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }
}

// Initialize lead generator on DOM content loaded
document.addEventListener('DOMContentLoaded', () => {
  new LeadGenerator({
    popupDelay: 45000, // 45 seconds
    exitIntentEnabled: true,
    scrollDepthTrigger: 65 // 65% scroll depth
  });
});

export default LeadGenerator;
