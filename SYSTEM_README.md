# Cadillac Dealership CRM System

A comprehensive customer relationship management system for Cadillac dealerships, built with Hugo, Netlify Functions, and Supabase.

## 🚀 Features

### Customer-Facing Features
- **Customer Portal**: Secure login, appointment scheduling, vehicle preferences management
- **Lead Capture**: Multiple contact forms with intelligent lead scoring
- **Appointment Scheduling**: Online booking system with real-time availability
- **Email Notifications**: Automated notifications for leads, appointments, and updates

### Sales Team Features
- **Sales Dashboard**: Comprehensive dashboard with metrics, leads, and appointments
- **Lead Management**: Advanced lead tracking with status updates and notes
- **Customer Database**: Complete customer profiles with interaction history
- **Appointment Management**: Schedule, track, and complete appointments
- **Task Management**: Automated task creation and assignment

### Technical Features
- **Hybrid Database**: Supabase (primary) + Turso (fast reads/cache)
- **Real-time Updates**: Live dashboard updates and notifications
- **Email Integration**: SMTP-based notification system
- **API-First Design**: RESTful APIs for all functionality
- **Mobile Responsive**: Works on all devices

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Hugo Site     │    │ Netlify Functions│    │   Databases     │
│                 │    │                 │    │                 │
│ • Customer      │◄──►│ • Lead Capture  │◄──►│ • Supabase      │
│   Portal        │    │ • Auth & API    │    │   (Primary)     │
│ • Contact Forms │    │ • Notifications │    │ • Turso         │
│ • Static Pages  │    │ • Dashboard     │    │   (Cache)       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 📋 Prerequisites

- Node.js 18+
- Hugo 0.121+
- Supabase account
- SMTP email service (optional)

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone <repository-url>
cd caddy-ed-cadillac-hugo
npm install
```

### 2. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit with your credentials
nano .env
```

### 3. Database Setup
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Go to SQL Editor
4. Run the contents of `create-database-tables.sql`
5. Copy the connection details to your `.env` file

### 4. Development
```bash
# Start Hugo development server
npm run dev:hugo

# In another terminal, build assets
npm run dev

# Or run both simultaneously
npm run dev:all
```

### 5. Testing
```bash
# Run end-to-end tests
node test-end-to-end-mock.js

# Test database connection
node test-database-connection.js

# Test functions directly
node test-functions-direct.js
```

## 🔧 Configuration

### Environment Variables

```bash
# Task Master AI (Optional)
ANTHROPIC_API_KEY=your-anthropic-key
PERPLEXITY_API_KEY=your-perplexity-key
OPENAI_API_KEY=your-openai-key

# Authentication
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=8h

# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-auth-token

# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# External APIs
CRM_API_KEY=your-crm-key
INVENTORY_API_ENDPOINT=https://dealership.com/api/inventory
```

### Database Schema

The system uses a comprehensive database schema with the following main tables:

- **customers**: Customer profiles and preferences
- **leads**: Lead capture and management
- **sales_reps**: Sales team members
- **appointments**: Scheduled appointments
- **interactions**: Customer interactions and notes
- **vehicles**: Inventory management
- **tasks**: Task management system
- **dashboard_metrics**: Cached analytics

## 🎯 API Endpoints

### Customer APIs
- `POST /.netlify/functions/customer-auth` - Customer login
- `GET /.netlify/functions/customer-dashboard/*` - Dashboard data

### Sales APIs
- `POST /.netlify/functions/sales-login` - Sales rep login
- `GET /.netlify/functions/sales-dashboard` - Sales dashboard
- `GET /.netlify/functions/sales-leads` - Lead management
- `GET /.netlify/functions/sales-appointments` - Appointment management

### Lead & Contact APIs
- `POST /.netlify/functions/leads` - Lead submission
- `POST /.netlify/functions/lead-form` - Contact form
- `POST /.netlify/functions/schedule-appointment` - Appointment booking

### Notification APIs
- `POST /.netlify/functions/send-notification` - Email notifications

## 📱 Customer Portal

