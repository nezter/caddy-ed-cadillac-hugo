# Supabase Integration

This project uses Supabase as its backend database and authentication provider. Follow these steps to configure Supabase in your local development environment.

## Setup Instructions

1. Copy the example environment file to create your own:
   ```bash
   cp .env.example .env
   ```

2. Add your Supabase credentials to the `.env` file:
   ```
   SUPABASE_URL=https://your-project-id.supabase.co
   SUPABASE_ANON_KEY=your-anon-key
   
   # PostgreSQL Connection (if needed for direct database access)
   SUPABASE_PG_HOST=aws-0-us-east-1.pooler.supabase.com
   SUPABASE_PG_PORT=6543
   SUPABASE_PG_DATABASE=postgres
   SUPABASE_PG_USER=postgres.bsmvszgagcvvdowkrves
   SUPABASE_PG_PASSWORD=your_database_password_here
   ```

3. Make sure the `.env` file is included in your `.gitignore` to prevent committing credentials to version control.

## Security Best Practices

- Never commit your Supabase credentials to the repository
- Use environment variables for all secrets
- The anon key is safe to use in client-side code, but only has permissions set by your Supabase Row Level Security (RLS) policies
- For server-side operations that need elevated permissions, use a service role key in Netlify Functions
- Direct PostgreSQL connections should only be used in secure server environments, never in client-side code

## Available APIs

### Supabase Client

The Supabase client is available throughout the application by importing from the lib folder:

```javascript
import supabase from '@/lib/supabase';

// Example: Query data
const { data, error } = await supabase
  .from('vehicles')
  .select('*')
  .limit(10);
```

### Direct PostgreSQL Access

For more complex database operations that may not be supported by the Supabase client, you can use direct PostgreSQL access in server-side code:

```javascript
import { query } from '@/lib/database';

// Example: Complex query with joins and calculations
const result = await query(`
  SELECT v.*, COUNT(i.id) as image_count
  FROM vehicles v
  LEFT JOIN vehicle_images i ON v.id = i.vehicle_id
  GROUP BY v.id
  HAVING COUNT(i.id) > 0
  ORDER BY v.created_at DESC
  LIMIT $1
`, [10]);

console.log(result.rows);
```

**Note:** Direct PostgreSQL connections should only be used in server-side code such as Netlify Functions, never in client-side code.

## Additional Documentation

- [Supabase Documentation](https://supabase.io/docs)
- [Supabase JavaScript Client](https://supabase.io/docs/reference/javascript/start)
- [Row Level Security](https://supabase.io/docs/guides/auth/row-level-security)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
