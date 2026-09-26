#!/usr/bin/env bash
#
# Local CI/CD driver for caddy-ed-cadillac-hugo
# ===========================================================================
# All builds run on the 10.1.0.25 CI host inside the caddy-netlify-build:2026
# podman image. Nothing is ever built on this workstation (.88) and NOTHING is
# built on Netlify's remote builders -- the live site is deployed by uploading
# a prebuilt directory, which consumes no Netlify build minutes.
#
#   ./ci/run.sh build        full production build (hugo + functions + verify)
#   ./ci/run.sh functions    boot netlify dev (static site + all 51 functions)
#   ./ci/run.sh fn-bundle    bundle all functions and report failures    bundle the functions, report failures, exit
#   ./ci/run.sh inventory    dry-run the inventory sync (report drift)
#   ./ci/run.sh inventory-write   apply the inventory sync
#   ./ci/run.sh verify       build + assert no broken asset references
#   ./ci/run.sh test         unit + integration tests for netlify/functions
#   ./ci/run.sh shell        interactive shell inside the build container
#   ./ci/run.sh image        (re)build the podman image on .25
#   ./ci/run.sh deploy       upload prebuilt site/public to Netlify
#   ./ci/run.sh deploy-prod  same, but to the production channel
#
set -euo pipefail

CI_HOST="${CI_HOST:-10.1.0.25}"
CI_USER="${CI_USER:-root}"
IMAGE="${IMAGE:-caddy-netlify-build:2026}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Podman on the remote host needs the *remote* path of the repo. We sync the
# working tree to a scratch dir there so we never mutate the real checkout.
REMOTE_WORKDIR="${REMOTE_WORKDIR:-/var/tmp/caddy-build}"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }

# --- rsync the working tree to .25 (excludes heavy/derived paths) -----------
sync_to_ci() {
  log "Syncing working tree -> ${CI_USER}@${CI_HOST}:${REMOTE_WORKDIR}"
  # Build artifacts are derived; never ship them. VCS metadata is kept so the
  # image can report the commit SHA.
  rsync -az --delete \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude 'site/public/' \
    --exclude 'site/resources/' \
    --exclude 'dist/' \
    --exclude '.netlify/' \
    --exclude 'coverage/' \
    --exclude 'test-data/*.tokens.json' \
    --exclude '*.log' \
    "$REPO_DIR/" "${CI_USER}@${CI_HOST}:${REMOTE_WORKDIR}/"
}

require_image() {
  ssh "${CI_USER}@${CI_HOST}" "podman image exists ${IMAGE}" 2>/dev/null \
    || die "Build image ${IMAGE} not present on ${CI_HOST}. Run: ./ci/run.sh image"
}

