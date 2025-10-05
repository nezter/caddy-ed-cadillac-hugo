# Lead Deduplication System

This document describes the comprehensive lead deduplication system implemented to prevent duplicate leads based on email, phone, and name matching.

## Overview

The deduplication system uses fuzzy matching algorithms to identify potential duplicate leads and provides both automatic and manual merge capabilities. It includes data normalization to ensure consistent comparison of lead information.

## Components

### 1. Data Normalization (`utils/data-normalizer.js`)

Normalizes lead data for consistent comparison:
- **Email**: Converts to lowercase, removes spaces, strips Gmail-style aliases
- **Phone**: Uses libphonenumber-js for E.164 format standardization
- **Name**: Converts to lowercase, normalizes spaces, removes non-alphabetic characters

### 2. Fuzzy Matching (`utils/fuzzy-matcher.js`)

Implements fuzzy matching algorithms:
- **Levenshtein Distance**: Calculates similarity between strings
- **Fuse.js Integration**: Advanced fuzzy search capabilities
- **Multi-field Matching**: Combines email, phone, and name matching with confidence scoring

### 3. Deduplication Service (`utils/deduplication-service.js`)

Core service that:
- Checks new leads against existing database records
- Calculates confidence scores for potential duplicates
- Provides manual merge functionality
- Tracks duplicate statistics

### 4. API Endpoints

- **`/lead-duplicates`**: GET for statistics, POST for duplicate checking
- **`/lead-merge`**: POST for manual lead merging

## Integration

### Automatic Deduplication

The system is integrated into lead processing pipelines:
- `lead-management.js`: Checks for duplicates before CRM submission
- `leads.js`: Prevents duplicate storage in database

When a duplicate is detected with high confidence (>80%), the system:
- Returns success response indicating duplicate found
- Updates last contact timestamp on existing lead
- Prevents duplicate CRM submissions

### Manual Merge Interface

Admin interface at `/admin/leads` provides:
- Duplicate statistics dashboard
- Manual merge functionality
- Potential duplicate identification

## Database Schema

```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  -- ... other fields

  -- Normalized fields for deduplication
  normalized_email TEXT,
  normalized_phone TEXT,
  normalized_name TEXT,

  -- Duplicate tracking
  duplicate_count INTEGER DEFAULT 0,
  merged_from UUID[] DEFAULT '{}',
  merged_into UUID,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  last_contact TIMESTAMP WITH TIME ZONE
);
```

## Configuration

### Matching Thresholds

- **Email**: Exact match (100% confidence)
- **Phone**: Exact match (100% confidence)
- **Name**: Fuzzy match (>80% similarity)
- **Overall**: >70% combined confidence for auto-detection

### Dependencies

```json
{
  "fuse.js": "^6.6.2",
  "fast-levenshtein": "^2.0.6",
  "libphonenumber-js": "^1.10.30",
  "@supabase/supabase-js": "^2.38.4"
}
```

## Usage Examples

### Check for Duplicates

```javascript
const deduplicationService = new DeduplicationService();
const result = await deduplicationService.checkForDuplicates(newLeadData);

if (result.isDuplicate) {
  console.log('Duplicate found with confidence:', result.confidence);
}
```

### Manual Merge

```javascript
const result = await deduplicationService.mergeDuplicates(
  'primary-lead-id',
  ['duplicate-id-1', 'duplicate-id-2']
);
```

## Monitoring

The system provides statistics via the admin interface:
- Total leads processed
- Number of merged duplicates
- Average duplicates per lead
- Potential duplicate identification

## Future Enhancements

- Machine learning-based duplicate detection
- Batch deduplication processing
- Integration with external CRM duplicate prevention
- Advanced similarity algorithms (soundex, metaphone)
- Duplicate prevention at form submission level