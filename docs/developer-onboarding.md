# Developer Onboarding Guide

This guide helps new developers get up and running with the Caddy Ed Cadillac website project quickly.

## Prerequisites

Before you start, ensure you have the following installed:

- **Node.js** (v14 or newer)
- **npm** (v7 or newer)
- **Git**
- **Hugo** (Extended version) - v0.80.0 or newer

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/caddy-ed-cadillac-hugo.git
cd caddy-ed-cadillac-hugo
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit the `.env` file to include any required credentials and configuration.

### 4. Start the Development Server

```bash
npm start
```

This will start both Hugo and Webpack in development mode. Access the site at [http://localhost:3000](http://localhost:3000).

## Project Structure