# --- run a command inside the build container on .25 ------------------------
in_container() {
  local inner="$1"
  ssh "${CI_USER}@${CI_HOST}" "podman run --rm \
      --network=host \
      -v ${REMOTE_WORKDIR}:/site:Z \
      -w /site \
      -e CI=true \
      -e NETLIFY_TELEMETRY_DISABLED=1 \
      -e HUGO_BASEURL="${HUGO_BASEURL:-https://caddyed.com/}" \
      -e JWT_SECRET="${JWT_SECRET:-}" \
      --user root \
      ${IMAGE} bash -lc $(printf '%q' "$inner")"
}

build_image() {
  log "Building ${IMAGE} on ${CI_HOST}"
  ssh "${CI_USER}@${CI_HOST}" "podman build \
      -t ${IMAGE} \
      -f ${REMOTE_WORKDIR}/ci/Containerfile \
      ${REMOTE_WORKDIR}"
  log "Verifying image toolchain"
  ssh "${CI_USER}@${CI_HOST}" "podman run --rm ${IMAGE}"
}

do_build() {
  sync_to_ci
  require_image
  log "Running production build on ${CI_HOST}"
  in_container 'npm run build:production'
}

do_verify() {
  do_build
  log "Verifying build output has no dangling asset references"
  in_container 'node ci/verify-build.js'
  # Source-tree check. Runs before the output check would have any chance of
  # passing anyway, because the failure it catches (starter-template demo
  # content, e.g. the Kaldi Coffee pricing page) produces a perfectly valid
  # build. Order is deliberate: fail on the real problem first.
  log "Verifying source content is not starter-template filler"
  in_container 'node ci/verify-content.js --strict'
  # Third gate: do the live bundles call endpoints that exist? Runs against
  # the publish dir, so it must come after the build.
  log "Verifying every endpoint called by a live bundle resolves"
  in_container 'node ci/verify-endpoints.js'
}

do_inventory() {
  sync_to_ci
  require_image
  log "Checking inventory feed on ${CI_HOST}"
  # Read-only unless --write. Reports what the feed contains and whether the
  # committed content matches it, so drift is visible without a deploy.
  in_container 'node scripts/inventory/index.js --dry-run ${INVENTORY_ARGS:-}'
}

do_inventory_write() {
  sync_to_ci
  require_image
  log "Applying inventory feed on ${CI_HOST}"
  in_container 'node scripts/inventory/index.js ${INVENTORY_ARGS:-}'
}

do_inventory_validate() {
  sync_to_ci
  require_image
  in_container 'node scripts/inventory/index.js --validate'
}

do_test() {
  sync_to_ci
  require_image
  log "Running functions test suite on ${CI_HOST}"
  # The image sets NODE_ENV=production, so a plain `npm install` omits dev deps
  # and jest/supertest are absent. --include=dev is required here.
  in_container 'cd netlify/functions && npm install --include=dev --no-audit --no-fund && npx jest --ci --watchAll=false'
}

do_deploy() {
  local channel_flag="${1:-}"
  do_build
  log "Uploading PREBUILT site/public to Netlify (no remote build, no build minutes)"
  # --dir uploads an already-built directory, so Netlify never spins up a
  # builder. --functions bundles the serverless functions from source.
  netlify deploy ${channel_flag} \
    --dir=site/public \
    --functions=netlify/functions \
    --message="ci-run.sh prebuilt upload $(git rev-parse --short HEAD 2>/dev/null || echo local)"
}

case "${1:-build}" in
  build)       do_build ;;
  verify)      do_verify ;;
  test)        do_test ;;
  shell)       sync_to_ci; require_image; in_container 'bash' ;;
  image)       sync_to_ci; build_image ;;
  deploy)      do_deploy "" ;;
  deploy-prod) do_deploy "--prod" ;;
  inventory)        do_inventory ;;
  inventory-write)  do_inventory_write ;;
  inventory-check)  do_inventory_validate ;;
  sync)             sync_to_ci ;;
  functions)
    # Boot `netlify dev` on the CI host: the static site AND every function.
    # This is how the admin area gets exercised end to end.
    #
    # JWT_SECRET is passed through by in_container. Without it every protected
    # function answers 500 "Server is misconfigured" rather than 401, so a
    # signed-out staff member would be told the server is broken instead of
    # being invited to sign in -- which is the exact failure the admin error
    # states exist to avoid. Export a real value before running this; the
    # dev-only fallback below keeps the command usable out of the box.
    if [ -z "${JWT_SECRET:-}" ]; then
      export JWT_SECRET="dev-only-not-a-real-secret-$(date +%s)"
      log "JWT_SECRET was unset -- using a throwaway dev value. Never do this for a deploy."
    fi
    sync_to_ci
    require_image
    log "Booting netlify dev on ${CI_HOST} (functions + static site)"
    in_container "netlify dev --port 8888 --dir=site/public --functions=netlify/functions"
    ;;
  fn-bundle)   # bundle the functions and report failures, then exit
    sync_to_ci
    require_image
    log "Bundling functions on ${CI_HOST} (no server left running)"
    ssh "${CI_USER}@${CI_HOST}" "podman run --rm --network=host \
        -v ${REMOTE_WORKDIR}:/site:Z -w /site -e CI=true \
        -e NETLIFY_TELEMETRY_DISABLED=1 ${IMAGE} \
        bash -lc 'cd netlify/functions && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1; \
                   cd /site && timeout 120 netlify dev --port 8889 --dir=site/public --functions=netlify/functions 2>&1 \
                   | grep -E \"Loaded function|Failed to load|ERROR\"' || true"
    ;;
  *)           sed -n '2,26p' "$0"; exit 1 ;;
esac
