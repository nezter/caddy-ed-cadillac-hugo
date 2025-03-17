# Placeholder Images for Lazy Loading Implementation

## Overview
This document outlines the plan for creating and implementing placeholder images to complete the lazy loading functionality (HIGH-04). Placeholder images are small, low-quality images that display while the full-resolution images are loading.

## Requirements
- Small file size (5-20KB per image)
- Maintain aspect ratio of original images
- Visually represent the content at low resolution
- Consistent implementation across templates

## Implementation Options

### Option 1: Manual Creation
**Approach:** Create smaller, lower-quality versions of key images manually using an image editor.

**Pros:**
- Full control over appearance
- Can be optimized per image
- No additional dependencies

**Cons:**
- Time-consuming for many images
- Requires manual updates for new images

### Option 2: Automated Generation Script
**Approach:** Create a script that generates placeholder images for all images in the content folder.

**Pros:**
- Handles all images automatically
- Can be run as needed for new images
- Consistent process

**Cons:**
- Requires additional tooling/dependencies
- May need adjustment for special cases

### Option 3: Blur-up Technique
**Approach:** Use tiny (e.g., 20×20px) SVG placeholders with a blur filter.

**Pros:**
- Extremely small file size
- Can be inlined in HTML (no additional requests)
- Smooth transition effect

**Cons:**
- More complex implementation
- May not work well for all image types

## Recommended Approach
Implement a combination of Options 2 and 3:

1. Create an automated script for generating placeholder images
2. For hero and critical images, use the blur-up SVG technique
3. For regular content images, use small JPG/WebP placeholders

## Implementation Steps

### 1. Set Up Image Processing Script
- Create a Node.js script using Sharp or similar library
- Configure to process images in `/home/nez/caddy-ed-cadillac-hugo/site/static/img/`
- Generate two types of placeholders:
  - Tiny SVG placeholders for hero images
  - Small JPG/WebP placeholders for regular images

### 2. Create Output Structure
- Store generated placeholders in `/home/nez/caddy-ed-cadillac-hugo/site/static/img/placeholders/`
- Use naming convention: `[original-filename]-placeholder.[extension]`

### 3. Update Lazy Loading Implementation
- Modify image templates to include placeholder sources
- For SVG placeholders, inline them in the HTML
- For JPG/WebP placeholders, use them as the src attribute and move original to data-src

### 4. CSS Enhancements
- Add transition effects for smooth image loading
- Ensure proper sizing and aspect ratio maintenance
- Add blur effect for SVG placeholders

### 5. Testing
- Test on various connection speeds
- Verify placeholder appearance on different devices/browsers
- Measure performance improvements

## Example Script Structure

```javascript
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration
const config = {
  inputGlob: 'site/static/img/**/*.{jpg,png,jpeg}',
  placeholderDir: 'site/static/img/placeholders',
  jpgQuality: 20,
  maxWidth: 100,
  svgBlurAmount: 10
};

// Function to create JPG placeholder
async function createJpgPlaceholder(inputPath, outputPath) {
  await sharp(inputPath)
    .resize(config.maxWidth, null, { withoutEnlargement: true })
    .jpeg({ quality: config.jpgQuality })
    .toFile(outputPath);
}

// Function to create SVG blur placeholder
async function createSvgPlaceholder(inputPath, outputPath) {
  // Implementation for SVG blur placeholder creation
}

// Main function
async function generatePlaceholders() {
  // Ensure output directory exists
  if (!fs.existsSync(config.placeholderDir)) {
    fs.mkdirSync(config.placeholderDir, { recursive: true });
  }
  
  // Get all images
  const images = glob.sync(config.inputGlob);
  
  // Process each image
  for (const image of images) {
    const filename = path.basename(image);
    const extension = path.extname(image);
    const basename = path.basename(image, extension);
    
    // Determine if this is a hero image (based on naming convention or path)
    const isHero = image.includes('hero') || image.includes('banner');
    
    if (isHero) {
      // Create SVG placeholder for hero images
      await createSvgPlaceholder(
        image, 
        path.join(config.placeholderDir, `${basename}-placeholder.svg`)
      );
    } else {
      // Create JPG placeholder for regular images
      await createJpgPlaceholder(
        image, 
        path.join(config.placeholderDir, `${basename}-placeholder.jpg`)
      );
    }
  }
}

generatePlaceholders().catch(console.error);
```

## Estimated Timeline
- Script development: 2 hours
- Placeholder generation: 1 hour (depends on number of images)
- Template updates: 1.5 hours
- Testing: 1 hour
- Total: ~5.5 hours

This task should be broken down into multiple sessions due to its size.

## Next Steps
1. Develop the placeholder generation script
2. Test on a subset of images
3. Generate all placeholders
4. Update templates to use the placeholders
