/**
 * Inventory Fetcher
 * Fetches vehicle inventory data from Cadillac dealership
 */

class InventoryFetcher {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || 'https://www.cadillacofsouthcharlotte.com';
    this.searchParams = options.searchParams || {
      search: 'new',
      make: 'Cadillac'
    };
    this.proxyUrl = options.proxyUrl || '/api/inventory-proxy';
    this.cacheKey = 'cadillac_inventory_cache';
    this.cacheDuration = options.cacheDuration || 3600000; // 1 hour in milliseconds
  }

  /**
   * Fetch inventory data, using cache if available and not expired
   */
  async fetchInventory() {
    // Check cache first
    const cachedData = this.getFromCache();
    if (cachedData) {
      console.log('Using cached inventory data');
      return cachedData;
    }

    try {
      const data = await this.fetchFromAPI();
      this.saveToCache(data);
      return data;
    } catch (error) {
      console.error('Error fetching inventory:', error);
      // Return empty array if fetch fails
      return [];
    }
  }

  /**
   * Fetch inventory data from API via proxy
   */
  async fetchFromAPI() {
    const params = new URLSearchParams(this.searchParams).toString();
    const url = `${this.proxyUrl}?${params}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch inventory: ${response.status} ${response.statusText}`);
    }
    
    const html = await response.text();
    return this.parseInventoryHTML(html);
  }

  /**
   * Parse HTML to extract vehicle data
   */
  parseInventoryHTML(html) {
    // Create a DOM parser
    let doc;
    
    if (typeof window === 'undefined') {
      // Server-side environment
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      doc = dom.window.document;
    } else {
      // Browser environment
      const parser = new DOMParser();
      doc = parser.parseFromString(html, 'text/html');
    }
  
    // Find all vehicle listings
    const vehicleCards = doc.querySelectorAll('.inventory-card, .vehicle-card, .srp-vehicle');
    
    return Array.from(vehicleCards).map(card => {
      // Extract vehicle data from card
      const title = card.querySelector('.vehicle-title, .title, h2')?.textContent.trim();
      const price = card.querySelector('.price, .vehicle-price')?.textContent.trim();
      const image = card.querySelector('img')?.src || '';
      const link = card.querySelector('a[href*="vehicle-details"]')?.href || '';
      
      // Extract year, make and model from title
      const titleParts = title ? title.split(' ') : [];
      const year = titleParts.length > 0 ? titleParts[0] : '';
      const make = this.searchParams.make || 'Cadillac';
      const model = titleParts.length > 1 ? titleParts.slice(1).join(' ') : '';
      
      // Extract other details
      const mileage = card.querySelector('.mileage, .miles')?.textContent.trim() || '0 miles';
      const stock = card.querySelector('.stock, .stock-number')?.textContent.trim() || '';
      const vin = card.querySelector('.vin')?.textContent.trim() || '';
      
      // Extract features
      const features = Array.from(card.querySelectorAll('.features li, .vehicle-features li'))
        .map(li => li.textContent.trim());
      
      return {
        id: vin || stock || Math.random().toString(36).substring(2, 15),
        title,
        year,
        make,
        model,
        price: this.cleanPrice(price),
        priceRaw: price,
        image,
        link: this.resolveUrl(link),
        mileage: this.cleanMileage(mileage),
        mileageRaw: mileage,
        stock,
        vin,
        features,
        type: 'new'
      };
    });
  }

  /**
   * Clean price string to get numeric value
   */
  cleanPrice(price) {
    if (!price) return 0;
    return parseInt(price.replace(/\$|,|\s|[a-zA-Z]/g, ''));
  }

  /**
   * Clean mileage string to get numeric value
   */
  cleanMileage(mileage) {
    if (!mileage) return 0;
    return parseInt(mileage.replace(/,|\s|miles|mi|[a-zA-Z]/g, ''));
  }

  /**
   * Resolve relative URLs
   */
  resolveUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    return `${this.baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
  }

  /**
   * Save data to localStorage cache
   */
  saveToCache(data) {
    const cacheData = {
      timestamp: Date.now(),
      data
    };
    localStorage.setItem(this.cacheKey, JSON.stringify(cacheData));
  }

  /**
   * Get data from cache if valid
   */
  getFromCache() {
    const cacheItem = localStorage.getItem(this.cacheKey);
    if (!cacheItem) return null;
    
    try {
      const cache = JSON.parse(cacheItem);
      const now = Date.now();
      
      // Check if cache is expired
      if (now - cache.timestamp > this.cacheDuration) {
        return null;
      }
      
      return cache.data;
    } catch (e) {
      return null;
    }
  }

  /**
   * Clear the cache
   */
  clearCache() {
    localStorage.removeItem(this.cacheKey);
  }
}

export default InventoryFetcher;
