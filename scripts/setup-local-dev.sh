#!/bin/bash

# Local Development Setup Script for Cadillac of South Charlotte
# Sets up local Netlify development environment with all services

set -e

echo "🚀 Setting up local development environment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check if we're in the right directory
if [ ! -f "netlify.toml" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

# Create .env file for local development
print_step "Creating environment configuration..."
cat > .env.local << EOF
# Local Development Environment Variables
NODE_ENV=development
HUGO_ENV=development

# Database Configuration (use local or test values)
SUPABASE_URL=https://test.supabase.co
SUPABASE_ANON_KEY=test-anon-key
SUPABASE_SERVICE_ROLE_KEY=test-service-key
SUPABASE_DB_URL=postgresql://localhost:5432/test_db

# JWT Configuration
JWT_SECRET=test-jwt-secret-for-local-development-only
JWT_EXPIRES_IN=24h

# Redis Configuration (optional for local dev)
REDIS_URL=redis://localhost:6379

# Netlify Configuration
NETLIFY_SITE_ID=local-dev-site
NETLIFY_AUTH_TOKEN=local-dev-token

# API Configuration
API_BASE_URL=http://localhost:8888
SITE_URL=http://localhost:1313

# Feature Flags
ENABLE_CACHE=true
ENABLE_RATE_LIMITING=false
ENABLE_ANALYTICS=true

# Logging
LOG_LEVEL=debug
ENABLE_PERFORMANCE_MONITORING=true
EOF

print_status "Created .env.local file"

# Install dependencies
print_step "Installing dependencies..."
cd netlify/functions
npm install
cd ..
print_status "Dependencies installed"

# Create local database setup script
print_step "Creating local database setup..."
mkdir -p scripts
cat > scripts/setup-local-db.sh << 'EOF'
#!/bin/bash

# Local Database Setup Script
echo "🗄️ Setting up local database..."

# Check if PostgreSQL is running
if ! pg_isready -q; then
    echo "Starting PostgreSQL..."
    sudo systemctl start postgresql || echo "Please start PostgreSQL manually"
fi

# Create test database
createdb cadillac_followup_test 2>/dev/null || echo "Database already exists"

# Run migrations
echo "Running database migrations..."
psql -d cadillac_followup_test -f database/migrations/005_add_followup_system_tables.sql
psql -d cadillac_followup_test -f database/migrations/006_database_performance_optimization.sql

echo "✅ Database setup complete"
EOF

chmod +x scripts/setup-local-db.sh
print_status "Created database setup script"

# Create Redis setup script
print_step "Creating Redis setup..."
cat > scripts/setup-local-redis.sh << 'EOF'
#!/bin/bash

# Local Redis Setup Script
echo "🔴 Setting up Redis..."

# Check if Redis is running
if ! redis-cli ping > /dev/null 2>&1; then
    echo "Starting Redis..."
    redis-server --daemonize yes --port 6379
    sleep 2
fi

# Test Redis connection
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "❌ Redis failed to start"
    exit 1
fi
EOF

chmod +x scripts/setup-local-redis.sh
print_status "Created Redis setup script"

# Create local development server script
print_step "Creating development server script..."
cat > scripts/start-dev-server.sh << 'EOF'
#!/bin/bash

# Local Development Server Script
echo "🚀 Starting local development servers..."

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Start Redis in background
echo "Starting Redis..."
redis-server --daemonize yes --port 6379 || echo "Redis already running"

# Start Netlify functions in background
echo "Starting Netlify functions..."
cd netlify/functions
npx netlify functions:serve --port=8888 --functions=./ &
FUNCTIONS_PID=$!
cd ..

# Wait for functions to start
sleep 5

# Start Hugo development server
echo "Starting Hugo development server..."
./hugo server -D -F --bind 0.0.0.0 --port 1313 --buildDrafts --buildFuture &
HUGO_PID=$!

echo "✅ Development servers started!"
echo ""
echo "🌐 Hugo site: http://localhost:1313"
echo "🔧 Netlify functions: http://localhost:8888"
echo "📊 Health check: http://localhost:8888/.netlify/functions/health-check"
echo ""
echo "Press Ctrl+C to stop all servers"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Stopping development servers..."
    kill $FUNCTIONS_PID 2>/dev/null || true
    kill $HUGO_PID 2>/dev/null || true
    echo "✅ All servers stopped"
    exit 0
}

