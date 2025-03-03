/**
 * Service Worker Registration
 */
export function registerSW() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js')
        .then(registration => {
          console.log('Service Worker registered with scope:', registration.scope);
        })
        .catch(error => {
          console.error('Service Worker registration failed:', error);
        });
    });
  }
}

/**
 * Check if application can be installed (PWA)
 */
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevent Chrome 67+ from automatically showing the prompt
  e.preventDefault();
  // Stash the event so it can be triggered later
  deferredPrompt = e;
  
  // Show install button or notification
  const installButtons = document.querySelectorAll('.install-app-button');
  installButtons.forEach(button => {
    button.style.display = 'block';
    button.addEventListener('click', installApp);
  });
});

function installApp() {
  if (!deferredPrompt) return;
  
  // Show the install prompt
  deferredPrompt.prompt();
  
  // Wait for the user to respond to the prompt
  deferredPrompt.userChoice.then(choiceResult => {
    if (choiceResult.outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    // Clear the saved prompt since it can't be used again
    deferredPrompt = null;
    
    // Hide install buttons
    const installButtons = document.querySelectorAll('.install-app-button');
    installButtons.forEach(button => {
      button.style.display = 'none';
    });
  });
}
