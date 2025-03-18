# Supabase Integration Guide

This document provides information on how the Caddy Ed Cadillac website integrates with Supabase for database functionality.

## Overview

Supabase is used as a backend database service for storing and retrieving vehicle inventory data, user preferences, and other dynamic content. It provides a PostgreSQL database with a REST API interface.

## Configuration

To connect to Supabase, the following environment variables must be set:

```
SUPABASE_URL=https://your-supabase-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key
```

These can be added to a `.env` file locally (see `.env.example` for reference) or configured in your deployment environment (e.g., Netlify).

## Database Schema

### Vehicles Table

The main table for storing vehicle inventory:

```sql
CREATE TABLE vehicles (
  id SERIAL PRIMARY KEY,
  make TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  trim TEXT,
  price INTEGER NOT NULL,
  mileage INTEGER,
  exterior_color TEXT,
  interior_color TEXT,
  vin TEXT UNIQUE NOT NULL,
  stock_number TEXT,
  fuel_type TEXT,
  transmission TEXT,
  drivetrain TEXT,
  body_style TEXT,
  engine TEXT,
  description TEXT,
  features JSONB,
  images JSONB,
  featured BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_vehicles_make ON vehicles(make);
CREATE INDEX idx_vehicles_model ON vehicles(model);
CREATE INDEX idx_vehicles_year ON vehicles(year);
CREATE INDEX idx_vehicles_price ON vehicles(price);
CREATE INDEX idx_vehicles_featured ON vehicles(featured);
CREATE INDEX idx_vehicles_body_style ON vehicles(body_style);
```

### User Preferences Table

Stores user preferences and saved filters:

```sql
CREATE TABLE user_preferences (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id),
  saved_filters JSONB,
  recent_searches JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
```

## JavaScript Integration

The `supabase.js` utility in `src/lib/supabase.js` provides a configured Supabase client that can be imported and used throughout the application:

```javascript
// Example usage
import { supabase } from '../lib/supabase';

async function getVehicles() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}
```

## API Usage Examples

### Fetching Vehicles with Filtering

```javascript
async function getFilteredVehicles({ make, model, priceRange, yearRange }) {
  let query = supabase.from('vehicles').select('*');
  
  if (make) query = query.eq('make', make);
  if (model) query = query.eq('model', model);
  if (priceRange) query = query.gte('price', priceRange.min).lte('price', priceRange.max);
  if (yearRange) query = query.gte('year', yearRange.min).lte('year', yearRange.max);
  
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
```

### Saving User Preferences

```javascript
async function saveUserFilter(userId, filterName, filterState) {
  const { data: existingPrefs, error: fetchError } = await supabase
    .from('user_preferences')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;
  
  const savedFilters = existingPrefs?.saved_filters || [];
  savedFilters.push({
    id: Date.now(),
    name: filterName,
    state: filterState,
    created_at: new Date().toISOString()
  });
  
  if (existingPrefs) {
    const { error } = await supabase
      .from('user_preferences')
      .update({ saved_filters: savedFilters, updated_at: new Date() })
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('user_preferences')
      .insert({ user_id: userId, saved_filters: savedFilters });
    if (error) throw error;
  }
}
```

## Netlify Functions Integration

The application uses Netlify Functions to securely interact with Supabase from frontend code. This provides an additional layer of security by keeping sensitive API keys server-side.

See the functions in `/netlify/functions/` for examples of how to use Supabase in serverless functions.

## Advanced Features

### Row Level Security

Supabase tables are configured with Row Level Security (RLS) policies to ensure data security:

```sql
-- Example RLS policy for vehicles table
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

-- Anyone can view published vehicles
CREATE POLICY "Anyone can view published vehicles" ON vehicles 
  FOR SELECT USING (true);

-- Only admins can modify vehicles
CREATE POLICY "Only admins can modify vehicles" ON vehicles
  USING (auth.uid() IN (SELECT user_id FROM admins));
```

### Real-time Updates

Supabase supports real-time updates, which can be used for features like inventory alerts:

```javascript
// Subscribe to changes in the inventory
const subscription = supabase
  .from('vehicles')
  .on('INSERT', payload => {
    console.log('New vehicle added!', payload.new);
    // Update UI or show notification
  })
  .subscribe();

// Remember to unsubscribe when done
// subscription.unsubscribe()
```
