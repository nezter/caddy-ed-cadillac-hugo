# Task Planning: HIGH-07 - Implement proper HTML semantics for accessibility

## Issue Description
The website needs to improve its HTML semantics to ensure better accessibility for users with assistive technologies and to improve SEO. Currently, some pages use generic div elements where semantic HTML5 elements would be more appropriate.

## Current Status
An initial review of the site templates shows:
- Inconsistent use of semantic elements like `<article>`, `<section>`, `<nav>`
- Excessive reliance on div elements
- Missing landmark regions
- Incomplete or improper heading hierarchy
- Insufficient ARIA attributes for interactive elements

## Files to Analyze
1. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/_default/baseof.html` - The base template for all pages
2. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/partials/header.html` - Site header (already improved with recent changes)
3. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/partials/footer.html` - Site footer
4. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/index.html` - Homepage layout
5. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/inventory/list.html` - Inventory listing page
6. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/inventory/single.html` - Vehicle detail page
7. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/_default/list.html` - Default list template
8. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/_default/single.html` - Default single page template
9. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/contact/list.html` - Contact page template
10. `/home/nez/caddy-ed-cadillac-hugo/site/layouts/404.html` - 404 error page

## Steps to Take

1. **Analyze Templates**
   - Review all templates for semantic structure issues
   - Identify opportunities for better HTML5 semantic elements
   - Check heading hierarchies (h1-h6) for proper structure

2. **Define Landmark Regions**
   - Ensure all pages have proper landmark regions
   - Add appropriate roles where needed
   - Verify skip-link targets properly defined landmarks

3. **Improve Semantic Elements**
   - Replace generic divs with semantic elements where appropriate
   - Add proper sectioning with `<section>`, `<article>`, etc.
   - Use `<figure>` and `<figcaption>` for image content

4. **Add ARIA Attributes**
   - Enhance elements with appropriate ARIA roles
   - Add aria-label where needed for clarity
   - Ensure proper relationships with aria-labelledby/describedby

5. **Update Form Elements**
   - Ensure all form controls have labels
   - Add proper fieldset and legend for form groups
   - Check for proper error state announcements

6. **Testing**
   - Validate HTML using W3C validator
   - Test with screen readers
   - Use accessibility evaluation tools like axe

## Estimated Effort
- Analysis: 1 hour
- Implementation: 3-4 hours
- Testing: 1 hour
- Total: 5-6 hours (Medium effort)

## Acceptance Criteria
- All pages use proper semantic HTML5 elements
- Heading hierarchy is logical and complete
- Landmark regions are properly defined
- Interactive elements have appropriate ARIA attributes
- Forms are properly labeled and grouped
- HTML validates without major accessibility errors
- Screen readers can properly navigate the site
