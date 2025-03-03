// JS
import "./js/main";
import "lazysizes";

// CSS
import "./css/main.css";

// Images
function importAll(r) {
  return r.keys().map(r);
}
importAll(require.context("./img/", true, /\.(png|jpe?g|gif|svg)$/));

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
