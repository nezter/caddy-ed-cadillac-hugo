#!/usr/bin/env bash
#
# ci/preview.sh -- serve the prebuilt site on a k3s node for live review.
#
# Pushes the already-verified site/public artifact to a k3s worker/control
# node and serves it from a container, so the site can be reviewed in a browser
# without spending a single Netlify build minute and without touching
# production.
#
# Usage:
#   ./ci/preview.sh up      [host] [port]   # deploy + serve
#   ./ci/preview.sh down    [host] [port]   # stop and remove
#   ./ci/preview.sh logs    [host] [port]
#
# Env:
#   PREVIEW_HOST  default 10.1.0.81   (VM 999, k3s-node-81, under the .10 Proxmox host)
#   PREVIEW_PORT  default 8090
#   CI_HOST       default 10.1.0.25   (where the build artifact lives)
#   REMOTE_WORKDIR default /var/tmp/caddy-build
#
set -euo pipefail

PREVIEW_HOST="${PREVIEW_HOST:-10.1.0.81}"
PREVIEW_PORT="${PREVIEW_PORT:-8090}"
CI_HOST="${CI_HOST:-10.1.0.25}"
REMOTE_WORKDIR="${REMOTE_WORKDIR:-/var/tmp/caddy-build}"

CONTAINER="caddy-preview"
REMOTE_DIR="/var/lib/caddy-preview"
# Minor-version stream (1.31), not a patch pin, so patch updates land without a
# re-pin. Current stable at the time of writing is 1.31.6-alpine.
IMAGE="docker.io/library/nginx:1.31-alpine"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

ACTION="${1:-up}"
HOST="${2:-$PREVIEW_HOST}"
PORT="${3:-$PREVIEW_PORT}"

log()  { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
die()  { printf '\n\033[1;31mFATAL: %s\033[0m\n' "$*" >&2; exit 1; }
# ssh_reachable <host> -- true if we can run a command on it non-interactively
ssh_reachable() { ssh -o ConnectTimeout=8 -o BatchMode=yes "$1" true >/dev/null 2>&1; }

case "$ACTION" in
  up)
    log "Fetching verified artifact from ${CI_HOST}"
    ssh_reachable "$CI_HOST" || die "cannot reach build host $CI_HOST"
    ssh "$CI_HOST" "test -d ${REMOTE_WORKDIR}/site/public" \
      || die "no build on $CI_HOST -- run: ./ci/run.sh build"

    # Relay .25 -> this machine -> .81. 11MB, so a local hop is fine and avoids
    # needing a key on the preview host.
    log "Relaying artifact to ${HOST}"
    STAGE="$(mktemp -d)"
    trap 'rm -rf "$STAGE"' EXIT
    rsync -az --delete "$CI_HOST:${REMOTE_WORKDIR}/site/public/" "$STAGE/"

    log "Uploading to ${HOST}:${REMOTE_DIR}"
    ssh_reachable "$HOST" || die "cannot reach preview host $HOST"
    ssh "$HOST" "sudo mkdir -p ${REMOTE_DIR}"
    rsync -az --delete --rsync-path="sudo rsync" "$STAGE/" "$HOST:${REMOTE_DIR}/"

    # The Netlify functions do not exist in this static preview, so anything
    # under /.netlify/ would 404 noisily. The config answers truthfully
    # instead of pretending the API is broken.
    # The nginx config sets its document root to the in-container mount point,
    # so it needs no substitution -- it is copied verbatim.
    log "Installing site config + function stub"
    ssh "$HOST" "sudo tee ${REMOTE_DIR}/nginx.conf >/dev/null" \
      < "$REPO_DIR/ci/nginx.preview.conf"
    ssh "$HOST" "sudo mkdir -p ${REMOTE_DIR}/.netlify/functions"

    log "Starting container on ${HOST}:${PORT}"
    ssh "$HOST" "sudo podman rm -f ${CONTAINER} >/dev/null 2>&1 || true
                 sudo podman run -d --name ${CONTAINER} --restart unless-stopped \
                   -p ${PORT}:80 \
                   -v ${REMOTE_DIR}:/usr/share/nginx/html:ro,Z \
                   -v ${REMOTE_DIR}/nginx.conf:/etc/nginx/nginx.conf:ro,Z \
                   ${IMAGE} >/dev/null
                 sleep 2
                 sudo podman ps --filter name=${CONTAINER} --format '{{.Names}} {{.Status}} {{.Ports}}'"

    URL="http://${HOST}:${PORT}/"
    log "Verifying"
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$URL" || echo 000)
    echo "    $code  $URL"
    [ "$code" = "200" ] || die "preview did not return 200"

    cat <<EOF

  \033[1;32mPreview is live\033[0m

    URL       : $URL
    Host      : $HOST:$PORT  (VM 999, k3s-node-81, under the .10 Proxmox host)
    Artifact  : $CI_HOST:$REMOTE_WORKDIR/site/public  (post ci/verify-build.js)
    Functions : NOT included -- this is a static preview

  Stop it with:  ./ci/preview.sh down
EOF
    ;;

  down)
    log "Stopping preview on ${HOST}"
    ssh "$HOST" "sudo podman rm -f ${CONTAINER} 2>/dev/null || echo 'container not running'"
    log "done (artifact left at ${REMOTE_DIR})"
    ;;

  logs)
    ssh "$HOST" "sudo podman logs --tail 100 ${CONTAINER}"
    ;;

  *)
    sed -n '2,25p' "$0"
    exit 1
    ;;
esac
