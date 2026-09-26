# Cadillac Dealership CRM - Claude Code Integration Guide

## 🎯 Project Context

You are working on the **Cadillac Dealership Customer Management & Inventory System**, a modern, scalable web application with comprehensive CRM capabilities.

### Key Features
- ✅ **Complete CRM System**: Lead capture, customer management, sales tracking
- ✅ **Inventory Integration**: Real-time sync with Cadillac dealership APIs
- ✅ **Sales Team Portal**: Authentication, dashboards, appointment scheduling
- ✅ **Lead Deduplication**: AI-powered duplicate detection and merging
- ✅ **Advanced Search & Filtering**: Multi-entity search with faceted filtering
- ✅ **Customer Interaction Logging**: Comprehensive touchpoint tracking and timeline
- ✅ **Automated Follow-up System**: Email/SMS campaigns with rules engine (API endpoints completed)
- ✅ **Hybrid Database**: Supabase (PostgreSQL) + Turso (SQLite edge database)
- ✅ **GDPR Compliant**: Data protection and privacy controls

### Architecture Overview
- **Frontend**: Hugo static site generator with modern JavaScript
- **Backend**: Netlify Functions (serverless) with Node.js
- **Database**: Hybrid PostgreSQL (Supabase) + SQLite (Turso) architecture
- **Edge**: Global CDN with intelligent caching and routing

## 📊 Current Project Status

### 🎯 **What We Just Completed**
**Follow-up System API Endpoints (✅ COMPLETED)**
- ✅ Created database migration: `005_add_followup_system_tables.sql`
- ✅ `followup-campaigns.js` - Full CRUD operations for campaign management
- ✅ `followup-rules.js` - Rules engine API with conditional logic and actions
- ✅ `email-templates.js` - Email template management with personalization
- ✅ `sms-templates.js` - SMS template management with character limits
- ✅ All endpoints include authentication, validation, and comprehensive error handling

### ✅ **Just Completed**
**Workflow Integration (COMPLETED)**
- ✅ Added follow-up triggers to `leads.js` - Welcome sequences for new leads
- ✅ Added follow-up triggers to `schedule-test-drive.js` - Appointment reminders
- ✅ Added follow-up triggers to `interactions.js` - Nurture campaigns for all interaction types
- ✅ All endpoints now automatically schedule follow-ups based on rules engine

### ✅ **Just Completed**
**Admin Dashboard Integration (COMPLETED)**
- ✅ Created comprehensive campaign manager UI component (`followup-campaign-manager.js`)
- ✅ Built admin dashboard page at `/admin/followup-campaigns`
- ✅ Implemented full CRUD operations for campaigns and rules
- ✅ Added drag-and-drop rule builder with conditions and actions
- ✅ Integrated template selection and personalization
- ✅ Added responsive design and professional styling

### 🔄 **Currently Working On**
**Testing & Optimization (IN PROGRESS)**
- End-to-end testing of automated follow-ups
- Performance optimization for search and interactions
- Error handling and monitoring

### 📋 **Next Steps (Priority Order)**
1. **Testing & Optimization**
   - Run database migration to apply follow-up tables
   - Test end-to-end follow-up workflow from lead creation to delivery
   - Performance optimization and error handling

2. **Communication Preferences**
   - Implement customer opt-out handling
   - Add preference management UI
   - GDPR compliance for automated messaging

3. **Follow-up Analytics**
   - Add tracking and analytics for follow-up message performance
   - Implement open rates, click tracking, and conversion attribution
   - Build analytics dashboard

## 🏗️ Development Workflow

### Task Master AI Integration
**Import Task Master's development workflow commands and guidelines:**
@./.taskmaster/CLAUDE.md

### Essential Workflow Commands

#### Daily Development
```bash
# Find next task to work on
task-master next

# Start working on a task
task-master set-status --id=<task-id> --status=in-progress

# Complete a task
task-master set-status --id=<task-id> --status=done
```

#### Task Management
```bash
# Add new task with AI assistance
task-master add-task --prompt="Implement feature" --research

# Break task into subtasks
task-master expand --id=<task-id> --research

# Update task with new information
task-master update-task --id=<task-id> --prompt="Additional context"
```

