# CI/CD

## The one rule

**No build ever runs on Netlify.** The site's monthly build allowance is
scarce, and the historical remote builds could never have succeeded anyway
(they ran `yarn build` and published `dist/`, which does not exist).

Deploys happen by uploading an already-built directory:

```bash
netlify deploy --prod --dir=site/public --functions=netlify/functions
```

`--dir` means Netlify receives the finished artifact and never starts a
builder. **Zero build minutes are consumed.**

## Safety rails on the Netlify site

| Setting | Value | Why |
|---|---|---|
| `skip_automatic_builds` | enabled | a `git push` must never start a remote build |
| `stop_builds` | enabled | no in-flight build can complete |
| `configuration_file_path` | `netlify.toml` | the repo config is authoritative, not ad-hoc dashboard values |
| `cmd` | `npm run build` | was `yarn build` |
| `dir` | `site/public` | was `dist` (nonexistent) |
| `functions_dir` | `netlify/functions` | was unset, so 51 functions never deployed |

Check them any time:

```bash
netlify api getSite --data '{"site_id":"532a7445-ce96-40c1-bebb-b9d14a0d0e10"}'
```

## Live preview (no Netlify involved)

To review a build in a browser without spending build minutes or touching
production:

```bash
./ci/preview.sh up       # deploy + serve
./ci/preview.sh logs     # tail the container
./ci/preview.sh down     # stop (artifact is left in place)
```

This relays the **already-verified** `site/public` from the CI host
(`10.1.0.25:/var/tmp/caddy-build/site/public`) to a k3s node and serves it from
an nginx container.

Default target: **`10.1.0.81:8090`** -- VM 999, `k3s-node-81`, which runs under
the `10.1.0.10` Proxmox host. Override with `./ci/preview.sh up <host> <port>`
or the `PREVIEW_HOST` / `PREVIEW_PORT` environment variables.

Two deliberate behaviours:

- **Functions are not included.** It is a static preview. `/.netlify/*` and
  `/health` return an honest JSON explanation rather than a 404, so nobody
  spends time chasing a phantom API outage. Use `make dev-functions`
  (netlify dev) when the API matters.
- **Nothing is built here.** The preview only ever ships output that has
  already passed `ci/verify-build.js`.

> The k3s control plane is at `10.1.0.141:6443` but is not reachable with the
> keys available here: the PVE host's kubeconfig belongs to a different cluster
> (its CA does not match), and k3s agents carry no admin credentials. So the
> preview runs as a plain container on a cluster node rather than as a
> Kubernetes Deployment. A real in-cluster Deployment needs an admin
> kubeconfig for that cluster.

## The CI host

`10.1.0.25` (`cicd-runners`) runs all builds inside the podman image
`caddy-netlify-build:2026`:

- Node 24 LTS + npm 11
- **Hugo 0.166.0 extended** (separate `hugo_extended_*` asset since 0.146)
- `@netlify/build` and `netlify-cli`

The working tree is rsynced to `/var/tmp/caddy-build` and mounted into the
container. `.git` is excluded; derived output (`node_modules`, `site/public`,
`site/resources`, `dist`) is never shipped.

### Rebuilding the image

```bash
./ci/run.sh image
```

Only do this deliberately — a CI run must not mutate the shared host.

### The GitLab runners on that host are NOT used

There are 12 GitLab runners registered on `10.1.0.25`. This pipeline is
GitHub-based (the source is on GitHub) and touches none of them. It does not
register with GitLab, does not modify `/etc/gitlab-runner/config.toml`, and
does not use the runner build cache. Do not "optimise" by pointing this at
those runners.

> **Disk note:** `/var/lib/gitlab-runner` on that host holds ~83 GB (37 GB of
> it active build workspaces). The root filesystem has ~12 GB free. That
> belongs to the GitLab side — reclaiming it is a separate decision for whoever
> owns those runners, not something this pipeline should do unilaterally.

## GitHub Actions

`.github/workflows/ci-cd.yml` runs on every push and PR to `master`.

GitHub-hosted runners are used **only as an orchestrator** — they SSH to
`10.1.0.25` and invoke `ci/run.sh`. No compilation happens on GitHub
infrastructure, so results match the release path exactly.

Jobs:

| Job | Does |
|---|---|
| `preflight` | CI host reachable; image exists; Hugo reports `+extended` |
| `build` | `ci/run.sh verify`, uploads `site/public` as an artifact |
| `test` | `netlify/functions` jest suite |
| `lint` | ESLint 9 flat config |
| `audit` | `npm audit --audit-level=high` on the functions bundle |
| `security` | Trivy (pinned to `0.28.0`, not `@master`) → SARIF |
| `ci-green` | single blocking gate over all of the above |

`.github/workflows/deploy.yml` is the manual production deploy. It requires
typing `deploy` to confirm, refuses a dirty working tree, re-runs the asset
gate against the downloaded artifact, and smoke-tests `caddyed.com`
afterwards.

## Adding a build step

1. Edit `scripts/build-for-netlify.js` (ordered, labelled, fail-fast).
2. If it needs a new tool, add it to `ci/Containerfile` and bump `IMAGE`.
3. Run `./ci/run.sh image && ./ci/run.sh verify` locally before pushing.

Never add a step that reaches Netlify's build API, and never add a version pin
in only one of `.nvmrc` / `.tool-versions` / `netlify.toml` / `ci/Containerfile`.
