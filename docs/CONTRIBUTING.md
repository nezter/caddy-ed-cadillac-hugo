# Contributing to Cadillac Dealership CRM System

## 🏗️ Development Workflow

This project uses **Task Master AI** for intelligent task management and development coordination. The workflow is designed to maximize productivity while maintaining code quality and consistency.

### Prerequisites

- Node.js 18+ and npm
- Git
- Task Master CLI (`npm install -g task-master-ai`)
- API keys for AI providers (OpenAI, Anthropic, etc.)

### Quick Start

1. **Clone and setup**
   ```bash
   git clone <repository-url>
   cd cadillac-crm-system
   npm install
   npm run setup  # Interactive environment setup
   ```

2. **Initialize Task Master**
   ```bash
   task-master init
   task-master models --setup  # Configure AI models
   ```

3. **Start development**
   ```bash
   task-master next  # Find next task to work on
   task-master set-status --id=<task-id> --status=in-progress
   # Work on the task...
   task-master set-status --id=<task-id> --status=done
   ```

## 📋 Task Management

### Task States
- `pending` - Ready to work on
- `in-progress` - Currently being worked on (limit to 1-2 tasks)
- `done` - Completed successfully
- `deferred` - Postponed for later
- `cancelled` - No longer needed

### Task Commands

```bash
# View tasks
task-master list                    # List all tasks
task-master next                    # Show next available task
task-master show <id>              # Detailed task information

# Update tasks
task-master set-status --id=<id> --status=<status>
task-master update-task --id=<id> --prompt="new information"
task-master add-task --prompt="task description"

# Task breakdown
task-master expand --id=<id>        # Break task into subtasks
task-master analyze-complexity     # AI-powered task analysis
```

### Task Creation

Tasks are created from PRD documents or manually:

```bash
# From PRD document
task-master parse-prd --input=docs/new-feature-prd.txt

# Manual task creation
task-master add-task --prompt="Implement user profile page with avatar upload"
```

## 🏛️ Architecture Guidelines

### Code Organization

```
src/
├── js/                 # Frontend JavaScript
│   ├── components/     # Reusable UI components
│   ├── services/       # API service layer
│   └── utils/          # Utility functions
├── css/                # Stylesheets
└── fonts/              # Font assets

netlify/
└── functions/          # Serverless API endpoints
    ├── utils/          # Shared utilities
    └── endpoints/      # API implementations

database/
└── migrations/         # Schema migration files

scripts/                # Build and utility scripts
docs/                   # Documentation
```

### Database Design

- **Supabase (PostgreSQL)**: Primary database for complex operations
- **Turso (SQLite)**: Edge database for fast reads and caching
- **Hybrid routing**: Automatic database selection based on operation type

### API Design

- **RESTful endpoints** with consistent response format
- **JWT authentication** for protected routes
- **Input validation** and sanitization
- **Comprehensive error handling**

### Security Standards

- **Input validation** on all user inputs
- **SQL injection prevention** via parameterized queries
- **XSS protection** with content sanitization
- **CSRF protection** on state-changing operations
- **Secure headers** configured in netlify.toml

## 🚀 Development Process

### 1. Task Selection
```bash
task-master next
task-master show <task-id>
task-master set-status --id=<task-id> --status=in-progress
```

### 2. Implementation
- Follow existing code patterns and conventions
- Write tests for new functionality
- Update documentation as needed
- Ensure responsive design for mobile devices

### 3. Code Quality
```bash
npm run lint      # ESLint checking
npm run test      # Run test suite
npm run build     # Production build verification
```

### 4. Database Changes
```bash
# For schema changes
npm run migrate              # Run pending migrations
npm run migrate:status       # Check migration status

# For Turso (optional)
npm run migrate:turso        # Run Turso migrations
```

### 5. Testing
- **Unit tests** for utility functions
- **Integration tests** for API endpoints
- **E2E tests** for critical user flows
- **Performance testing** for database queries

### 6. Deployment
```bash
# Staging deployment (automatic on push to main)
git push origin main

# Production deployment
# Merges to main trigger automatic deployment via Netlify
```

## 📚 Documentation Standards

