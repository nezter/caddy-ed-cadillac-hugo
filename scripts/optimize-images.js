const imagemin = require('imagemin');
const imageminWebp = require('imagemin-webp');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

// Define directories to process
const directories = ['dist/img', 'dist/uploads'];

// Create WebP versions of images
async function optimizeImages() {
  console.log('Starting image optimization...');
  
  try {
    // Process each directory
    for (const dir of directories) {
      // Make sure directory exists
      if (!fs.existsSync(dir)) {
        console.log(`Directory ${dir} does not exist, skipping...`);
        continue;
      }
      
      // Get all image files in the directory
      const files = await getImageFiles(dir);
      
      if (files.length === 0) {
        console.log(`No image files found in ${dir}, skipping...`);
        continue;
      }
      
      console.log(`Found ${files.length} images in ${dir}, processing...`);
      
      // Create WebP versions of the images
      await imagemin(files, {
        destination: dir,
        plugins: [
          imageminWebp({
            quality: 75
          })
        ]
      });
      
      console.log(`Successfully processed images in ${dir}`);
    }
    
    console.log('Image optimization completed successfully!');
  } catch (error) {
    console.error('Error optimizing images:', error);
    process.exit(1);
  }
}

// Recursively get all image files from directory
async function getImageFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  
  const files = await Promise.all(entries.map(entry => {
    const fullPath = path.join(dir, entry.name);
    
    return entry.isDirectory() 
      ? getImageFiles(fullPath) 
      : (isImageFile(entry.name) ? fullPath : []);
  }));
  
  return files.flat();
}

// Check if file is an image
function isImageFile(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.gif'].includes(ext);
}

// Run the optimization
optimizeImages();