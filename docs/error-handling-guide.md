# Error Handling Guide

This document provides comprehensive documentation for the error handling system implemented in the Caddy Ed Cadillac website. It covers the main components, usage patterns, and best practices.

## Table of Contents

1. [System Overview](#system-overview)
2. [Components](#components)
3. [Usage Patterns](#usage-patterns)
4. [Best Practices](#best-practices)
5. [Code Examples](#code-examples)
6. [Testing](#testing)

## System Overview

The error handling system provides a consistent approach to handling errors across the frontend. It consists of several interconnected components:

- **Error Handler Utility**: Core functions for parsing and displaying errors
- **Error Event System**: Central error event handling and notification
- **Global Notification System**: Site-wide notification display
- **API Service**: Standardized API requests with error handling

The system addresses these key requirements:
- Consistent error handling across components
- User-friendly error messages
- Field-level validation error display
- Network error recovery options
- Non-intrusive critical error notifications
- Form data preservation during errors

## Components

### Error Handler Utility

Located at `/src/js/utils/error-handler.js`, this utility provides core error handling functions:

| Function | Purpose |
|----------|---------|
| `parseApiError` | Standardizes different error types into a consistent format |
| `extractValidationErrors` | Extracts field-level errors from API responses |
| `getUserMessage` | Generates user-friendly error messages |
| `displayErrorMessage` | Displays error messages in specified containers |
| `displayFieldErrors` | Shows field-level errors in forms |
| `createRetryFunction` | Creates functions with automatic retry capability |
| `preserveFormData` | Saves form data to prevent loss during errors |
| `restoreFormData` | Restores preserved form data |
| `logError` | Logs errors to console and/or analytics |

### Error Event System

Located at `/src/js/utils/error-event-system.js`, this system provides:

- Custom events for different error types
- Central error handling and notification
- Connection between components and the notification system

### Global Notification System

Located at `/src/js/components/notification.js`, this component:

- Displays notifications of different types (info, success, warning, error)
- Supports different positions (top, bottom, left, right, center)
- Provides auto-dismiss and animation features
- Ensures accessibility compliance

### API Service

Located at `/src/js/services/api-service.js`, this service:

- Provides standardized methods for API requests
- Includes built-in error handling
- Connects to the error event system

## Usage Patterns

### Basic Error Handling

For simple error handling in a try/catch:

```javascript
import { parseApiError, displayErrorMessage } from '../utils/error-handler';

try {
  // Code that might throw an error
  const response = await fetch('/api/data');
  if (!response.ok) throw response;
  return await response.json();
} catch (error) {
  const parsedError = parseApiError(error);
  displayErrorMessage('#errorContainer', parsedError.message);
  return null;
}
```

### Form Error Handling

For handling form validation errors:

```javascript
import { 
  parseApiError, 
  extractValidationErrors, 
  displayFieldErrors,
  preserveFormData 
} from '../utils/error-handler';

// Before submitting, preserve form data
preserveFormData(form);

try {
  const response = await fetch('/api/submit-form', {
    method: 'POST',
    body: new FormData(form)
  });
  
  if (!response.ok) throw response;
  
  // Handle success
  form.reset();
} catch (error) {
  const parsedError = parseApiError(error);
  
  if (parsedError.type === 'validation') {
    // Extract and display field-specific errors
    const fieldErrors = extractValidationErrors(parsedError);
    displayFieldErrors(form, fieldErrors);
  } else {
    // Display general error message
    displayErrorMessage('#form-error', parsedError.message);
  }
}
```

### Using the Retry Mechanism

For network-sensitive operations:

```javascript
import { createRetryFunction } from '../utils/error-handler';

const fetchWithRetry = createRetryFunction(
  fetchData, // Original function
  {
    maxAttempts: 3,
    delay: 1000,
    backoffFactor: 2,
    onRetry: (attempt) => {
      console.log(`Retry attempt ${attempt}`);
    }
  }
);

// Will retry up to 3 times with exponential backoff
const result = await fetchWithRetry();
```

### Global Error Notification

For critical errors that need site-wide visibility:

```javascript
import ErrorEventSystem from '../utils/error-event-system';

// Handle an error with global notification
ErrorEventSystem.handleError(
  error,
  'Payment Processing',
  { notifyUser: true }
);

// Listen for specific error types
ErrorEventSystem.onError(ErrorEventSystem.EVENTS.NETWORK_ERROR, (event) => {
  // Custom handling for network errors
  console.log('Handling network error:', event.detail);
  
  // Prevent default notification
  event.preventDefault();
});
```

## Best Practices

### When to Use Local vs. Global Error Handling

**Use Local Error Handling For:**
- Form validation errors
- Non-critical API errors
- Expected error scenarios (e.g., "no results found")
- Component-specific errors

**Use Global Error Handling For:**
- Critical application errors
- Authentication/authorization failures
- Unexpected exceptions
- Server errors that affect multiple components

### Form Error Handling Best Practices

1. Always preserve form data before submission
2. Show field-level errors next to the relevant fields
3. Use clear, actionable error messages
4. Maintain focus on the first field with an error
5. Ensure errors are accessible to screen readers

### Error Recovery Strategies

1. **Automatic Retry:** For transient network issues
   - Use for GET requests and idempotent operations
   - Apply exponential backoff to avoid overwhelming servers
   
2. **Manual Retry:** For user-initiated operations
   - Provide clear retry buttons
   - Preserve user input data
   
3. **Fallback Content:** When data cannot be loaded
   - Show useful empty states
   - Provide alternative actions

## Code Examples

### Example 1: Complete Contact Form with Error Handling

```javascript
import { 
  parseApiError,
  extractValidationErrors,
  displayFieldErrors,
  preserveFormData,
  restoreFormData,
  createRetryFunction
} from './utils/error-handler';

class ContactForm {
  constructor(formId) {
    this.form = document.getElementById(formId);
    if (!this.form) return;
    
    // Restore any saved form data
    restoreFormData(this.form);
    
    // Add submit handler
    this.form.addEventListener('submit', this.handleSubmit.bind(this));
  }
  
  async handleSubmit(event) {
    event.preventDefault();
    
    // Save form data in case of error
    preserveFormData(this.form);
    
    // Get form data
    const formData = new FormData(this.form);
    
    try {
      // Submit with retry capability
      const submitWithRetry = createRetryFunction(
        this.submitForm.bind(this, formData),
        { maxAttempts: 2 }
      );
      
      const response = await submitWithRetry();
      
      // Handle success
      this.form.reset();
      this.showSuccessMessage('Your message has been sent successfully!');
      
    } catch (error) {
      this.handleError(error);
    }
  }
  
  async submitForm(formData) {
    const response = await fetch('/api/contact', {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) throw response;
    return response.json();
  }
  
  handleError(error) {
    const parsedError = parseApiError(error);
    
    // Handle validation errors
    if (parsedError.type === 'validation') {
      const fieldErrors = extractValidationErrors(parsedError);
      displayFieldErrors(this.form, fieldErrors);
      
      // Focus first field with error
      const firstErrorField = this.form.querySelector('[aria-invalid="true"]');
      if (firstErrorField) firstErrorField.focus();
      
    } else {
      // Handle other errors
      this.showErrorMessage(parsedError.message);
    }
  }
  
  showSuccessMessage(message) {
    // Display success message
  }
  
  showErrorMessage(message) {
    // Display error message
  }
}
```

### Example 2: Using the Global Error Event System

```javascript
import ErrorEventSystem from './utils/error-event-system';

// Register global error handlers
function initGlobalErrorHandlers() {
  // Handle network errors
  ErrorEventSystem.onError(ErrorEventSystem.EVENTS.NETWORK_ERROR, (event) => {
    // Check if offline
    if (!navigator.onLine) {
      // Show a persistent offline notice
      // Prevent default notification
      event.preventDefault();
    }
  });
  
  // Handle authentication errors
  ErrorEventSystem.onError(ErrorEventSystem.EVENTS.API_ERROR, (event) => {
    const error = event.detail;
    
    if (error.status === 401) {
      // Redirect to login page
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      
      // Prevent default notification
      event.preventDefault();
    }
  });
}
```

### Example 3: Inventory Component with Error States

```javascript
import { createInventoryLoader } from './error-states';

class InventoryList {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    if (!this.container) return;
    
    // Create loading function with built-in error handling
    this.loadInventory = createInventoryLoader(
      this.fetchInventory.bind(this),
      this.container,
      this.renderInventory.bind(this)
    );
    
    // Initial load
    this.loadInventory();
  }
  
  async fetchInventory() {
    // Fetch inventory data
  }
  
  renderInventory(data) {
    // Render inventory items
  }
}
```

## Testing

### Test Scenarios

| Category | Test | Description |
|----------|------|-------------|
| Network | Offline Test | Disable network and trigger API calls |
| Network | Slow Connection | Use throttling to simulate slow network |
| API Errors | Status Codes | Test handling of different HTTP status codes |
| Validation | Form Errors | Submit forms with invalid data |
| Recovery | Auto Retry | Verify retry behavior works correctly |
| Integration | Global Handling | Test uncaught errors are properly captured |
| Accessibility | Screen Reader | Verify errors are announced properly |
| Accessibility | Keyboard | Test keyboard navigation with error states |

### Testing Tools

- **Browser DevTools:** Network conditions and console
- **Screen readers:** NVDA, VoiceOver
- **Error simulation:** Create test endpoints that return errors
