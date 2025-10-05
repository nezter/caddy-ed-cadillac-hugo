-- Migration: Add password_hash field to sales_reps table
-- This migration adds the missing password_hash field for authentication

-- Add password_hash column to sales_reps table
ALTER TABLE sales_reps ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

-- Add comment for documentation
COMMENT ON COLUMN sales_reps.password_hash IS 'bcrypt hashed password for authentication';

-- Create index on email for faster lookups
CREATE INDEX IF NOT EXISTS idx_sales_reps_email ON sales_reps(email);

-- Create index on status for active user queries
CREATE INDEX IF NOT EXISTS idx_sales_reps_status ON sales_reps(status);