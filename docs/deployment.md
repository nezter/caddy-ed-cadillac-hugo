# Deployment Guide - Cadillac Dealership System

## 🚀 Production Deployment

This guide covers deploying the Cadillac Dealership CRM system to production using Netlify.

## Prerequisites

### Required Accounts
- [Netlify Account](https://netlify.com) - Hosting and CDN
- [Supabase Account](https://supabase.com) - Primary database
- [Turso Account](https://turso.tech) - Edge database (optional)
- Domain name configured in Netlify

### Required API Keys
- Supabase project URL and keys
- JWT secret key (generate securely)
- Optional: Turso database credentials
- Optional: CRM integration keys
- Optional: Email service credentials

## 📋 Pre-Deployment Checklist

### Environment Configuration
- [ ] `.env` file configured with all required variables
- [ ] JWT_SECRET generated (minimum 32 characters)
- [ ] Database URLs and credentials verified
- [ ] API keys tested and working

### Database Setup
- [ ] Supabase project created
- [ ] Database migrations run (`npm run migrate`)
- [ ] Initial sales rep account created
- [ ] Optional: Turso database configured

### Application Testing
- [ ] All critical user flows tested
- [ ] API endpoints responding correctly
- [ ] Authentication working
- [ ] Lead submission functional
- [ ] Inventory sync operational

## 🌐 Netlify Deployment

### Method 1: One-Click Deploy

1. Click the deploy button in README.md
2. Connect your GitHub account
3. Configure build settings:
   - **Branch**: `main` (or your production branch)
   - **Build command**: `npm run build`
   - **Publish directory**: `dist`
   - **Functions directory**: `netlify/functions`

### Method 2: Manual GitHub Integration

1. **Connect Repository**
   ```bash
   # In Netlify dashboard
   # Add new site → Import from Git
   # Select your repository
   ```

2. **Configure Build Settings**
   ```yaml
   # netlify.toml (already configured)
   [build]
     publish = "dist"
     command = "npm run build"
     functions = "netlify/functions"

   [build.environment]
     HUGO_VERSION = "0.121.1"
     NODE_VERSION = "18.16.0"
     NPM_VERSION = "9.5.1"
   ```

3. **Set Environment Variables**
   In Netlify dashboard → Site settings → Environment variables:

   ```bash
   # Required
   JWT_SECRET=your-secure-jwt-secret-here
   SUPABASE_URL=https://your-project.supabase.co
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key

   # Optional
   TURSO_DATABASE_URL=libsql://your-db.turso.io
   TURSO_AUTH_TOKEN=your-turso-auth-token
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   ```

## 🗄️ Database Setup

### Supabase Configuration

1. **Create Supabase Project**
   ```bash
   # Visit https://supabase.com/dashboard
   # Create new project
   # Choose region closest to your users
   ```

2. **Run Database Migrations**
   ```bash
   # Locally or in CI/CD
   npm run migrate
   ```

3. **Configure Row Level Security (RLS)**
   ```sql
   -- Enable RLS on all tables
   ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
   ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
   ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;

   -- Create policies for sales reps
   CREATE POLICY "Sales reps can view assigned customers"
   ON customers FOR SELECT
   USING (assigned_sales_rep_id = auth.uid()::text);
   ```

4. **Set up Authentication**
   - Configure email templates in Supabase Auth
   - Set up password reset flows
   - Configure OAuth providers if needed

### Turso Configuration (Optional)

1. **Install Turso CLI**
   ```bash
   npm run setup:turso
   ```

2. **Create Database**
   ```bash
   # CLI will guide you through authentication
   npm run migrate:turso
   ```

3. **Configure Replication**
   - Set up Supabase → Turso sync triggers
   - Configure cache invalidation
   - Test read/write separation

## 🔧 Build Configuration

### Hugo Configuration

```toml
# config.toml
baseURL = "https://your-domain.com"
languageCode = "en-us"
title = "Caddy Ed Cadillac"

[params]
  description = "Cadillac dealership customer management system"
  author = "Caddy Ed Cadillac"

# Build settings
[build]
  publishDir = "dist"
  command = "hugo --gc --minify"
```

### Webpack Configuration

```javascript
// webpack.prod.js
const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = merge(common, {
  mode: 'production',
  optimization: {
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: true,
          },
        },
      }),
      new CssMinimizerPlugin(),
    ],
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      },
    },
  },
});
```

## 🔒 Security Configuration

### Netlify Security Headers

```toml
# netlify.toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.netlify.app; style-src 'self' 'unsafe-inline' fonts.googleapis.com; img-src 'self' data: *.cadillacofsouthcharlotte.com; font-src 'self' fonts.gstatic.com; connect-src 'self' *.netlify.app *.supabase.co *.turso.tech;"
    Permissions-Policy = "camera=(), microphone=(), geolocation=(self)"
```

### Environment Variable Security

- Never commit `.env` files to version control
- Use Netlify's encrypted environment variables
- Rotate API keys regularly
- Use different keys for staging/production

## 📊 Monitoring & Analytics

### Netlify Analytics
- Enable Netlify Analytics in site settings
- Monitor Core Web Vitals
- Track form submissions and conversions

### Error Tracking
```javascript
// Add to main JavaScript file
window.addEventListener('error', function(e) {
  // Send to error tracking service
  console.error('JavaScript Error:', e.error);
});

// For Netlify Functions
exports.handler = async (event, context) => {
  try {
    // Function logic
  } catch (error) {
    console.error('Function Error:', error);
    // Send to error tracking
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
```

### Performance Monitoring
- Use Netlify's Lighthouse integration
- Monitor API response times
- Set up alerts for downtime
- Track database performance

## 🔄 CI/CD Pipeline

### GitHub Actions (Recommended)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Netlify

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run tests
      run: npm test

    - name: Build
      run: npm run build

    - name: Deploy to Netlify
      uses: nwtgck/actions-netlify@v2.0
      with:
        publish-dir: './dist'
        functions-dir: './netlify/functions'
        production-branch: main
        github-token: ${{ secrets.GITHUB_TOKEN }}
        deploy-message: "Deploy from GitHub Actions"
      env:
        NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
        NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

## 🚨 Post-Deployment Checklist

### Functional Testing
- [ ] Website loads correctly
- [ ] Lead forms submit successfully
- [ ] Sales login works
- [ ] Customer dashboard accessible
- [ ] Inventory displays properly
- [ ] API endpoints respond

### Performance Testing
- [ ] Page load time < 2 seconds
- [ ] Core Web Vitals scores good
- [ ] API response time < 500ms
- [ ] Mobile experience optimized

### Security Testing
- [ ] HTTPS enabled
- [ ] Security headers present
- [ ] Authentication required for admin areas
- [ ] No sensitive data exposed

### Monitoring Setup
- [ ] Error tracking configured
- [ ] Performance monitoring active
- [ ] Backup systems operational
- [ ] Alert notifications working

## 🔧 Maintenance

### Regular Tasks
- **Weekly**: Review error logs and performance metrics
- **Monthly**: Update dependencies and security patches
- **Quarterly**: Review and optimize database queries
- **Annually**: Security audit and compliance review

### Backup Strategy
- **Database**: Supabase automated backups
- **Code**: Git version control
- **Assets**: Netlify CDN with versioning
- **Configuration**: Environment variables documented

### Scaling Considerations
- **Traffic Increase**: Netlify automatically scales
- **Database Growth**: Monitor Supabase usage
- **API Limits**: Track Netlify Functions usage
- **CDN**: Global distribution already configured

## 🆘 Troubleshooting

### Common Issues

**Build Failures**
```bash
# Check build logs in Netlify dashboard
# Verify environment variables are set
# Check Hugo and Node versions match
```

**API Errors**
```bash
# Check function logs in Netlify dashboard
# Verify database connections
# Check API key validity
```

**Performance Issues**
```bash
# Enable Netlify Analytics
# Check Core Web Vitals
# Optimize images and bundles
```

**Authentication Problems**
```bash
# Verify JWT_SECRET is set
# Check token expiration
# Validate user permissions
```

For additional support, check the [API Reference](api-reference.md) or create an issue in the repository.