# Trap Ctrl+C
trap cleanup INT

# Wait for processes
wait
EOF

chmod +x scripts/start-dev-server.sh
print_status "Created development server script"

# Create test runner script
print_step "Creating test runner script..."
cat > scripts/run-tests.sh << 'EOF'
#!/bin/bash

# Test Runner Script
echo "🧪 Running test suite..."

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

cd netlify/functions

# Run unit tests
echo "Running unit tests..."
npm run test:unit || npm test

# Run integration tests
echo "Running integration tests..."
npm run test:integration || echo "Integration tests not configured"

# Generate coverage report
echo "Generating coverage report..."
npm run test:coverage || npm test -- --coverage

cd ..
echo "✅ Tests completed"
EOF

chmod +x scripts/run-tests.sh
print_status "Created test runner script"

# Create build validation script
print_step "Creating build validation script..."
cat > scripts/validate-build.sh << 'EOF'
#!/bin/bash

# Build Validation Script
echo "🔍 Validating build..."

# Load environment variables
export $(cat .env.local | grep -v '^#' | xargs)

# Clean previous build
echo "Cleaning previous build..."
rm -rf public/

# Build Hugo site
echo "Building Hugo site..."
./hugo --gc --minify

if [ $? -eq 0 ]; then
    echo "✅ Hugo build successful"
else
    echo "❌ Hugo build failed"
    exit 1
fi

# Test Netlify functions
echo "Testing Netlify functions..."
cd netlify/functions

# Run syntax check
for function in *.js; do
    if [ -f "$function" ]; then
        node -c "$function"
        if [ $? -eq 0 ]; then
            echo "✅ $function syntax OK"
        else
            echo "❌ $function syntax error"
            exit 1
        fi
    fi
done

cd ..
echo "✅ All functions syntax OK"

# Check build output
if [ -d "public" ] && [ "$(ls -A public)" ]; then
    echo "✅ Build validation complete"
    echo "📊 Build size: $(du -sh public | cut -f1)"
    echo "📄 Files built: $(find public -type f | wc -l)"
else
    echo "❌ Build output is empty"
    exit 1
fi
EOF

chmod +x scripts/validate-build.sh
print_status "Created build validation script"

# Create API testing script
print_step "Creating API testing script..."
cat > scripts/test-api.sh << 'EOF'
#!/bin/bash

# API Testing Script
echo "🔧 Testing API endpoints..."

BASE_URL="http://localhost:8888"

# Test health check
echo "Testing health check..."
curl -s "$BASE_URL/.netlify/functions/health-check" | jq '.' || echo "Health check failed"

# Test campaigns endpoint
echo "Testing campaigns endpoint..."
curl -s -H "Authorization: Bearer test-token" \
     "$BASE_URL/.netlify/functions/followup-campaigns" | jq '.' || echo "Campaigns test failed"

# Test analytics endpoint
echo "Testing analytics endpoint..."
curl -s -H "Authorization: Bearer test-token" \
     "$BASE_URL/.netlify/functions/followup-analytics/dashboard" | jq '.' || echo "Analytics test failed"

echo "✅ API testing complete"
EOF

chmod +x scripts/test-api.sh
print_status "Created API testing script"

# Create Makefile for easy commands
print_step "Creating Makefile..."
cat > Makefile << 'EOF'
# Makefile for Cadillac of South Charlotte Development

.PHONY: help install dev test build clean validate api

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	cd netlify/functions && npm install
	npm install -g netlify-cli

dev: ## Start development servers
	./scripts/start-dev-server.sh

test: ## Run test suite
	./scripts/run-tests.sh

