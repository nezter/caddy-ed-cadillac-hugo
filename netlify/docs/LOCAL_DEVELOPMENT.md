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
