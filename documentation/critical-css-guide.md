# Critical CSS Implementation Guide

This guide explains how the critical CSS system works in the Caddy Ed Cadillac website and provides instructions for maintenance and extension.

## Overview

Critical CSS improves page load performance by inlining essential styles in the HTML head and loading the rest asynchronously. This approach significantly improves metrics like First Contentful Paint (FCP) and Largest Contentful Paint (LCP).

## How It Works

1. **During Build:**
   - The webpack build process identifies critical CSS for each template type
   - Critical CSS is extracted, minified, and saved to Hugo partials
   - Full CSS is still generated for asynchronous loading

2. **In The HTML:**
   - Critical CSS is inlined directly in the `<head>` section
   - Full CSS is loaded asynchronously using `preload` with an onload handler
   - A fallback ensures all browsers get appropriate CSS loading

## Directory Structure

