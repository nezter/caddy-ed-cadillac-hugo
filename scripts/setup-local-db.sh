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