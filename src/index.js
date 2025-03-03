// Main entry point for the application

// Import main CSS
import "./css/main.css";

// Import JS dependencies
import "lazysizes";
import "./js/cms";

// Register service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then(registration => {
      console.log('SW registered: ', registration);
    }).catch(registrationError => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}

// Your main application code here
console.log("App initialized");

// Add any other frontend logic here
document.addEventListener('DOMContentLoaded', () => {
  // This is just a placeholder for any additional code
  console.log('DOM fully loaded and parsed');
});
