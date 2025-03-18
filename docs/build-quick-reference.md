# Build System Quick Reference

A concise guide to common tasks, commands, and troubleshooting for the Caddy Ed Cadillac build system.

## Common Commands

### Basic Workflows

| Command | Description | When to Use |
|---------|-------------|-------------|
| `npm start` | Start development server | During active development |
| `npm run build` | Create production build | For testing production output or deployment |
| `npm run preview` | Preview with drafts | To preview draft content locally |
| `npm run check:errors` | Run pre-build checks | Before committing changes |

### Advanced Commands

| Command | Description | When to Use |
|---------|-------------|-------------|
| `npm run build:enhanced` | Build with enhanced errors | When troubleshooting build issues |
| `npm run build:analyze` | Analyze bundle sizes | When optimizing bundle size |
| `npm run build:notify` | Build with notifications | For long builds when multitasking |
| `npm run cache:clear` | Clear cache | When having unexplained build issues |

### Maintenance Commands

| Command | Description | When to Use |
|---------|-------------|-------------|
| `npm run lint` | Check code quality | Before committing changes |
| `npm run lint:fix` | Fix linting issues | To automatically resolve linting issues |
| `npm run clean` | Remove build artifacts | To ensure clean build |
| `npm run reinstall` | Reinstall dependencies | When having dependency issues |

## Quick Solutions for Common Issues

### Build Process Won't Start

```bash
# Check for locked processes or port conflicts
lsof -i :3000
# Reinstall dependencies if there are module issues
npm run reinstall
# Clear cache if there are persistent issues
npm run cache:clear && npm start
```

### Slow Builds

```bash
# Increase Node.js memory
NODE_OPTIONS=--max_old_space_size=4096 npm run build
# Analyze bundle sizes to find optimization opportunities
npm run build:analyze
```

### JavaScript Errors

```bash
# Run linting to catch issues
npm run lint
# Run with enhanced error reporting
npm run build:enhanced
# Check for common errors before building
npm run check:errors
```

### Hugo Template Errors

```bash
# Run Hugo with verbose output
hugo -v
# Check for missing partials
npm run check:errors
```

### CSS/Sass Issues

```bash
# Check for CSS syntax issues
npm run check:errors
```

## Task-Based Guide

### How to Add a New Page

1. Create content file in `site/content/` directory:
   ```markdown
   ---
   title: "Page Title"
   date: 2023-12-13
   draft: false
   ---
   
   Page content goes here.
