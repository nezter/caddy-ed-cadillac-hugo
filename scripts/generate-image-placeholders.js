/**
 * Image Placeholder Generator
 * 
 * This script generates optimized placeholder images for use with lazy loading.
 * It creates two types of placeholders:
 * 1. Small, low-quality JPG/WebP for regular images
 * 2. Tiny SVG with blur effect for hero/banner images
 * 
 * Usage: node generate-image-placeholders.js
 */

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const glob = require('glob');

// Configuration
const config = {
  inputGlob: 'site/static/img/**/*.{jpg,jpeg,png}',
  placeholderDir: 'site/static/img/placeholders',
  jpgQuality: 20,
  maxWidth: 100,
  svgBlurAmount: 10,
  heroImagePatterns: ['hero', 'banner', 'featured', 'header']
};

/**
 * Creates a JPG placeholder for a regular image
 * @param {String} inputPath - Path to the original image
 * @param {String} outputPath - Path to save the placeholder
 */
async function createJpgPlaceholder(inputPath, outputPath) {
  try {
    await sharp(inputPath)
      .resize(config.maxWidth, null, { 
        withoutEnlargement: true,
        fit: 'inside'
      })
      .jpeg({ quality: config.jpgQuality })
      .toFile(outputPath);
    
    console.log(`Created JPG placeholder: ${outputPath}`);
  } catch (err) {
    console.error(`Error creating JPG placeholder for ${inputPath}:`, err);
  }
}

/**
 * Creates an SVG blur placeholder for hero images
 * @param {String} inputPath - Path to the original image
 * @param {String} outputPath - Path to save the placeholder
 */
async function createSvgPlaceholder(inputPath, outputPath) {
  try {
    // Get image metadata
    const metadata = await sharp(inputPath).metadata();
    
    // Create a tiny version of the image
    const tinyImageBuffer = await sharp(inputPath)
      .resize(20, null, { fit: 'inside' })
      .toBuffer();
    
    // Convert to base64
    const base64Image = tinyImageBuffer.toString('base64');
    
    // Create SVG with embedded base64 image and blur filter
    const svgContent = `
      <svg xmlns="http://www.w3.org/2000/svg" 
           xmlns:xlink="http://www.w3.org/1999/xlink"
           width="${metadata.width}" height="${metadata.height}"
           viewBox="0 0 ${metadata.width} ${metadata.height}">
        <filter id="blur" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
          <feGaussianBlur stdDeviation="${config.svgBlurAmount}" edgeMode="duplicate" />
        </filter>
        <image filter="url(#blur)"
               xlink:href="data:image/${metadata.format.toLowerCase()};base64,${base64Image}"
               x="0" y="0"
               height="100%" width="100%"
               preserveAspectRatio="xMidYMid meet" />
      </svg>
    `;
    
    // Write SVG to file
    fs.writeFileSync(outputPath, svgContent.trim());
    console.log(`Created SVG placeholder: ${outputPath}`);
  } catch (err) {
    console.error(`Error creating SVG placeholder for ${inputPath}:`, err);
  }
}

/**
 * Main function to generate all placeholders
 */
async function generatePlaceholders() {
  try {
    console.log('Starting placeholder generation...');
    
    // Ensure output directory exists
    if (!fs.existsSync(config.placeholderDir)) {
      fs.mkdirSync(config.placeholderDir, { recursive: true });
      console.log(`Created placeholder directory: ${config.placeholderDir}`);
    }
    
    // Get all images matching the glob pattern
    const images = glob.sync(config.inputGlob);
    console.log(`Found ${images.length} images to process`);
    
    // Process each image
    for (const image of images) {
      const filename = path.basename(image);
      const extension = path.extname(image);
      const basename = path.basename(image, extension);
      const relativePath = path.relative('site/static/img', path.dirname(image));
      
      // Create subdirectory if needed
      const outputDir = path.join(config.placeholderDir, relativePath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      // Determine if this is a hero image based on filename or path
      const isHero = config.heroImagePatterns.some(pattern => 
        image.toLowerCase().includes(pattern.toLowerCase())
      );
      
      if (isHero) {
        // Create SVG placeholder for hero images
        await createSvgPlaceholder(
          image, 
          path.join(outputDir, `${basename}-placeholder.svg`)
        );
      } else {
        // Create JPG placeholder for regular images
        await createJpgPlaceholder(
          image, 
          path.join(outputDir, `${basename}-placeholder.jpg`)
        );
      }
    }
    
    console.log('Placeholder generation complete!');
  } catch (err) {
    console.error('Error generating placeholders:', err);
    process.exit(1);
  }
}

// Run the placeholder generator
generatePlaceholders();
