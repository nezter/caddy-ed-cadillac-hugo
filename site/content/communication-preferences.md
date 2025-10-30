---
title: "Communication Preferences"
description: "Manage your communication preferences and privacy settings"
layout: "page"
---

<div id="communication-preferences-container">
  <!-- Communication Preferences Component will be loaded here -->
</div>

<script>
// Load the communication preferences component
document.addEventListener('DOMContentLoaded', function() {
  // Load the CSS
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = '/css/components/communication-preferences.css';
  document.head.appendChild(cssLink);

  // Load the JavaScript component
  const script = document.createElement('script');
  script.src = '/js/components/communication-preferences.js';
  script.onload = function() {
    // Initialize the component
    new CommunicationPreferences('communication-preferences-container');
  };
  document.body.appendChild(script);
});
</script>

<style>
/* Additional page-specific styles */
body {
  background-color: #f8f9fa;
}

#communication-preferences-container {
  min-height: 400px;
}
</style>