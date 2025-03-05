import lazySizes from "lazysizes";

// Initialize lazySizes
lazySizes.init();

document.addEventListener('DOMContentLoaded', function() {
  // Add lazyload class to all images that don't have it
  const images = document.querySelectorAll('img:not(.lazyload):not([data-src])');
  
  images.forEach(img => {
    // Don't process images that are already properly set up
    if (img.classList.contains('lazyload') || img.dataset.src) return;
    
    // Save current src
    const src = img.getAttribute('src');
    if (!src) return;
    
    // Change to data-src for lazy loading
    img.setAttribute('data-src', src);
    img.setAttribute('src', 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==');
    img.classList.add('lazyload');
  });
});
