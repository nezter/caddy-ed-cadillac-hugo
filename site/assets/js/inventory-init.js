/**
 * Inventory initialization
 * 
 * This script initializes the inventory filtering functionality
 * on pages that have the necessary elements.
 */

import InventoryFilters from './inventory/InventoryFilters';

// Initialize inventory filtering when the DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Check if we're on an inventory page with the required elements
  const filterContainer = document.querySelector('#inventory-filters');
  const resultsContainer = document.querySelector('#vehicle-inventory');
  
  if (filterContainer && resultsContainer) {
    // Initialize the inventory filters
    const inventoryFilters = new InventoryFilters({
      filterContainer: '#inventory-filters',
      filterToggle: '.filter-toggle',
      resultsContainer: '#vehicle-inventory',
      resultsCountSelector: '.results-count',
      // Configure the endpoint based on environment
      inventoryFetchEndpoint: process.env.NODE_ENV === 'production' 
        ? '/.netlify/functions/inventory-proxy'
        : '/mock-data/inventory.json'
    });
    
    // Make it available globally for debugging purposes in development
    if (process.env.NODE_ENV !== 'production') {
      window.inventoryFilters = inventoryFilters;
    }
    
    console.log('Inventory filtering initialized');
  }
});
