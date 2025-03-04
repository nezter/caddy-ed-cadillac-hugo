const imagemin = require('imagemin');
const imageminWebp = require('imagemin-webp');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Configuration
const config = {
  inputDir: './dist',
  quality: 80,
  sizes: [320, 640, 960, 1280, 1920],
  extensions: ['.jpg', '.jpeg', '.png']
};

// Helper to check if file is an image
const isImage = (file) => {
  const ext = path.extname(file).toLowerCase();
  return config.extensions.includes(ext);
};

// Create WebP versions
async function convertToWebP(filePath) {
  try {
    await imagemin([filePath], {
      destination: path.dirname(filePath),
      plugins: [
        imageminWebp({ quality: config.quality })
      ]
    });
    console.log(`✅ WebP created: ${path.basename(filePath)}.webp`);
  } catch (error) {
    console.error(`❌ Error creating WebP for ${filePath}:`, error);
  }
}

// Create responsive images
async function createResponsiveImages(filePath) {
  try {
    const filename = path.basename(filePath, path.extname(filePath));
    const outputDir = path.dirname(filePath);
    
    for (const size of config.sizes) {
      const outputPath = path.join(outputDir, `${filename}-${size}${path.extname(filePath)}`);
      
      await sharp(filePath)
        .resize(size)
        .toFile(outputPath);
      
      // Also create WebP version
      await convertToWebP(outputPath);
      
      console.log(`✅ Created: ${path.basename(outputPath)}`);
    }
  } catch (error) {
    console.error(`❌ Error creating responsive images for ${filePath}:`, error);
  }
}

// Recursive function to process directories
async function processDirectory(directory) {
  try {
    const files = await readdir(directory);
    
    for (const file of files) {
      const filePath = path.join(directory, file);
      const fileStat = await stat(filePath);
      
      if (fileStat.isDirectory()) {
        await processDirectory(filePath);
      } else if (isImage(file)) {
        // Skip already processed files
        if (file.includes('-')) {
          continue;
        }
        await createResponsiveImages(filePath);
        await convertToWebP(filePath);
      }
    }
  } catch (error) {
    console.error(`❌ Error processing directory ${directory}:`, error);
  }
}

// Main function to start processing
(async function main() {
  console.log('🔍 Starting image optimization...');
  
  try {
    await processDirectory(config.inputDir);
    console.log('✅ Image optimization completed successfully!');
  } catch (error) {
    console.error('❌ Error during image optimization:', error);
    process.exit(1);
  }
})();

const { readdirSync, statSync } = require('fs');
const { join } = require('path');

const DIST_DIR = join(__dirname, '../dist');

// Get all subdirectories recursively
const getDirectories = (source) => {
  return [source, ...readdirSync(source)
    .map(name => join(source, name))
    .filter(source => statSync(source).isDirectory())
    .flatMap(dir => getDirectories(dir))];
}

async function optimizeImages() {
  console.log('Optimizing images...');
  
  try {
    const directories = getDirectories(DIST_DIR);
    
    // Process each directory
    for (const dir of directories) {
      console.log(`Processing directory: ${dir}`);
      
      // Optimize JPG and PNG images
      await imagemin([`${dir}/*.{jpg,jpeg,png}`], {
        destination: dir,
        plugins: [
          // Convert to WebP
          imageminWebp({
            quality: 80,
            method: 6,
          }),
        ]
      }).catch(err => {
        // Don't throw error if no images found
        if (!err.message.includes('No files matched')) {
          console.error(`Error optimizing images in ${dir}:`, err);
        }
      });
      
      // Create responsive images with Sharp
      const imageFiles = readdirSync(dir)
        .filter(file => /\.(jpg|jpeg|png)$/i.test(file))
        .map(file => join(dir, file));
      
      for (const file of imageFiles) {
        try {
          const sizes = [320, 640, 960, 1280, 1920];
          for (const width of sizes) {
            await sharp(file)
              .resize({ width, withoutEnlargement: true })
              .toFile(`${file.replace(/\.(jpg|jpeg|png)$/i, '')}-${width}.webp`);
          }
        } catch (err) {
          console.error(`Error creating responsive image from ${file}:`, err);
        }
      }
    }
    
    console.log('Image optimization completed successfully');
  } catch (error) {
    console.error('Error during image optimization:', error);
    process.exit(1);
  }
}

optimizeImages();