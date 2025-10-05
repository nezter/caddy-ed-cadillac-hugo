# Cadillac Dealership CRM - Claude Code Integration Guide

## 🎯 Project Context

You are working on the **Cadillac Dealership Customer Management & Inventory System**, a modern, scalable web application with comprehensive CRM capabilities.

### Key Features
- ✅ **Complete CRM System**: Lead capture, customer management, sales tracking
- ✅ **Inventory Integration**: Real-time sync with Cadillac dealership APIs
- ✅ **Sales Team Portal**: Authentication, dashboards, appointment scheduling
- ✅ **Lead Deduplication**: AI-powered duplicate detection and merging
- ✅ **Hybrid Database**: Supabase (PostgreSQL) + Turso (SQLite edge database)
- ✅ **GDPR Compliant**: Data protection and privacy controls

### Architecture Overview
- **Frontend**: Hugo static site generator with modern JavaScript
- **Backend**: Netlify Functions (serverless) with Node.js
- **Database**: Hybrid PostgreSQL (Supabase) + SQLite (Turso) architecture
- **Edge**: Global CDN with intelligent caching and routing

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

### Development Deployment
```bash
# Local development
npm run dev

# Build for production
npm run build
```

### Production Deployment
- Automatic deployment via Netlify on `main` branch push
- Environment variables configured in Netlify dashboard
- Database migrations run automatically
- CDN invalidation for static assets

### Environment Setup
```bash
# Interactive setup
npm run setup

# Database migrations
npm run migrate

# Optional Turso setup
npm run setup:turso
npm run migrate:turso
```

## 🔧 Tooling & Commands

### Development Tools
```bash
# Code quality
npm run lint          # ESLint checking
npm run build         # Production build

# Database
npm run migrate       # Run Supabase migrations
npm run migrate:turso # Run Turso migrations

# Task management
task-master next      # Find next task
task-master list      # View all tasks
task-master show <id> # Task details
```

### Key Files
- `docs/architecture-overview.md` - System architecture
- `docs/api-reference.md` - API documentation
- `docs/deployment.md` - Deployment guide
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
