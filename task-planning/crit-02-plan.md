# Task Planning: CRIT-02 - Resolve Hugo template error in header.html

## Issue Description
The header.html template has an error related to resource execution that causes Hugo builds to fail.

## Steps to Take

1. **Analyze header.html**
   - Review current implementation in `/home/nez/caddy-ed-cadillac-hugo/site/layouts/partials/header.html`
   - Identify any `resources.ExecuteAsTemplate` calls or similar problematic code

2. **Review Hugo documentation**
   - Confirm proper way to include CSS files in Hugo templates
   - Understand the difference between development and production environments

3. **Implement fixes**
   - Replace problematic code with direct CSS inclusion
   - Ensure proper Hugo conditionals are used for dev/prod environments
   - Maintain the same functionality but with correct syntax

4. **Testing**
   - Test the template rendering in development environment
   - Verify CSS files are properly included
   - Check for any other potential issues in the header template

## Estimated Effort
- Analysis: 10 minutes
- Implementation: 15 minutes
- Testing: 10 minutes
- Total: 35 minutes (XS effort)

## Acceptance Criteria
- Hugo build completes without errors
- Header renders correctly on all pages
- CSS is properly linked in the head section
- No regression in site functionality or appearance
