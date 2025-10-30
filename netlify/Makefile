# Makefile for Cadillac of South Charlotte Development

.PHONY: help install dev test build clean validate api

help: ## Show this help message
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies
	cd netlify/functions && npm install
	npm install -g netlify-cli

dev: ## Start development servers
	./scripts/start-dev-server.sh

test: ## Run test suite
	./scripts/run-tests.sh

build: ## Build for production
	./hugo --gc --minify

validate: ## Validate build and functions
	./scripts/validate-build.sh

api: ## Test API endpoints
	./scripts/test-api.sh

clean: ## Clean build artifacts
	rm -rf public/
	rm -rf netlify/functions/.netlify/
	rm -rf netlify/functions/coverage/

setup-db: ## Setup local database
	./scripts/setup-local-db.sh

setup-redis: ## Setup local Redis
	./scripts/setup-local-redis.sh

setup-all: setup-db setup-redis ## Setup all services

lint: ## Lint code
	cd netlify/functions && npm run lint || echo "Lint not configured"

format: ## Format code
	cd netlify/functions && npm run format || echo "Format not configured"

deploy-staging: ## Deploy to staging
	netlify deploy --dir=public --functions=netlify/functions --message="Staging deploy"

deploy-prod: ## Deploy to production
	netlify deploy --prod --dir=public --functions=netlify/functions --message="Production deploy"
