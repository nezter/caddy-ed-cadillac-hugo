# =============================================================================
# Makefile -- caddy-ed-cadillac-hugo
#
# IMPORTANT: builds do NOT happen here or on this workstation. They run on the
# CI host (10.1.0.25 by default) inside the caddy-netlify-build:2026 podman
# image, which bundles Node 24, Hugo Extended 0.166.0 and @netlify/build.
# Netlify's own remote builders are never used -- the site is deployed by
# uploading a prebuilt directory, which costs zero build minutes.
#
# See ci/run.sh and ci/Containerfile.
# =============================================================================

CI_HOST  ?= 10.1.0.25
CI_RUN   := ./ci/run.sh
SITE_DIR := site

.DEFAULT_GOAL := help
.PHONY: help build build-ci verify test image shell deploy deploy-prod \
        dev dev-functions dev-all clean lint lint-fix link status \
        functions-install deps

help: ## Show available targets
	@echo "caddy-ed-cadillac-hugo"
	@echo
	@echo "Builds run on $(CI_HOST) inside the caddy-netlify-build:2026 image."
	@echo "Netlify remote builds are disabled by design."
	@echo
	@grep -hE '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
	  | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# --- pipeline (all remote, on CI_HOST) -------------------------------------

build: ## Full production build on the CI host
	$(CI_RUN) build

build-ci: build ## Alias for `build`

verify: ## Build, then assert no page references a missing asset
	$(CI_RUN) verify

test: ## Run the netlify/functions test suite on the CI host
	$(CI_RUN) test

image: ## (Re)build the podman build image on the CI host
	$(CI_RUN) image

shell: ## Interactive shell inside the build container
	$(CI_RUN) shell

# --- deploy (uploads prebuilt output; no build minutes consumed) -----------

deploy: ## Deploy the prebuilt site to a Netlify draft/preview URL
	$(CI_RUN) deploy

deploy-prod: ## Deploy the prebuilt site to production (caddyed.com)
	$(CI_RUN) deploy-prod

link: ## Link this directory to the Netlify site
	netlify link --site 532a7445-ce96-40c1-bebb-b9d14a0d0e10

status: ## Show Netlify build/deploy settings
	netlify status

# --- local development (fast iteration; not the release path) -------------

dev: ## Hugo dev server on :1313
	hugo server --source=$(SITE_DIR) --port 1313 --buildDrafts --buildFuture

dev-functions: ## Netlify dev server for the functions on :8888
	netlify dev --dir=$(SITE_DIR)/public --functions=netlify/functions --port 8888

dev-all: ## Hugo + netlify dev concurrently
	npm-run-all --parallel dev dev-functions

deps: ## Install root + functions dependencies locally
	npm install
	npm --prefix netlify/functions install

functions-install: ## Install netlify/functions dependencies
	npm --prefix netlify/functions install

# --- quality --------------------------------------------------------------

lint: ## ESLint over the front-end and build scripts
	npm run lint

lint-fix: ## ESLint --fix
	npm run lint:fix

# --- housekeeping ---------------------------------------------------------

clean: ## Remove local build artifacts
	rimraf $(SITE_DIR)/public $(SITE_DIR)/resources dist
	@echo "cleaned local build artifacts"
