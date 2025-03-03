const fetch = require("node-fetch");
const fs = require("fs");
const path = require("path");
const matter = require("gray-matter");

const INVENTORY_API = process.env.INVENTORY_API_URL || "https://www.cadillacofsouthcharlotte.com/api/inventory";
const API_KEY = process.env.INVENTORY_API_KEY;

exports.handler = async function(event, context) {
  // Only allow POST requests with authorization
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }
  
  // Check for authentication token
  const token = event.headers.authorization?.split(" ")[1] || "";
  if (token !== process.env.SYNC_TOKEN) {
    return { statusCode: 401, body: "Unauthorized" };
  }
  
  try {
    // Fetch inventory data from external API
    const response = await fetch(INVENTORY_API, {
      headers: {
        "Accept": "application/json",
        "x-api-key": API_KEY
      }
    });
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    const data = await response.json();
    const vehicles = data.vehicles || [];
    
    console.log(`Retrieved ${vehicles.length} vehicles from API`);
    
    // Process and write each vehicle to markdown files
    const results = {
      new: 0,
      updated: 0,
      unchanged: 0,
      removed: 0,
      errors: 0
    };
    
    // Map of all current inventory IDs from API
    const currentInventoryIds = new Set(vehicles.map(v => v.id));
    
    // Process existing inventory files to identify removed vehicles
    const contentDir = path.join(process.cwd(), "site/content/inventory");
    if (fs.existsSync(contentDir)) {
      const files = fs.readdirSync(contentDir);
      
      for (const file of files) {
        if (!file.endsWith(".md")) continue;
        
        const filePath = path.join(contentDir, file);
        const content = fs.readFileSync(filePath, "utf8");
        const { data: frontmatter } = matter(content);
        
        // If the vehicle is no longer in the API, mark it as sold or remove it
        if (frontmatter.id && !currentInventoryIds.has(frontmatter.id)) {
          try {
            // Option 1: Mark as sold
            const updatedContent = matter.stringify(
              content,
              { ...frontmatter, status: "Sold" }
            );
            fs.writeFileSync(filePath, updatedContent);
            
            // Option 2: Remove file
            // fs.unlinkSync(filePath);
            
            results.removed++;
          } catch (err) {
            console.error(`Error processing removed vehicle ${frontmatter.id}:`, err);
            results.errors++;
          }
        }
      }
    } else {
      // Create the directory if it doesn't exist
      fs.mkdirSync(contentDir, { recursive: true });
    }
    
    // Process each vehicle from the API
    for (const vehicle of vehicles) {
      try {
        const slug = `${vehicle.year}-${vehicle.make}-${vehicle.model}-${vehicle.id}`.toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^a-z0-9-]/g, "");
          
        const filePath = path.join(contentDir, `${slug}.md`);
        const vehicleExists = fs.existsSync(filePath);
        
        // Prepare frontmatter
        const frontmatter = {
          title: `${vehicle.year} ${vehicle.make} ${vehicle.model} ${vehicle.trim || ""}`,
          date: new Date().toISOString(),
          id: vehicle.id,
          stockNumber: vehicle.stockNumber || "",
          vin: vehicle.vin || "",
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          trim: vehicle.trim || "",
          price: vehicle.price,
          status: vehicle.status || "Available",
          type: vehicle.type || "New",
          mileage: vehicle.mileage || 0,
          exteriorColor: vehicle.exteriorColor || "",
          interiorColor: vehicle.interiorColor || "",
          transmission: vehicle.transmission || "",
          engine: vehicle.engine || "",
          drivetrain: vehicle.drivetrain || "",
          mpg: vehicle.mpg || "",
          fuelType: vehicle.fuelType || "",
          description: vehicle.description || "",
          features: vehicle.features || [],
          images: vehicle.images || [],
          featured: vehicle.featured || false
        };
        
        // Generate content
        let content = "";
        if (vehicle.description) {
          content = vehicle.description;
        }
        
        // Write to file
        const fileContent = matter.stringify(content, frontmatter);
        fs.writeFileSync(filePath, fileContent);
        
        if (vehicleExists) {
          results.updated++;
        } else {
          results.new++;
        }
      } catch (err) {
        console.error(`Error processing vehicle ${vehicle.id}:`, err);
        results.errors++;
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        message: "Inventory sync completed",
        results
      })
    };
    
  } catch (error) {
    console.error("Error syncing inventory:", error);
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        success: false,
        message: "Failed to sync inventory",
        error: error.message
      })
    };
  }
};
