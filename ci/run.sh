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
}

do_test() {
  sync_to_ci
  require_image
  log "Running functions test suite on ${CI_HOST}"
  in_container 'cd netlify/functions && npm test -- --ci --watchAll=false'
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
  sync)        sync_to_ci ;;
  *)           sed -n '2,20p' "$0"; exit 1 ;;
esac
