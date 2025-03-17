# Task Planning: HIGH-04 - Implement lazy loading for images

## Issue Description
The site needs to implement lazy loading for images to improve performance, especially for pages with many images like the inventory pages.

## Current Status
Looking at the project, I noticed:
1. The lazysizes library appears to be included in package.json dependencies
2. Some images may already have lazyload classes, but implementation is inconsistent
3. Many image templates need to be updated to use lazy loading

## Steps to Take

1. **Confirm lazysizes integration**
   - Verify lazysizes is properly imported in the main JS
   - Add initialization code if missing

2. **Identify image templates**
   - Review all layout files for image tags
   - Priority templates:
     - Inventory listings
     - Vehicle details
     - Homepage featured vehicles
     - Blog posts

3. **Update templates**
   - Convert regular image tags to lazy loading:
     - Add `lazyload` class
     - Replace `src` with `data-src`
     - Add low-resolution placeholder or blur-up effect
     - Add `loading="lazy"` for browsers with native support

4. **Add fallback handling**
   - Add `<noscript>` fallback for users without JavaScript
   - Ensure placeholder images are displayed during loading

5. **Testing**
   - Test on slow connections
   - Verify images load correctly when scrolling
   - Check browser support
   - Verify alt text and accessibility aspects

## Files to Modify
- `/home/nez/caddy-ed-cadillac-hugo/src/js/main.js` (add lazysizes initialization)
- `/home/nez/caddy-ed-cadillac-hugo/site/layouts/inventory/list.html` 
- `/home/nez/caddy-ed-cadillac-hugo/site/layouts/inventory/single.html`
- `/home/nez/caddy-ed-cadillac-hugo/site/layouts/_default/list.html`
- `/home/nez/caddy-ed-cadillac-hugo/site/layouts/index.html`
- `/home/nez/caddy-ed-cadillac-hugo/site/layouts/post/single.html`
- Additional layout files with images

## Estimated Effort
- Analysis & setup: 30 minutes
- Template updates: 1-2 hours (depending on number of templates)
- Testing: 30 minutes
- Total: 2-3 hours (Medium effort)

## Acceptance Criteria
- Images load only when they scroll into view
- Initial page load time is reduced
- Placeholder content is shown before images load
- Graceful fallback for browsers without JavaScript
- No regression in site appearance or functionality
