# CRUSH.md - Development Commands & Style Guide

## Commands
- `npm run dev` - Start development server with hot reload
- `npm run build` - Production build with optimization
- `npm run lint` - Run ESLint on src/ directory
- `npm test` - Run tests (currently placeholder)
- `npm run setup` - Initialize environment configuration
- `npm run migrate` - Run database migrations
- `npm run migrate:turso` - Run Turso migrations

## Code Style
- **JavaScript**: ES6+, semicolons required, double quotes, 2-space indentation
- **Imports**: Use ES6 import/export, place at top of file
- **Error Handling**: Use centralized error event system for API calls
- **JSDoc**: Document all public functions with parameter types and descriptions
- **Naming**: camelCase for variables/functions, PascalCase for classes/components
- **Testing**: Use Jest for unit tests, mock DOM elements, clean up after each test

## Architecture
- **Frontend**: Hugo static site with Webpack bundling
- **Backend**: Netlify Functions with Node.js
- **Database**: Supabase (PostgreSQL) + Turso (SQLite)
- **State Management**: Component-based with observer pattern
- **API**: RESTful with centralized error handling

## Cursor Rules
Follow `.cursor/rules/` guidelines for rule structure and maintenance. Use proper rule formatting with frontmatter, file references, and code examples.