/**
 * Inventory Error States
 * 
 * This module provides error state components and handling for inventory listings and details.
 * It integrates with the error handler utility to provide consistent error experiences.
 */
import { 
  parseApiError, 
  displayErrorMessage, 
  createRetryFunction,
  logError
} from '../utils/error-handler';

/**
 * Creates an empty state element for inventory listings when no data is available
 * @param {string} message - The message to display
 * @param {Function} retryFn - Optional function to call when retry button is clicked
 * @returns {HTMLElement} The empty state element
 */
export function createEmptyState(message = 'No vehicles found', retryFn = null) {
  const container = document.createElement('div');
  container.className = 'inventory-empty-state';
  
  const icon = document.createElement('div');
  icon.className = 'empty-state-icon';
  icon.innerHTML = `<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
    <path d="M8 21h8"></path>
    <path d="M12 17v4"></path>
    <path d="M9 7l6 6"></path>
    <path d="M15 7l-6 6"></path>
  </svg>`;
  
  const messageEl = document.createElement('h3');
  messageEl.textContent = message;
  
  container.appendChild(icon);
  container.appendChild(messageEl);
  
  // Add retry button if a retry function is provided
  if (typeof retryFn === 'function') {
    const retryButton = document.createElement('button');
    retryButton.className = 'btn btn-primary retry-button';
    retryButton.textContent = 'Try Again';
    retryButton.addEventListener('click', retryFn);
    container.appendChild(retryButton);
  }
  
  return container;
}

/**
 * Creates a loading state element for inventory listings
 * @returns {HTMLElement} The loading state element
 */
export function createLoadingState() {
  const container = document.createElement('div');
  container.className = 'inventory-loading-state';
  container.setAttribute('aria-live', 'polite');
  
  const spinner = document.createElement('div');
  spinner.className = 'loading-spinner';
  spinner.setAttribute('aria-hidden', 'true');
  
  const message = document.createElement('p');
  message.textContent = 'Loading inventory...';
  
  container.appendChild(spinner);
  container.appendChild(message);
  
  return container;
}

/**
 * Handles API errors for inventory components
 * @param {Error|Response} error - The error object
 * @param {HTMLElement} container - The container element to display error in
 * @param {Function} retryFn - Optional function to retry the operation
 * @param {Object} options - Additional options
 * @returns {HTMLElement} The error element that was inserted
 */
export function handleInventoryError(error, container, retryFn = null, options = {}) {
  // Default options
  const config = {
    logErrors: true,
    showRetryButton: !!retryFn,
    context: 'Inventory Component',
    emptyStateMessage: null,
    ...options
  };
  
  // Clear container contents
  if (container) {
    container.innerHTML = '';
  } else {
    console.error('No container provided for error display');
    return null;
  }
  
  // Parse the error
  const parsedError = parseApiError(error);
  
  // Log the error if requested
  if (config.logErrors) {
    logError(parsedError, config.context);
  }
  
  let errorElement;
  
  // Different handling based on error type
  if (parsedError.type === 'network') {
    // Network error - show retry option
    const message = 'Unable to connect to the server. Please check your connection and try again.';
    errorElement = createEmptyState(message, config.showRetryButton ? retryFn : null);
  } else if (parsedError.type === 'notFound') {
    // Not found - show friendly empty state
    const message = config.emptyStateMessage || 'No inventory items found matching your criteria.';
    errorElement = createEmptyState(message);
  } else if (parsedError.status >= 500) {
    // Server error - show retry option
    const message = 'Our server is currently experiencing issues. Please try again later.';
    errorElement = createEmptyState(message, config.showRetryButton ? retryFn : null);
  } else {
    // Generic error
    const message = parsedError.message || 'An error occurred while loading inventory.';
    errorElement = createEmptyState(message, config.showRetryButton ? retryFn : null);
  }
  
  // Add to container
  container.appendChild(errorElement);
  
  // Add class to container for styling
  container.classList.add('has-error');
  
  return errorElement;
}

/**
 * Creates a retry wrapper for inventory data loading functions
 * @param {Function} fetchFn - The original fetch function
 * @param {HTMLElement} container - The container element to update with states
 * @param {Function} renderFn - The function to render successful results
 * @param {Object} options - Retry and display options
 */
export function createInventoryLoader(fetchFn, container, renderFn, options = {}) {
  // Default options
  const config = {
    showLoadingState: true,
    maxRetries: 2,
    retryDelay: 2000,
    context: 'Inventory Loader',
    ...options
  };
  
  // Create the retry function
  const fetchWithRetry = createRetryFunction(fetchFn, {
    maxAttempts: config.maxRetries + 1, // +1 because first attempt isn't a "retry"
    delay: config.retryDelay,
    onRetry: (attempt) => {
      // Show retry message
      const retryMessage = document.createElement('div');
      retryMessage.className = 'retry-message';
      retryMessage.textContent = `Connection issue. Retrying (${attempt}/${config.maxRetries})...`;
      retryMessage.setAttribute('aria-live', 'polite');
      
      // Clear and add to container
      container.innerHTML = '';
      container.appendChild(retryMessage);
    }
  });
  
  // Return the loader function
  return async function loadInventory(...args) {
    // Remove any existing error state
    container.classList.remove('has-error');
    
    // Show loading state if requested
    if (config.showLoadingState) {
      container.innerHTML = '';
      container.appendChild(createLoadingState());
    }
    
    try {
      // Fetch data with retry capability
      const data = await fetchWithRetry(...args);
      
      // If successful, clear container and render
      container.innerHTML = '';
      renderFn(data, container);
      
      return data;
    } catch (error) {
      // If all retries failed, show error state
      const retryFn = () => loadInventory(...args);
      handleInventoryError(error, container, retryFn, {
        context: config.context,
        showRetryButton: true
      });
      
      // Re-throw to allow calling function to handle if needed
      throw error;
    }
  };
}

/**
 * Adds retry button to existing inventory containers
 * @param {HTMLElement} container - The container element
 * @param {Function} retryFn - Function to call on retry
 * @param {string} message - Optional message to display
 */
export function addRetryButton(container, retryFn, message = 'Unable to load inventory. Please try again.') {
  // Create retry button
  const retryContainer = document.createElement('div');
  retryContainer.className = 'retry-container';
  
  const messageEl = document.createElement('p');
  messageEl.textContent = message;
  
  const button = document.createElement('button');
  button.className = 'btn btn-primary retry-button';
  button.textContent = 'Try Again';
  button.addEventListener('click', retryFn);
  
  retryContainer.appendChild(messageEl);
  retryContainer.appendChild(button);
  
  // Clear and add to container
  container.innerHTML = '';
  container.appendChild(retryContainer);
}
