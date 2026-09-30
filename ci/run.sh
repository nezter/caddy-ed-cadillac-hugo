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
#   ./ci/run.sh lint         ESLint over the tree (in the build image)
#   ./ci/run.sh audit        npm audit --audit-level=high for netlify/functions
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
# Per-session workdir on the CI host.
#
# It used to be a single fixed /var/tmp/caddy-build for everyone. sync_to_ci
# runs `rsync --delete`, so two sessions sharing it delete each other's
# untracked files, and two concurrent builds in it delete each other's
# site/resources mid-build. That is the real cause of the intermittent
#
#     ERROR Failed to publish Resource: file does not exist
#
# which reproduced 0/6 times in an isolated copy of the same tree and 2/3 times
# in the shared one -- a flakiness that looked like a Hugo bug and was not.
REMOTE_WORKDIR="${REMOTE_WORKDIR:-/var/tmp/caddy-build-$(id -u)-$$}"

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

# Every run gets its own REMOTE_WORKDIR so concurrent sessions cannot
# rsync --delete each other out from under a running build. The cost is that
# each one is a full copy of the tree INCLUDING netlify/functions/node_modules --
# about 450 MB.
#
# Nothing cleaned them up. By 2026-09-27 there were 20 of them occupying 12 GB
# of the 17 GB free on the CI host. `df` reported 100% full with 285 MB free on
# the machine that runs 12 GitLab runners, and a `podman pull` there failed with
# ENOSPC. One full disk would have failed every runner on the box, not just this
# project. The 20 directories were then removed by hand, freeing 11.3 GB.
#
# So the per-run workdir is now removed on exit, whatever the outcome.
# CLEANUP=0 opts out. A hand-picked REMOTE_WORKDIR is never auto-removed, because
# it may be the directory ci/preview.sh is serving and deleting that would take a
# live preview down with no obvious cause.
cleanup_workdir() {
  local rc=$?
  case "${REMOTE_WORKDIR:-}" in
    *caddy-build-*|*caddy-*-[0-9]*)
      if [ "${CLEANUP:-1}" = "1" ]; then
        log "Removing per-run workdir ${REMOTE_WORKDIR} on ${CI_HOST}"
        ssh -o ConnectTimeout=8 "${CI_USER}@${CI_HOST}" \
          "rm -rf '${REMOTE_WORKDIR}'" >/dev/null 2>&1 || true
      fi
      ;;
  esac
  return $rc
}
trap cleanup_workdir EXIT INT TERM

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
  # The site shipped a fictional 555 number in the header of every page while
  # config.toml held the correct one, and verify-build passed. This reads the
  # built html, which is the only place a template default, a front-matter
  # override, a JS string and a data file cannot disagree with each other.
  log "Checking for placeholder contact details in the built site"
  # One runner, one report: ci/check-all.js. The individual checks still run on
  # their own, and ci/run.sh names each for a targeted re-run; this is what a
  # build prints so the result is one table instead of eight transcripts.
  log "Running all checks"
  in_container 'node ci/check-all.js'
  # Resolves the front-end module graph: a page whose `scripts:` entry no longer
  # exists loads no JavaScript and the build says nothing, and a new file no
  # entry point reaches is either dead or unmounted by mistake. docs/FRONTEND.md
  # has the four load paths and the history of this report being wrong.
  in_container 'node ci/check-front-end.js'
  # Three forms POSTed to /api/... -- a Gatsby convention with no route on this
  # Hugo site -- and a fourth called a function that was never written. The
  # payloads were correct in every case, so the failure only appeared when a
  # visitor pressed the button. ci/verify-endpoints.js still declares the one
  # real gap; this reads that same declaration rather than a second list.
  log "Checking that every client URL names a real function"
  in_container 'node ci/check-function-endpoints.js'
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
  # Fourth gate: does every function survive bundling AND actually load?
  # `netlify dev` reporting "Loaded function N times" proves esbuild emitted a
  # bundle, not that the bundle RUNS. That difference is exactly where
  # @libsql/client's native binary problem hid for several sessions, with
  # included_files credited with fixing it on the strength of a comment.