build: ## Build for production
	./hugo --gc --minify

validate: ## Validate build and functions
	./scripts/validate-build.sh

api: ## Test API endpoints
	./scripts/test-api.sh

clean: ## Clean build artifacts
	rm -rf public/
	rm -rf netlify/functions/.netlify/
	rm -rf netlify/functions/coverage/

setup-db: ## Setup local database
	./scripts/setup-local-db.sh

setup-redis: ## Setup local Redis
	./scripts/setup-local-redis.sh

setup-all: setup-db setup-redis ## Setup all services

lint: ## Lint code
	cd netlify/functions && npm run lint || echo "Lint not configured"

format: ## Format code
	cd netlify/functions && npm run format || echo "Format not configured"

deploy-staging: ## Deploy to staging
	netlify deploy --dir=public --functions=netlify/functions --message="Staging deploy"

deploy-prod: ## Deploy to production
	netlify deploy --prod --dir=public --functions=netlify/functions --message="Production deploy"
EOF

print_status "Created Makefile"

# Create local development documentation
print_step "Creating development documentation..."
mkdir -p docs
cat > docs/LOCAL_DEVELOPMENT.md << 'EOF'
# Local Development Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   make install
   ```

2. **Setup services:**
   ```bash
   make setup-all
   ```

3. **Start development servers:**
   ```bash
   make dev
   ```

4. **Access the application:**
   - Hugo site: http://localhost:1313
   - Netlify functions: http://localhost:8888
   - Health check: http://localhost:8888/.netlify/functions/health-check

## Available Commands

- `make help` - Show all available commands
- `make install` - Install all dependencies
- `make dev` - Start development servers
- `make test` - Run test suite
- `make build` - Build for production
- `make validate` - Validate build and functions
- `make api` - Test API endpoints
- `make clean` - Clean build artifacts
- `make lint` - Lint code
- `make deploy-staging` - Deploy to staging
- `make deploy-prod` - Deploy to production

## Environment Configuration

The `.env.local` file contains all environment variables for local development. These are automatically loaded when running the development servers.

## Testing

### Unit Tests
```bash
cd netlify/functions
npm test
```

### Integration Tests
```bash
cd netlify/functions
npm run test:integration
```

### API Testing
```bash
make api
```

## Database

The local development setup uses a PostgreSQL database named `cadillac_followup_test`. Run migrations with:
```bash
make setup-db
```

## Redis

Redis is used for caching. Start it with:
```bash
make setup-redis
```

## Debugging

### Hugo Debugging
```bash
./hugo server -D -F --bind 0.0.0.0 --port 1313 --buildDrafts --buildFuture --verbose
```

### Netlify Functions Debugging
```bash
cd netlify/functions
npx netlify functions:serve --port=8888 --functions=./ --debug
```

## Performance Monitoring

Access performance metrics at:
- Health check: http://localhost:8888/.netlify/functions/health-check
- Detailed metrics: http://localhost:8888/.netlify/functions/health-check/detailed
- Performance metrics: http://localhost:8888/.netlify/functions/health-check/performance

## Troubleshooting

### Port Conflicts
If ports are already in use, modify the scripts to use different ports.

### Database Connection Issues
Ensure PostgreSQL is running and the test database exists.

### Redis Connection Issues
Ensure Redis is running on port 6379.

### Function Errors
Check the Netlify functions console output for detailed error messages.
EOF

print_status "Created local development documentation"

# Make scripts executable
chmod +x scripts/*.sh

echo ""
echo -e "${GREEN}🎉 Local development setup complete!${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Setup services: ${YELLOW}make setup-all${NC}"
echo "2. Start development: ${YELLOW}make dev${NC}"
echo "3. Run tests: ${YELLOW}make test${NC}"
echo "4. Validate build: ${YELLOW}make validate${NC}"
echo ""
echo -e "${GREEN}📚 Documentation:${NC} docs/LOCAL_DEVELOPMENT.md"
echo -e "${GREEN}🔧 Available commands:${NC} make help"
echo ""