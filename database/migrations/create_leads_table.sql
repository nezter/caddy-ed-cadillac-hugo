-- Create leads table for deduplication system
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  source TEXT DEFAULT 'website',
  vehicle_interest TEXT,
  form_type TEXT DEFAULT 'general',
  lead_source TEXT DEFAULT 'website',
  page_url TEXT,
  utm JSONB DEFAULT '{}',
  consent BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'new',
  score INTEGER DEFAULT 0,

  -- Normalized fields for deduplication
  normalized_email TEXT,
  normalized_phone TEXT,
  normalized_name TEXT,

  -- Duplicate tracking
  duplicate_count INTEGER DEFAULT 0,
  merged_from UUID[] DEFAULT '{}',
  merged_into UUID,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_contact TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Indexes for performance
  UNIQUE(normalized_email, normalized_phone),
  INDEX idx_leads_email ON leads(normalized_email),
  INDEX idx_leads_phone ON leads(normalized_phone),
  INDEX idx_leads_name ON leads USING gin(normalized_name gin_trgm_ops),
  INDEX idx_leads_status ON leads(status),
  INDEX idx_leads_created_at ON leads(created_at DESC),
  INDEX idx_leads_source ON leads(source)
);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create index for trigram similarity search on names
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_name_trgm
  ON leads USING gin (normalized_name gin_trgm_ops);

-- Create view for active (non-merged) leads
CREATE OR REPLACE VIEW active_leads AS
SELECT * FROM leads
WHERE status != 'merged'
ORDER BY created_at DESC;