# --omit=optional: the platform-native libSQL binaries.
#
# `libsql` declares one optional dependency PER PLATFORM (@libsql/linux-x64-gnu,
# @libsql/linux-x64-musl, and the darwin/arm/win32 equivalents), each carrying a
# ~10 MB .node binary. Nothing here can load them: the database is reached over
# HTTPS at a libsql:// URL, through `@libsql/client/http`, and a local-file native
# binding cannot address it.
#
# They were still being installed, and the Netlify bundler was still shipping
# them -- into all 41 function bundles. Measured: 317 MB of function bundle, with
# 20 MB of it being two binaries no code path could reach. Omitting them takes it
# to 46 MB.
#
# The flag has to be on the install at the REPO ROOT as well as in
# netlify/functions. The bundler resolves a missing module by walking up, so with
# only the functions tree cleaned it found the same two binaries in ./node_modules
# and copied those instead. That is why removing `included_files` from
# netlify.toml changed nothing on its own.
  # Needs netlify/functions/node_modules, so it installs them itself.
  log "Verifying every function bundles and loads"
  in_container 'cd netlify/functions && npm install --omit=dev --omit=optional --no-audit --no-fund >/dev/null 2>&1; cd /site && node ci/verify-functions.js'
  # Self-test for the code-block detector. A gate nobody has ever seen fail is
  # indistinguishable from a gate that cannot fail, which is how the previous
  # "restored the original and it was fine" test produced a green result for a
  # check that had not been exercised.
  log "Self-testing the markup-as-code detector"
  in_container 'node ci/test-code-block-detection.js'
  # The database schema, against the application's own queries.
  #
  # A schema that parses is not a schema the code can use. This regenerates the
  # libSQL schema, applies it to a real SQLite database, and runs statements
  # taken from sales-login, customer-dashboard, sales-customers and
  # followup-analytics. It is the check that found 26 columns the Postgres
  # migrations never created and 78 NOW() calls libSQL cannot run.
  log "Regenerating the Turso schema and running the app's real queries against it"
  in_container 'python3 scripts/pg2turso.py && python3 scripts/schema-audit.py && node ci/test-turso-schema.js'
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
  #
  # The config path and rootDir are both explicit, and both are load-bearing.
  #
  # `npx jest` from netlify/functions does NOT find <repo>/jest.config.js on its
  # own, so it falls back to defaults: testMatch resolves relative to
  # netlify/functions, the real suite at <repo>/tests/ is invisible, jest reports
  # "No tests found", and exits 1. So `./ci/run.sh test` has been running ZERO
  # tests and failing -- which reads exactly like a red suite and is in fact a
  # red harness.
  #
  # Measured 2026-09-27, both ways:
  #   as this command ran it : 0 tests matched
  #   with config + rootDir  : Test Suites 8 failed / 8, Tests 63 failed, 8 passed
  #
  # The 63 failures are entirely pre-existing. Confirmed by stashing every change
  # on this branch and re-running: 63 failed / 8 passed, byte-identical. They are
  # assertion rot plus ESM/CJS transform errors in the calendar suite, catalogued
  # in docs/test-status.md. They are not caused by the storage work, and they are
  # not being hidden by it.
  # The ROOT install is not optional.
  #
  # jest.config.js and babel.config.js both live at the repository root, and the
  # babel transform is configured with rootMode 'upward' so it can reach the
  # ES modules in site/assets/js/. That means babel resolves its presets and
  # plugins from the ROOT node_modules. Installing only netlify/functions leaves
  # babel unable to load its own config and every suite dies with
  # "Cannot find module '@babel/plugin-transform-runtime'" -- zero tests, and a
  # report that says "9 failed" as though the code were broken.
  #
  # The local binary is used rather than `npx jest`, which silently downloads a
  # DIFFERENT jest into its cache whenever the local one is missing. That is how
  # a whole session's test numbers came from a jest this project does not depend
  # on, with its own @babel/core that cannot see these plugins.
  in_container 'npm install --include=dev --omit=optional --no-audit --no-fund >/dev/null 2>&1 && cd netlify/functions && npm install --include=dev --no-audit --no-fund >/dev/null 2>&1 && ./node_modules/.bin/jest --ci --coverage=false --config /site/jest.config.js --rootDir /site/netlify/functions'
}

do_lint() {
  sync_to_ci
  require_image
  log "Running ESLint on ${CI_HOST}"
  # --include=dev: the image sets NODE_ENV=production, and eslint is a dev dep.
  in_container 'npm install --include=dev --no-audit --no-fund >/dev/null 2>&1 && npm run lint'
}

do_audit() {
  sync_to_ci
  require_image
  log "Auditing netlify/functions dependencies on ${CI_HOST}"
  in_container 'cd netlify/functions && npm install --include=dev --no-audit --no-fund >/dev/null 2>&1 && npm audit --audit-level=high'
}

do_deploy() {
  local channel_flag="${1:-}"
  preflight_deploy
  do_build
  log "Uploading PREBUILT site/public to Netlify (no remote build, no build minutes)"
  # --dir uploads an already-built directory, so Netlify never spins up a
  # builder. --functions bundles the serverless functions from source.
  #
  # --site is explicit because the repository is not linked: there is no
  # .netlify/state.json, so without it the CLI has to guess which site this is
  # and the deploy fails -- after the build has already run.
  netlify deploy ${channel_flag} \
    --site="${NETLIFY_SITE_ID:-532a7445-ce96-40c1-bebb-b9d14a0d0e10}" \
    --dir=site/public \
    --functions=netlify/functions \
    --message="ci-run.sh prebuilt upload $(git rev-parse --short HEAD 2>/dev/null || echo local)"
}

# Fail BEFORE the build, not after it. A deploy that builds for two minutes and
# then dies on a missing token has wasted the build and told you nothing new.
preflight_deploy() {
  if [ -z "${NETLIFY_AUTH_TOKEN:-}" ] && [ ! -f "$HOME/.netlify/config.json" ]; then
    log "FATAL: no Netlify credentials"
    log "  A deploy needs one of:"
    log "    NETLIFY_AUTH_TOKEN=<token>    preferred, works in a script"
    log "    an interactive 'netlify login', which a script cannot do"
    log ""
    log "  Token: Netlify UI -> User settings -> Applications -> Personal access"
    log "  tokens -> Generate. It needs deploy rights on the site and nothing else."
    log ""
    log "  Nothing was built and nothing was uploaded."
    exit 1
  fi
  log "Netlify credentials present"
}

case "${1:-build}" in
  build)       do_build ;;
  verify)      do_verify ;;
  test)        do_test ;;
  lint)        do_lint ;;
  audit)       do_audit ;;
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
        bash -lc 'cd netlify/functions && npm install --omit=dev --omit=optional --no-audit --no-fund >/dev/null 2>&1; \
                   cd /site && timeout 120 netlify dev --port 8889 --dir=site/public --functions=netlify/functions 2>&1 \
                   | grep -E \"Loaded function|Failed to load|ERROR\"' || true"
    ;;
  *)           sed -n '2,26p' "$0"; exit 1 ;;
esac
