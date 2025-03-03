// Main entry point for the application

// Import main CSS
import "./css/main.css";

// Import JS dependencies
import "lazysizes";

// Register service worker
if (navigator.serviceWorker) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then(registration => {
      console.log("SW registered: ", registration);
    }).catch(error => {
      console.log("SW registration failed: ", error);
    });
  });
}

// Your main application code here
console.log("App initialized");
