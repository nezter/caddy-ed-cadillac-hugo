/**
 * Navigation and header functionality
 */

class Navigation {
  constructor() {
    this.header = document.querySelector('.site-header');
    this.navToggle = document.querySelector('.nav-toggle');
    this.navMenu = document.querySelector('.nav-menu');
    this.scrollThreshold = 100;
    this.lastScrollPosition = 0;
    
    this.init();
  }
  
  init() {
    if (!this.header) return;
    
    // Mobile menu toggle
    if (this.navToggle && this.navMenu) {
      this.navToggle.addEventListener('click', this.toggleMobileMenu.bind(this));
      
      // Close menu when clicking outside
      document.addEventListener('click', (e) => {
        if (this.navMenu.classList.contains('active') && 
            !this.navMenu.contains(e.target) && 
            !this.navToggle.contains(e.target)) {
          this.toggleMobileMenu();
        }
      });
    }
    
    // Scroll event for sticky header
    window.addEventListener('scroll', this.handleScroll.bind(this));
    
    // Set active menu item
    this.setActiveMenuItem();
  }
  
  toggleMobileMenu() {
    this.navMenu.classList.toggle('active');
    this.navToggle.classList.toggle('active');
    
    // Toggle aria-expanded
    const isExpanded = this.navToggle.getAttribute('aria-expanded') === 'true';
    this.navToggle.setAttribute('aria-expanded', !isExpanded);
    
    // Toggle scroll lock on body
    document.body.classList.toggle('nav-open');
  }
  
  handleScroll() {
    const scrollPosition = window.pageYOffset;
    
    // Add sticky class when scrolling down
    if (scrollPosition > this.scrollThreshold) {
      this.header.classList.add('sticky');
    } else {
      this.header.classList.remove('sticky');
    }
    
    // Hide/show header based on scroll direction
    if (scrollPosition > this.lastScrollPosition && scrollPosition > this.header.offsetHeight) {
      this.header.classList.add('header-hidden');
    } else {
      this.header.classList.remove('header-hidden');
    }
    
    this.lastScrollPosition = scrollPosition;
  }
  
  setActiveMenuItem() {
    const currentPath = window.location.pathname;
    const navLinks = document.querySelectorAll('.nav-menu a');
    
    navLinks.forEach(link => {
      const linkPath = link.getAttribute('href');
      
      if (linkPath === '/' && currentPath === '/') {
        link.classList.add('active');
      } else if (linkPath !== '/' && currentPath.startsWith(linkPath)) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });
  }
}

// Initialize navigation
document.addEventListener('DOMContentLoaded', () => {
  new Navigation();
});

export default Navigation;
