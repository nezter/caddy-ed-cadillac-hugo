#!/bin/bash

# =============================================================================
# Cadillac Dealership CRM - Credential Setup Guide
# =============================================================================
# This script helps you gather all required credentials and services
# =============================================================================

echo "🚗 Cadillac Dealership CRM - Credential Setup Guide"
echo "=================================================="
echo ""

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to generate secure random string
generate_secret() {
    if command_exists openssl; then
        openssl rand -base64 32
    else
        # Fallback method
        LC_ALL=C tr -dc 'A-Za-z0-9!@#$%^&*()_+=' < /dev/urandom | head -c 32
    fi
}

echo "📋 REQUIRED SERVICES SETUP"
echo "========================="
echo ""

echo "1. 🔐 SUPABASE (PostgreSQL Database) - REQUIRED"
echo "   ------------------------------------------------"
echo "   • Visit: https://supabase.com"
echo "   • Click 'Start your project'"
echo "   • Choose GitHub/Google login"
echo "   • Create new project with:"
echo "     - Database Password: $(generate_secret)"
echo "     - Region: Choose closest to your customers"
echo "   • After creation, go to Settings → API to get:"
echo "     - Project URL (SUPABASE_URL)"
echo "     - anon public key (SUPABASE_ANON_KEY)"
echo "     - service_role key (SUPABASE_SERVICE_ROLE_KEY)"
echo ""

echo "2. 📧 SENDGRID (Email Service) - REQUIRED for lead follow-up"
echo "   ---------------------------------------------------------"
echo "   • Visit: https://sendgrid.com"
echo "   • Sign up for free account (100 emails/day)"
echo "   • Verify your email domain"
echo "   • Go to Settings → API Keys → Create API Key"
echo "   • Generate API Key with 'Mail Send' permissions"
echo ""

echo "3. 📱 TWILIO (SMS Service) - REQUIRED for text messaging"
echo "   ------------------------------------------------------"
echo "   • Visit: https://twilio.com"
echo "   • Sign up for free account"
echo "   • Get a phone number (or use your own)"
echo "   • Go to Console → Project Settings → API Credentials"
echo "   • Note your Account SID and Auth Token"
echo ""

echo "4. 🚗 CADILLAC API (Inventory Integration) - OPTIONAL"
echo "   ---------------------------------------------------"
echo "   • Contact your Cadillac dealership representative"
echo "   • Request access to Cadillac Dealer API"
echo "   • You'll need:"
echo "     - Dealer API Key"
echo "     - Your Dealer Code"
echo ""

echo ""
echo "🔧 QUICK START COMMANDS"
echo "======================="
echo ""

# Generate JWT Secret
JWT_SECRET=$(generate_secret)
echo "Generated JWT_SECRET:"
echo "JWT_SECRET=$JWT_SECRET"
echo ""

echo "📝 UPDATE YOUR .env.local FILE WITH THESE VALUES:"
echo "=============================================="
echo ""

cat << 'EOF'
# Replace these placeholder values with your actual credentials:

# SUPABASE (from Supabase Settings → API)
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here

# SENDGRID (from SendGrid API Settings)
SENDGRID_API_KEY=SG.your_sendgrid_api_key_here
FROM_EMAIL=noreply@yourdealership.com
FROM_NAME=Your Cadillac Dealership

# TWILIO (from Twilio Console)
TWILIO_ACCOUNT_SID=ACyour_twilio_account_sid_here
TWILIO_AUTH_TOKEN=your_twilio_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890

# CADILLAC API (from your Cadillac representative)
CADILLAC_API_KEY=your_cadillac_dealer_api_key_here
DEALER_CODE=your_dealer_code

# JWT SECRET (use the generated one above)
JWT_SECRET=PASTE_GENERATED_JWT_SECRET_HERE
EOF

echo ""
echo "🚀 NEXT STEPS"
echo "============="
echo ""
echo "1. Update .env.local with your actual credentials"
echo "2. Test locally: npm run test:env"
echo "3. Run database migrations: npm run migrate"
echo "4. Start development server: npm run dev"
echo "5. For production, add these to Netlify Environment Variables"
echo ""

echo "🌐 PRODUCTION DEPLOYMENT"
echo "========================"
echo ""
echo "To deploy to Netlify:"
echo "1. Go to Netlify Dashboard → Your Site → Site Settings → Build & deploy → Environment"
echo "2. Add each variable from your .env.local (except development-specific ones)"
echo "3. Use production values (not localhost URLs)"
echo "4. Trigger new deploy after adding variables"
echo ""

echo "✅ CHECKLIST"
echo "=========="
echo "☐ Create Supabase account and project"
echo "☐ Get Supabase URL and API keys"
echo "☐ Create SendGrid account and API key"
echo "☐ Create Twilio account and get credentials"
echo "☐ Contact Cadillac for API access (optional)"
echo "☐ Update .env.local with all credentials"
echo "☐ Test environment setup: npm run test:env"
echo "☐ Run database migrations: npm run migrate"
echo "☐ Add production variables to Netlify"
echo ""

echo "📖 NEED HELP?"
echo "============"
echo "• Supabase Docs: https://supabase.com/docs"
echo "• SendGrid Docs: https://sendgrid.com/docs"
echo "• Twilio Docs: https://twilio.com/docs"
echo "• Netlify Docs: https://docs.netlify.com"
echo ""

echo "🎯 MINIMUM REQUIRED FOR BASIC FUNCTIONALITY:"
echo "=============================================="
echo "• JWT_SECRET (any secure 32+ character string)"
echo "• SUPABASE_URL + SUPABASE_ANON_KEY"
echo "• SENDGRID_API_KEY (for email notifications)"
echo "• TWILIO credentials (for SMS)"
echo ""

echo "Script completed! Check above for your generated JWT_SECRET and setup instructions."