### Code Documentation
- **JSDoc comments** for all functions
- **Inline comments** for complex logic
- **README updates** for new features
- **API documentation** in `/docs/api-reference.md`

### Commit Messages
```
feat: add user authentication system
fix: resolve inventory API timeout issue
docs: update API reference for new endpoints
refactor: optimize database query performance
```

### Pull Request Guidelines
- **Descriptive title** and detailed description
- **Link related tasks** from Task Master
- **Include screenshots** for UI changes
- **List breaking changes** if any
- **Request review** from appropriate team members

## 🔧 Tooling & Configuration

### Development Tools
- **Hugo**: Static site generation
- **Webpack**: Asset bundling and optimization
- **ESLint**: Code quality enforcement
- **Prettier**: Code formatting
- **Task Master AI**: Intelligent task management

### Environment Setup
```bash
# Install dependencies
npm install

# Setup environment
npm run setup

# Configure Task Master
task-master models --setup

# Start development
npm run dev
```

### Build Process
```bash
# Development build
npm run build:dev

# Production build
npm run build

# Clean build
npm run clean && npm run build
```

## 🧪 Testing Strategy

### Test Types
- **Unit Tests**: Individual function/component testing
- **Integration Tests**: API endpoint testing
- **E2E Tests**: Full user workflow testing
- **Performance Tests**: Load and stress testing

### Test Commands
```bash
npm test              # Run all tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests
npm run test:e2e      # End-to-end tests
```

### Test Coverage
- **Target**: 80%+ code coverage
- **Critical paths**: 100% coverage
- **API endpoints**: Full coverage
- **Error handling**: Edge case coverage

## 🚨 Issue Reporting

### Bug Reports
- **Clear title** describing the issue
- **Steps to reproduce** the problem
- **Expected vs actual behavior**
- **Environment details** (browser, OS, etc.)
- **Screenshots/logs** when applicable

### Feature Requests
- **Clear description** of the proposed feature
- **Use case** and business value
- **Mockups/wireframes** if applicable
- **Technical requirements** if known

### Task Master Integration
- **Link issues** to Task Master tasks
- **Update task status** as work progresses
- **Document decisions** in task comments

## 📈 Performance Standards

### Frontend Metrics
- **First Contentful Paint**: < 1.5 seconds
- **Largest Contentful Paint**: < 2.5 seconds
- **Cumulative Layout Shift**: < 0.1
- **First Input Delay**: < 100ms

### API Performance
- **Response time**: < 500ms (95th percentile)
- **Error rate**: < 1%
- **Uptime**: 99.9%
- **Throughput**: Handle 1000+ concurrent users

### Database Performance
- **Query time**: < 100ms (95th percentile)
- **Connection pooling**: Optimized for serverless
- **Indexing**: Strategic indexes on all query fields
- **Caching**: Edge caching for frequently accessed data

## 🤝 Code Review Process

### Review Checklist
- [ ] **Functionality**: Code works as intended
- [ ] **Code Quality**: Follows project conventions
- [ ] **Security**: No security vulnerabilities
- [ ] **Performance**: No performance regressions
- [ ] **Testing**: Adequate test coverage
- [ ] **Documentation**: Updated as needed

### Review Guidelines
- **Be constructive** and specific in feedback
- **Explain reasoning** for requested changes
- **Suggest alternatives** when possible
- **Approve quickly** when requirements are met
- **Use Task Master** to track review feedback

## 🎯 Success Metrics

### Development Metrics
- **Task completion rate**: 95%+ on-time delivery
- **Code review turnaround**: < 24 hours
- **Build success rate**: 99%+
- **Test coverage**: 80%+

### Quality Metrics
- **Bug rate**: < 0.1 bugs per 1000 lines of code
- **Performance**: Meet all performance targets
- **Security**: Zero critical vulnerabilities
- **User satisfaction**: 4.5+ star rating

### Business Metrics
- **Lead conversion**: > 15% improvement
- **Sales cycle time**: 20% reduction
- **User engagement**: Increased feature adoption
- **System reliability**: 99.9% uptime

---

**Thank you for contributing to the Cadillac Dealership CRM System!** 🚗✨

Your contributions help deliver exceptional customer experiences and drive business growth for Cadillac dealerships nationwide.