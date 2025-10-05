# Cadillac Dealership Customer Management & Inventory System

A modern, scalable web application for Cadillac dealerships featuring comprehensive customer relationship management, inventory integration, and sales team automation. Built with Hugo, Netlify Functions, and a hybrid database architecture.

## 🏗️ Architecture Overview

This system implements a **hybrid architecture** optimized for performance and scalability:

### Core Components
- **Frontend**: Hugo static site generator with modern JavaScript
- **Backend**: Netlify Functions (serverless) with Node.js
- **Database**: Hybrid PostgreSQL (Supabase) + SQLite (Turso) architecture
- **Edge**: Global CDN with intelligent caching and routing

### Key Features
- ✅ **Complete CRM System**: Lead capture, customer management, sales tracking
- ✅ **Inventory Integration**: Real-time sync with Cadillac dealership APIs
- ✅ **Sales Team Portal**: Authentication, dashboards, appointment scheduling
- ✅ **Lead Deduplication**: AI-powered duplicate detection and merging
- ✅ **Performance Optimized**: Edge caching, lazy loading, critical CSS
- ✅ **GDPR Compliant**: Data protection and privacy controls
- ✅ **Mobile Responsive**: Optimized for all devices

### Technology Stack
- **Frontend**: Hugo, JavaScript ES6+, CSS Grid/Flexbox, Webpack
- **Backend**: Netlify Functions, Node.js, JWT Authentication
- **Database**: Supabase (PostgreSQL) + Turso (SQLite edge database)
- **Deployment**: Netlify CDN, automated CI/CD
- **External**: CRM integrations, email services, analytics

For detailed architecture information, see [Architecture Overview](docs/architecture-overview.md).

## Environment Setup

Before running the application, you need to configure your environment variables:

### Quick Setup (Recommended)

```bash
# Run the interactive setup script
npm run setup
```

This will guide you through configuring:
- Supabase database credentials
- Turso database (optional, for hybrid architecture)
- Email settings (optional)
- AI API keys (optional, for Task Master)

### Manual Setup

1. Copy the example environment file:
```bash
cp .env.example .env
```

2. Edit `.env` with your actual credentials:
```bash
# Required: Supabase credentials
SUPABASE_URL=your-supabase-project-url
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
SUPABASE_DB_URL=postgresql://<user>:<password>@db.<project>.supabase.co:6543/postgres

# Required: JWT secret for authentication
JWT_SECRET=your-secure-jwt-secret

# Optional: Turso for hybrid database architecture
TURSO_DATABASE_URL=your-turso-database-url
TURSO_AUTH_TOKEN=your-turso-auth-token

# Optional: Email notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

3. Run database migrations:
```bash
npm run migrate
```

## 🚀 Quick Start

### Option 1: One-Click Deploy
[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/cadillac-dealership/crm-system)

### Option 2: Local Development

1. **Clone the repository**
   ```bash
   git clone https://github.com/cadillac-dealership/crm-system.git
   cd crm-system
   ```

2. **Set up environment variables**
   ```bash
   # Interactive setup (recommended)
   npm run setup

   # Or manually configure .env file
   cp .env.example .env
   # Edit .env with your API keys and database credentials
   ```

3. **Install dependencies**
   ```bash
   npm install
   ```

4. **Set up database**
   ```bash
   # Run database migrations
   npm run migrate

   # Optional: Set up Turso for hybrid architecture
   npm run setup:turso
   npm run migrate:turso
   ```

5. **Start development server**
   ```bash
   npm run dev
   ```

6. **Open your browser**
   - Website: http://localhost:1313
   - Admin dashboard will be available after authentication setup

## 📚 Documentation

- **[Architecture Overview](docs/architecture-overview.md)** - System design and components
- **[API Reference](docs/api-reference.md)** - Complete API documentation
- **[Database Schema](database/migrations/001_create_comprehensive_schema.sql)** - Database structure
- **[Deployment Guide](docs/deployment.md)** - Production deployment instructions 

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/netlify-templates/one-click-hugo-cms&stack=cms)

This will setup everything needed for running the CMS:

* A new repository in your GitHub account with the code
* Full Continuous Deployment to Netlify's global CDN network
* Control users and access with Netlify Identity
* Manage content with Netlify CMS

Once the initial build finishes, you can invite yourself as a user. Go to the Identity tab in your new site, click "Invite" and send yourself an invite.

Now you're all set, and you can start editing content!

## Local Development

Clone this repository, and run `yarn` or `npm install` from the new folder to install all required dependencies.

Then start the development server with `yarn start` or `npm start`.

## Layouts

The template is based on small, content-agnostic partials that can be mixed and matched. The pre-built pages showcase just a few of the possible combinations. Refer to the `site/layouts/partials` folder for all available partials.

Use Hugo’s `dict` functionality to feed content into partials and avoid repeating yourself and creating discrepancies.

## CSS

The template uses a custom fork of Tachyons and PostCSS with cssnext and cssnano. To customize the template for your brand, refer to `src/css/imports/_variables.css` where most of the important global variables like colors and spacing are stored.

## SVG

All SVG icons stored in `site/static/img/icons` are automatically optimized with SVGO (gulp-svgmin) and concatenated into a single SVG sprite stored as a a partial called `svg.html`. Make sure you use consistent icons in terms of viewport and art direction for optimal results. Refer to an SVG via the `<use>` tag like so:

```
<svg width="16px" height="16px" class="db">
  <use xlink:href="#SVG-ID"></use>
