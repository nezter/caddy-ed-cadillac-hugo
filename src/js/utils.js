/**
 * Utility functions for the website
 */

// Format number as currency
export function formatCurrency(number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0
  }).format(number);
}

// Format number with commas
export function formatNumber(number) {
  return new Intl.NumberFormat('en-US').format(number);
}

// Debounce function for performance optimization
export function debounce(func, wait) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

// Get URL parameters as object
export function getUrlParams() {
  return Object.fromEntries(
    new URLSearchParams(window.location.search).entries()
  );
}

// Lazy load images (supplement to lazysizes library)
export function initLazyLoading() {
  if ('loading' in HTMLImageElement.prototype) {
    // Use native lazy loading if supported
    document.querySelectorAll('img.lazyload').forEach(img => {
      img.src = img.dataset.src;
      img.loading = 'lazy';
    });
  }
  // Otherwise lazysizes will handle it
}

// Calculate monthly payments for auto loan
export function calculatePayment(price, downPayment, termMonths, interestRate) {
  const loan = price - downPayment;
  const monthlyRate = interestRate / 100 / 12;
  const payment = loan * monthlyRate * Math.pow(1 + monthlyRate, termMonths) / 
    (Math.pow(1 + monthlyRate, termMonths) - 1);
  
  return payment;
}

// Share content via Web Share API
export function shareContent(title, url, text) {
  if (navigator.share) {
    navigator.share({
      title: title,
      url: url,
      text: text
    })
    .catch(error => console.warn('Error sharing:', error));
  } else {
    // Fallback for browsers that don't support Web Share API
    const shareModal = document.createElement('div');
    shareModal.className = 'share-modal';
    
    shareModal.innerHTML = `
      <div class="share-modal-content">
        <h3>Share this page</h3>
        <div class="share-links">
          <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}" target="_blank">Facebook</a>
          <a href="https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}" target="_blank">Twitter</a>
          <a href="mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text + '\n\n' + url)}">Email</a>
        </div>
        <button class="close-btn">Close</button>
      </div>
    `;
    
    document.body.appendChild(shareModal);
    
    shareModal.querySelector('.close-btn').addEventListener('click', () => {
      document.body.removeChild(shareModal);
    });
  }
}

// Initialize utility functions on page load
document.addEventListener('DOMContentLoaded', () => {
  initLazyLoading();
  
  // Initialize share buttons
  document.querySelectorAll('.share-button').forEach(button => {
    button.addEventListener('click', (e) => {
      e.preventDefault();
      const title = button.dataset.title || document.title;
      const url = button.dataset.url || window.location.href;
      const text = button.dataset.text || '';
      shareContent(title, url, text);
    });
  });
});
