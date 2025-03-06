import CMS from "netlify-cms-app";

// Import CMS preview templates
import HomePreview from "./cms-preview-templates/home";
import PostPreview from "./cms-preview-templates/post";
import ProductsPreview from "./cms-preview-templates/products";
import ValuesPreview from "./cms-preview-templates/values";
import ContactPreview from "./cms-preview-templates/contact";
import InventoryPreview from "./cms-preview-templates/inventory";

// Initialize Netlify CMS
CMS.init();

// Register preview templates
CMS.registerPreviewTemplate("home", HomePreview);
CMS.registerPreviewTemplate("post", PostPreview);
CMS.registerPreviewTemplate("products", ProductsPreview);
CMS.registerPreviewTemplate("values", ValuesPreview);
CMS.registerPreviewTemplate("contact", ContactPreview);
CMS.registerPreviewTemplate("inventory", InventoryPreview);

// Register previews for additional templates as needed
CMS.registerPreviewStyle("/css/main.css");

// You can add customizations here if needed
console.log("CMS initialized");