### Code Quality Standards

#### Frontend Development
- Use modern JavaScript (ES6+)
- Follow Hugo templating conventions
- Ensure mobile-responsive design
- Implement proper error handling

#### Backend Development
- Write comprehensive API documentation
- Implement proper input validation
- Use JWT authentication for protected routes
- Follow RESTful API design principles

#### Database Development
- Use parameterized queries to prevent SQL injection
- Implement proper indexing for performance
- Follow database normalization principles
- Document schema changes

### Security Requirements

#### Authentication & Authorization
- JWT tokens for session management
- Role-based access control (RBAC)
- Secure password hashing with bcrypt
- Proper session timeout handling

#### Data Protection
- Input sanitization and validation
- XSS prevention with content escaping
- CSRF protection on state-changing operations
- GDPR compliance for data handling

#### API Security
- Rate limiting on all endpoints
- Request/response size limits
- CORS configuration for allowed origins
- Security headers (CSP, HSTS, etc.)

## 📚 Documentation Standards

### Code Documentation
- JSDoc comments for all functions
- Inline comments for complex logic
- API endpoint documentation
- Database schema documentation

### File Organization
```
src/
├── js/                 # Frontend JavaScript
│   ├── components/     # Reusable UI components
│   ├── services/       # API service layer
│   └── utils/          # Utility functions

netlify/
└── functions/          # Serverless API endpoints
    ├── utils/          # Shared utilities
    └── endpoints/      # API implementations

database/
└── migrations/         # Schema migration files

docs/                   # Project documentation
├── architecture-overview.md
├── api-reference.md
└── deployment.md
```

## 🚀 Deployment Process

**Netlify's remote builders are disabled on purpose** — the monthly build
allowance is scarce. Builds run on the CI host (`10.1.0.25`) inside the
`caddy-netlify-build:2026` podman image, and production is updated by uploading
a prebuilt directory, which consumes **zero build minutes**.

```bash
# Build + verify on the CI host
./ci/run.sh verify

# Deploy prebuilt output
./ci/run.sh deploy-prod          # production (caddyed.com)
./ci/run.sh deploy               # draft/preview URL
```

### Front-end build
Hugo Pipes (`js.Build` / `css.Sass`) compiles and fingerprints all CSS/JS.
Webpack survives only for the Netlify CMS bundle (`webpack.cms.js`).
**Never hardcode an asset path in a template** — reference it through
`partials/assets.html` or page front matter, or `ci/verify-build.js` will fail
the build.

### Environment Setup
```bash
./ci/run.sh image    # (re)build the toolchain image
npm run setup        # interactive env setup (local)
npm run migrate      # Supabase migrations
```

See `docs/build-system.md` and `docs/deployment.md` for the full picture.

## 🔧 Tooling & Commands

```bash
# Build (all on the CI host)
./ci/run.sh build      ./ci/run.sh verify      ./ci/run.sh test

# Local dev
make dev              # hugo server :1313
make dev-functions    # netlify dev :8888

# Quality
make lint             npm run verify

# Database
npm run migrate       npm run migrate:turso
```

### Key Files
- `docs/build-system.md` - Build pipeline and rationale
- `docs/deployment.md` - CI/CD and the zero-build-minute deploy path
- `docs/api-reference.md` - API documentation
- `ci/run.sh` - CI driver (all builds)
- `ci/Containerfile` - Pinned toolchain (Node 24, Hugo extended 0.166.0)
- `database/migrations/` - Database schema files
- `netlify/functions/` - Serverless functions

## 🎯 Success Criteria

### Code Quality
- Passes all linting rules
- Comprehensive error handling
- Mobile-responsive design
- Performance optimized

### Functionality
- All user stories implemented
- API endpoints working correctly
- Database operations successful
- Authentication/authorization working

### Documentation
- Code properly documented
- API endpoints documented
- Deployment process documented
- User guides updated

### Testing
- Critical paths tested
- Error conditions handled
- Performance requirements met
- Security requirements satisfied

---

**Remember**: Always use Task Master AI for task tracking and management. Update task status as you work, and document important decisions in task comments.
