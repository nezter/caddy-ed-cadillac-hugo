# HIGH-04 Template Updates Plan: Implementing Placeholder Images

## Overview
This document outlines the plan for updating the Hugo templates to use the placeholder images created by the placeholder generation script. This is the final step in completing the lazy loading implementation (HIGH-04).

## Template Update Strategy

We'll focus on the following key templates that contain images:

1. **Inventory List Template**
   - Path: `/home/nez/caddy-ed-cadillac-hugo/site/layouts/inventory/list.html`
   - Image Types: Vehicle thumbnails (regular images)
   - Update Pattern: Use JPG placeholders

2. **Inventory Detail Template**
   - Path: `/home/nez/caddy-ed-cadillac-hugo/site/layouts/inventory/single.html`
   - Image Types: Vehicle detail images and gallery (regular images)
   - Update Pattern: Use JPG placeholders for all images

3. **Featured Vehicle Partial**
   - Path: `/home/nez/caddy-ed-cadillac-hugo/site/layouts/partials/featured-vehicle.html`
   - Image Types: Featured vehicle images (larger, hero-style)
   - Update Pattern: Consider SVG placeholders for better visual effect

4. **Default List Template**
   - Path: `/home/nez/caddy-ed-cadillac-hugo/site/layouts/_default/list.html`
   - Image Types: Various content thumbnails
   - Update Pattern: Use JPG placeholders

5. **Home Page Template**
   - Path: `/home/nez/caddy-ed-cadillac-hugo/site/layouts/index.html`
   - Image Types: Hero banners and featured content images
   - Update Pattern: SVG placeholders for heroes, JPG for others

## Implementation Patterns

### 1. Regular Content Images (JPG Placeholder)

**Current Pattern:**
```html
<img src="{{ .Params.image }}" alt="{{ .Title }}">
```

**New Pattern:**
```html
<img class="lazyload" 
     src="/img/placeholders{{ with .Params.image }}{{ . | replaceRE "^/img" "" | replaceRE "\\.[^.]+$" "-placeholder.jpg" }}{{ end }}"
     data-src="{{ .Params.image }}" 
     alt="{{ .Title }}">
```

### 2. Hero Images (SVG Placeholder)

**Current Pattern:**
```html
<div class="hero-image" style="background-image: url('{{ .Params.hero_image }}')"></div>
```

**New Pattern:**
```html
<div class="hero-image lazyload" 
     data-bg="{{ .Params.hero_image }}"
     style="background-image: url('/img/placeholders{{ with .Params.hero_image }}{{ . | replaceRE "^/img" "" | replaceRE "\\.[^.]+$" "-placeholder.svg" }}{{ end }}')"></div>
```

### 3. Gallery Images (JPG Placeholder with srcset)

**Current Pattern:**
```html
<img src="{{ .image }}" 
     srcset="{{ .image_small }} 400w, {{ .image_medium }} 800w, {{ .image }} 1200w"
     sizes="(max-width: 600px) 400px, (max-width: 1000px) 800px, 1200px" 
     alt="{{ .alt_text }}">
```

**New Pattern:**
```html
<img class="lazyload" 
     src="/img/placeholders{{ with .image }}{{ . | replaceRE "^/img" "" | replaceRE "\\.[^.]+$" "-placeholder.jpg" }}{{ end }}"
     data-srcset="{{ .image_small }} 400w, {{ .image_medium }} 800w, {{ .image }} 1200w"
     data-sizes="(max-width: 600px) 400px, (max-width: 1000px) 800px, 1200px"
     alt="{{ .alt_text }}">
```

## CSS Updates

Add the following CSS for smooth transitions between placeholder and full images:

```css
/* Base lazyload styles */
.lazyload {
  opacity: 0;
  transition: opacity 0.3s;
}

.lazyloaded {
  opacity: 1;
}

/* Background image lazy loading */
.lazyload[data-bg] {
  background-transition: opacity 0.3s;
  background-size: cover;
  background-position: center;
}

/* Placeholder image container */
.image-placeholder-container {
  position: relative;
  overflow: hidden;
  background-color: #f6f6f6;
}

/* Make sure image placeholder maintains aspect ratio */
.image-placeholder-container img {
  width: 100%;
  height: auto;
  display: block;
}

/* Hero image transitions */
.hero-image.lazyload {
  filter: blur(5px);
  transform: scale(1.05);
  transition: filter 0.3s, transform 0.3s, opacity 0.3s;
}

.hero-image.lazyloaded {
  filter: blur(0);
  transform: scale(1);
}
```

## Custom Hugo Function

To simplify placeholder path generation, create a custom Hugo function in `layouts/partials/functions/placeholder-path.html`:

```html
{{- define "partials/functions/placeholder-path.html" -}}
{{- $originalPath := . -}}
{{- $placeholderType := cond (findRE "(hero|banner|featured)" . 1) "svg" "jpg" -}}
{{- $placeholderPath := replace $originalPath "/img/" "/img/placeholders/" -}}
{{- $placeholderPath := replace $placeholderPath (printf "\\.%s$" (path.Ext $placeholderPath)) (printf "-placeholder.%s" $placeholderType) -}}
{{- return $placeholderPath -}}
{{- end -}}
```

Using this partial:
```html
<img class="lazyload"
     src="{{ partial "functions/placeholder-path" .Params.image }}"
     data-src="{{ .Params.image }}"
     alt="{{ .Title }}">
```

## Implementation Steps

1. **Create the placeholder path function**:
   - Add the placeholder path partial to simplify template updates

2. **Update templates in the following order**:
   - Start with inventory list (high visibility, standard images)
   - Update inventory detail template
   - Update featured vehicle partial
   - Update default list template
   - Update home page template

3. **Add CSS for transitions**:
   - Add CSS to main stylesheet or create a dedicated lazy-loading.css

4. **Test each update**:
   - Verify placeholder loading
   - Check transition effect
   - Ensure full image loads correctly
   - Test on mobile devices and slow connections

## Testing Plan

### 1. Visual Testing
- Test in Chrome, Firefox, Safari, and Edge
- Test on mobile devices (iOS and Android)
- Verify transition effects are smooth
- Check for any layout shifts during loading

### 2. Performance Testing
- Use Lighthouse to measure performance improvements
- Compare before/after metrics:
  - First Contentful Paint (FCP)
  - Largest Contentful Paint (LCP)
  - Cumulative Layout Shift (CLS)

### 3. Edge Cases
- Test with network throttling enabled
- Test with images that have unusual aspect ratios
- Test with very large and very small images
- Test with missing placeholder images (fallback behavior)

## Expected Outcomes
- Improved page load times
- Reduced network usage on initial page load
- Smooth visual transitions between placeholder and full images
- Lower Largest Contentful Paint (LCP) times in Lighthouse
- No layout shifts during image loading

## Timeline
- Template Function Creation: 30 minutes
- Template Updates: 90 minutes
- CSS Implementation: 30 minutes
- Testing: 30 minutes
- Total: ~3 hours
