# Next Steps Plan - 2023-11-27

This document outlines the next steps for continuing development on the Caddy Ed Cadillac website.

## Current Status

We've made significant progress on two key tasks:

1. **MED-06: Frontend API Error Handling**
   - Completed Subtask 1: Created comprehensive error handling utility
   - Completed Subtask 2: Updated contact form with improved error handling
   - Next: Implement Subtask 3 (Inventory component error handling)

2. **HIGH-04: Lazy Loading Images**
   - Implemented core lazy loading functionality
   - Created placeholder image generation script
   - Next: Generate all placeholders and update templates

## Next Work Session (2023-11-28)

### Priority 1: Complete HIGH-04 (Placeholder Images)

**Tasks:**
1. Run the placeholder generation script for all site images
2. Update the following templates to use placeholders:
   - `/home/nez/caddy-ed-cadillac-hugo/site/layouts/inventory/list.html`
   - `/home/nez/caddy-ed-cadillac-hugo/site/layouts/inventory/single.html`
   - `/home/nez/caddy-ed-cadillac-hugo/site/layouts/partials/featured-vehicle.html`

**Example implementation:**
```html
<!-- Before -->
<img src="/img/vehicles/model-x.jpg" alt="Vehicle Image">

<!-- After - for regular images -->
<img class="lazyload" 
     src="/img/placeholders/vehicles/model-x-placeholder.jpg"
     data-src="/img/vehicles/model-x.jpg"
     alt="Vehicle Image">

<!-- After - for hero images with SVG placeholder -->
<img class="lazyload hero-image" 
     src="/img/placeholders/hero/homepage-banner-placeholder.svg"
     data-src="/img/hero/homepage-banner.jpg"
     alt="Hero Image">
```

3. Add CSS transitions for smooth loading experience:
```css
.lazyload {
  opacity: 0;
  transition: opacity 0.3s;
}

.lazyloaded {
  opacity: 1;
}
```

### Priority 2: Start MED-06 Subtask 3 (Inventory Error Handling)

**Tasks:**
1. Identify all inventory API calls in:
   - `/home/nez/caddy-ed-cadillac-hugo/src/js/inventory/list.js`
   - `/home/nez/caddy-ed-cadillac-hugo/src/js/inventory/details.js`
   - `/home/nez/caddy-ed-cadillac-hugo/src/js/inventory/search.js`

2. Apply error handling utility to each API call:
   - Add try/catch blocks with parseApiError
   - Implement appropriate error states
   - Add retry functionality for network errors

3. Create user-friendly error states:
   - Implement empty state for failed inventory loading
   - Add retry buttons for network errors
   - Show appropriate messaging for server errors

## Estimated Effort

- HIGH-04 (Placeholder Images): 2-3 hours
- MED-06 Subtask 3 (Inventory Error Handling): 2 hours
- Total: 4-5 hours (Split across 2 sessions)

## Success Criteria

### For HIGH-04:
- All site images have appropriate placeholders
- Images load smoothly with no layout shifts
- Performance improvement is measurable in Lighthouse

### For MED-06 Subtask 3:
- All inventory API calls use consistent error handling
- Users see helpful messages when errors occur
- Failed requests have appropriate retry mechanisms
- Error states are visually appropriate and accessible
