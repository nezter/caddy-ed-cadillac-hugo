import CMS from "netlify-cms-app";

// Import CMS preview templates.
//
// These live under site/assets/js/ because that is the Hugo site root's asset
// tree (the public front-end is bundled by Hugo Pipes). The CMS is the one
// build still handled by webpack -- see webpack.cms.js.
import HomePreview from "../../site/assets/js/cms-preview-templates/home";
import PostPreview from "../../site/assets/js/cms-preview-templates/post";
import ProductsPreview from "../../site/assets/js/cms-preview-templates/products";
import ValuesPreview from "../../site/assets/js/cms-preview-templates/values";
import ContactPreview from "../../site/assets/js/cms-preview-templates/contact";
import InventoryPreview from "../../site/assets/js/cms-preview-templates/inventory";

// Initialize Netlify CMS
CMS.init();

// Register preview templates
CMS.registerPreviewTemplate("home", HomePreview);
CMS.registerPreviewTemplate("post", PostPreview);
CMS.registerPreviewTemplate("products", ProductsPreview);
CMS.registerPreviewTemplate("values", ValuesPreview);
CMS.registerPreviewTemplate("contact", ContactPreview);
CMS.registerPreviewTemplate("inventory", InventoryPreview);

// Styles for the preview pane. The main stylesheet is fingerprinted and served
// from the publish directory, so it has to be injected at runtime rather than
// hardcoded here. `data:` keeps this working without a build-time dependency.
CMS.registerPreviewStyle(`
  :root {
    --primary-color: #1A2B49;
    --secondary-color: #C8102E;
    --accent-color: #B69F58;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
`);