### Features
- **Secure Login**: Email + phone authentication
- **Dashboard**: Appointments, preferences, activity
- **Appointment Scheduling**: Online booking system
- **Message Center**: Direct communication with sales reps
- **Profile Management**: Update preferences and information

### Usage
1. Visit `/customer/` on your website
2. Enter email and phone from a lead/contact
3. Access personalized dashboard
4. Schedule appointments and send messages

## 👥 Sales Dashboard

### Features
- **Real-time Metrics**: Leads, appointments, conversion rates
- **Lead Management**: Status updates, notes, assignment
- **Appointment Calendar**: Schedule and track appointments
- **Customer Database**: Complete customer profiles
- **Task Management**: Automated follow-ups and reminders

### Access
- Login at `/admin/` or `/sales/`
- Dashboard available at `/admin/dashboard/`
- API endpoints for mobile app integration

## 📧 Email Notifications

### Types
- **Lead Notifications**: New leads sent to sales team
- **Appointment Confirmations**: Sent to customers and sales reps
- **Follow-up Emails**: Automated customer communication
- **Status Updates**: Lead status changes and updates

### Configuration
```bash
# In .env file
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
```

## 🧪 Testing

### Test Scripts
```bash
# End-to-end workflow test
node test-end-to-end-mock.js

# Database connection test
node test-database-connection.js

# Direct function testing
node test-functions-direct.js

# Dashboard API testing
node test-dashboard-apis.js
```

### Test Data
The system includes test sales representatives and sample data for development and testing.

## 🚀 Deployment

### Netlify Deployment
1. Connect repository to Netlify
2. Set environment variables in Netlify dashboard
3. Deploy with build command: `npm run build`
4. Functions automatically deployed

### Manual Deployment
```bash
# Build for production
npm run build

# Deploy static files
# (Configure your hosting provider)

# Functions deploy automatically with Netlify
```

## 🔒 Security

### Authentication
- JWT-based authentication for sales reps
- Secure customer portal with email/phone verification
- Role-based access control

### Data Protection
- Row Level Security (RLS) enabled on all tables
- Encrypted sensitive data
- Secure API endpoints

### Best Practices
- Environment variables for secrets
- Input validation and sanitization
- Rate limiting on API endpoints
- HTTPS required for production

## 📊 Analytics & Reporting

### Dashboard Metrics
- Lead conversion rates
- Appointment completion rates
- Sales performance by representative
- Customer satisfaction scores

### Reporting Features
- Custom date ranges
- Export capabilities
- Real-time updates
- Historical trends

## 🔧 Development

### Project Structure
```
caddy-ed-cadillac-hugo/
├── site/                    # Hugo site
│   ├── content/            # Markdown content
│   ├── layouts/            # Hugo templates
│   └── static/             # Static assets
├── src/                    # Source code
│   ├── js/                # JavaScript modules
│   └── css/               # Stylesheets
├── netlify/               # Serverless functions
│   └── functions/         # Netlify functions
├── database/              # Database migrations
└── scripts/               # Build and utility scripts
```

### Development Workflow
1. Make changes to source files
2. Run `npm run dev` for asset building
3. Run `npm run dev:hugo` for site development
4. Test with provided test scripts
5. Commit and deploy

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit pull request

## 📝 License

This project is proprietary software for Caddy Ed Cadillac dealership.

## 🆘 Support

For support and questions:
- Check the test scripts for common issues
- Review environment configuration
- Verify database setup
- Check Netlify function logs

## 🎯 Roadmap

### Phase 1 (Current)
- ✅ Customer portal with authentication
- ✅ Lead capture and management
- ✅ Sales dashboard
- ✅ Email notifications
- ✅ Appointment scheduling

### Phase 2 (Next)
- [ ] Mobile app development
- [ ] Advanced analytics
- [ ] CRM integrations
- [ ] Inventory management
- [ ] Customer feedback system

### Phase 3 (Future)
- [ ] AI-powered lead scoring
- [ ] Predictive analytics
- [ ] Multi-location support
- [ ] Advanced reporting
- [ ] Customer loyalty program