</svg>
```

<!-- TASKMASTER_EXPORT_START -->
> 🎯 **Taskmaster Export** - 2025-10-05 02:28:21 UTC
> 📋 Export: without subtasks • Status filter: none
> 🔗 Powered by [Task Master](https://task-master.dev?utm_source=github-readme&utm_medium=readme-export&utm_campaign=caddy-ed-cadillac-hugo&utm_content=task-export-link)

| Project Dashboard |  |
| :-                |:-|
| Task Progress     | ████░░░░░░░░░░░░░░░░ 19% |
| Done | 8 |
| In Progress | 0 |
| Pending | 33 |
| Deferred | 0 |
| Cancelled | 0 |
|-|-|
| Subtask Progress | ░░░░░░░░░░░░░░░░░░░░ 0% |
| Completed | 0 |
| In Progress | 0 |
| Pending | 0 |


| ID | Title | Status | Priority | Dependencies | Complexity |
| :- | :-    | :-     | :-       | :-           | :-         |
| fix-error-handler-validation-methods | Fix critical error handler methods (validationError, createSuccessResponse) | ✓&nbsp;done | critical | None | N/A |
| implement-sales-auth-check-api | Create missing /api/sales/auth-check endpoint | ✓&nbsp;done | critical | None | N/A |
| implement-sales-customers-api | Create missing /api/sales/customers endpoint | ✓&nbsp;done | critical | None | N/A |
| implement-leads-api-endpoint | Create /api/leads endpoint for form submissions | ✓&nbsp;done | critical | None | N/A |
| fix-webpack-html-plugin-import | Add missing HtmlWebpackPlugin import | ✓&nbsp;done | critical | None | N/A |
| implement-crm-integration-real | Implement proper CRM integration | ✓&nbsp;done | high | None | N/A |
| implement-lead-deduplication-system | Implement lead deduplication system | ✓&nbsp;done | high | None | N/A |
| create-sales-authentication-system | Create authentication system for sales dashboards | in_progress | high | None | N/A |
| design-customer-database-schema | Set up persistent customer database schema | ✓&nbsp;done | high | None | N/A |
| improve-inventory-scraping-reliability | Enhance inventory scraping reliability | in_progress | high | None | N/A |
| fix-inventory-api-selectors | Update inventory-api.js HTML selectors | ○&nbsp;pending | high | None | N/A |
| create-lead-scoring-system | Implement lead scoring algorithm | ○&nbsp;pending | medium | None | N/A |
| implement-finance-application-workflow | Complete finance application workflow | ○&nbsp;pending | medium | None | N/A |
| build-sales-rep-assignment-system | Create sales rep assignment system | ○&nbsp;pending | medium | None | N/A |
| implement-customer-interaction-tracking | Implement customer interaction logging | ○&nbsp;pending | medium | None | N/A |
| create-customer-search-filtering | Add comprehensive customer search and filtering | ○&nbsp;pending | medium | None | N/A |
| build-automated-followup-system | Implement automated follow-up system | ○&nbsp;pending | medium | None | N/A |
| implement-sales-performance-analytics | Create sales performance analytics dashboard | ○&nbsp;pending | medium | None | N/A |
| create-customer-feedback-system | Implement customer feedback collection system | ○&nbsp;pending | low | None | N/A |
| implement-gdpr-compliance | Add GDPR compliance features | ○&nbsp;pending | medium | None | N/A |
| create-audit-logging-system | Implement comprehensive audit logging | ○&nbsp;pending | low | None | N/A |
| update-npm-dependencies | Update all npm dependencies to latest stable versions | ○&nbsp;pending | high | None | N/A |
| modernize-eslint-configuration | Modernize ESLint configuration to latest standards | ○&nbsp;pending | medium | None | N/A |
| create-comprehensive-test-suite | Implement comprehensive test suite | ○&nbsp;pending | medium | None | N/A |
| optimize-webpack-build-performance | Optimize webpack build performance | ○&nbsp;pending | medium | None | N/A |
| review-hugo-templates-accessibility | Audit and modernize all Hugo templates | ○&nbsp;pending | medium | None | N/A |
| implement-typescript-migration-plan | Create TypeScript migration plan | ○&nbsp;pending | low | None | N/A |
| implement-production-monitoring | Set up production monitoring, error tracking, and performance monitoring | ○&nbsp;pending | medium | None | N/A |
| perform-security-audit | Conduct comprehensive security audit | ○&nbsp;pending | high | None | N/A |
| create-deployment-documentation | Create detailed deployment procedures | ○&nbsp;pending | medium | None | N/A |
| implement-performance-monitoring | Implement Core Web Vitals tracking | ○&nbsp;pending | low | None | N/A |
| setup-turso-database | Set up Turso database for hybrid architecture | ○&nbsp;pending | high | design-customer-database-schema | N/A |
| create-turso-schema | Create Turso-compatible database schema | ○&nbsp;pending | high | setup-turso-database | N/A |
| implement-hybrid-database-manager | Implement hybrid database manager | ○&nbsp;pending | high | create-turso-schema | N/A |
| migrate-customer-search-to-turso | Migrate customer search operations to Turso | ○&nbsp;pending | medium | implement-hybrid-database-manager | N/A |
| implement-lead-deduplication-cache-turso | Implement lead deduplication caching in Turso | ○&nbsp;pending | medium | implement-lead-deduplication-system, implement-hybrid-database-manager | N/A |
| migrate-analytics-data-to-turso | Migrate analytics and reporting data to Turso | ○&nbsp;pending | medium | implement-sales-performance-analytics, implement-hybrid-database-manager | N/A |
| implement-session-caching-turso | Implement user session and preferences caching in Turso | ○&nbsp;pending | medium | create-sales-authentication-system, implement-hybrid-database-manager | N/A |
| setup-database-synchronization | Set up Supabase to Turso synchronization | ○&nbsp;pending | medium | implement-hybrid-database-manager | N/A |
| optimize-inventory-queries-turso | Optimize inventory search and filtering with Turso | ○&nbsp;pending | medium | improve-inventory-scraping-reliability, implement-hybrid-database-manager | N/A |
| implement-edge-caching-layer | Implement comprehensive edge caching layer | ○&nbsp;pending | medium | implement-hybrid-database-manager | N/A |
| create-database-performance-monitoring | Create database performance monitoring and optimization | ○&nbsp;pending | low | implement-production-monitoring | N/A |
| update-documentation-hybrid-architecture | Update documentation for hybrid Supabase + Turso architecture | ○&nbsp;pending | medium | implement-hybrid-database-manager | N/A |

> 📋 **End of Taskmaster Export** - Tasks are synced from your project using the `sync-readme` command.
<!-- TASKMASTER_EXPORT_END -->
