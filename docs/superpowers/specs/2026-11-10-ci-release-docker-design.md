# CI, automated releases and Docker deployment — design

Date: 2026-11-10

## Intent

The server (backend + admin frontend) is to run on an internet host as a
Docker image deployed with docker-compose. At the same time the project
gets a proper pipeline: every push and pull request is tested and
test-built, commit messages follow Conventional Commits, and a release
is cut by one local script that derives the next version from the
commits, refuses to release a red `master`, and tags. The tag builds and
publishes both the Docker image and the terminal (Electron) release.

Why: today there is no Docker image at all, releases are tagged by hand
after bumping four `package.json` files by hand, and nothing runs on a
push except the terminal release on tags. Mistakes in versioning matter
here because terminal and server must run *exactly* the same version or
sync is refused.

## Goals

1. **CI on every push and every pull request** (all branches):
   - Unit tests: backend, frontend, terminal (`vitest run` in each).
   - Type checks / builds: backend `tsc`, frontend `tsc && vite build`,
     terminal `tsc --noEmit` and `electron-vite build`.
   - Docker image build of the server image (built, **not pushed**).
   - E2E tests (Playwright, `e2e/`): Postgres as a service container,
     Electron under a virtual display (xvfb). *(Our call — they run in
     ~10 s and already caught real regressions.)*
   - Commitlint over the commits of the push / pull request.
2. **Conventional Commits enforced**: commitlint with
   `@commitlint/config-conventional`, in CI (as above) and locally via a
   `commit-msg` git hook installed by `npm install` at the repo root
   (e.g. husky). Only new commits are checked; history is not rewritten.
3. **Release script** run locally by the maintainer (`npm run release`):
   1. Refuse unless on `master`, working tree clean, and local `master`
      equals `origin/master` (after a fetch).
   2. Determine the last release tag `v*` (semver tags only — the old
      `tse` tag must be ignored) and the commits since then. Compute the
      next version with Conventional-Commits rules: `fix`/`perf` →
      patch, `feat` → minor, `!` or `BREAKING CHANGE` → major. No
      releasable commit → stop with a message, change nothing.
   3. Find the CI run for the current `origin/master` HEAD commit, wait
      for it to finish (`gh`), and **stop if it failed** or no run
      exists for that commit.
   4. Set the new version in all four `package.json` (root, backend,
      frontend, terminal) and their `package-lock.json`, prepend the
      release section to `CHANGELOG.md`, commit as
      `chore(release): vX.Y.Z`, create annotated tag `vX.Y.Z`.
   5. Push the commit and **only that tag** (`git push origin master
      vX.Y.Z`; never `--tags`, which would publish the private `tse`).
   6. Print where to follow the release run.
4. **Tag `vX.Y.Z` triggers the release workflow**, which publishes both
   at once, no manual gate:
   - Server image to GHCR: `ghcr.io/sebbi08/pos:X.Y.Z` and `:latest`.
   - Terminal: the existing build (Windows + Linux via electron-builder)
     publishing a non-draft GitHub release, as today. Release notes =
     the version's `CHANGELOG.md` section.
   - The existing guards stay: tag must match the `package.json`
     versions, and the tagged commit must be on `master`.
5. **Server Docker image**: a single image containing the backend and
   the built admin frontend. Express serves the frontend's static files
   and falls back to `index.html` for non-`/api` GET requests
   (react-router pages must survive a reload); `/api/*` behaves exactly
   as today. One plain-HTTP port (3001 inside the container).
6. **Deployment compose file** in `deploy/` (`docker-compose.yml` +
   `.env.example` + a short README):
   - Services `app` (the GHCR image) and `postgres` (17-alpine), data in
     a named volume, Postgres not published to the host.
   - `app` waits for a healthy Postgres, `restart: unless-stopped`,
     healthcheck on `/api/health`.
   - `.env`: `ADMIN_PIN` (**required** — compose fails without it, so
     the `0000` default can never reach production), `POSTGRES_PASSWORD`
     (required), host port (default 3001), image tag (default `latest`).

## Non-goals

- TLS / domains: an existing reverse proxy in front of the host does
  HTTPS and forwards plain HTTP to the published port.
- Automatic deployment: the maintainer updates the server by hand
  (`docker compose pull && docker compose up -d`) and makes sure server
  and terminals move together. No pause or gate in the pipeline for it.
- Images for untagged commits (no `:master` / `:sha` tags). *(Our call.)*
- Multi-arch images: `linux/amd64` only. *(Our call — arm64 can be
  added later with buildx/QEMU.)*
- Packaging the terminal installer (electron-builder) on every push;
  CI only bundles it (`electron-vite build`). *(Our call — Windows
  packaging stays on the release run.)*
- Changing the dev setup: the root `docker-compose.yml` (local Postgres
  on 5432) and `start.sh` stay as they are; E2E uses them.

## Anti-goals (would make this a failure even if it "works")

- The release script tags while `master` CI is red or still running.
- `git push --tags` (or anything equivalent) publishing `tse`.
- The four `package.json` versions drifting apart, or the image /
  terminal reporting a version different from the tag.
- The production server starting with the default PIN `0000`.
- Postgres reachable from the internet.

## Constraints and facts

- Repo: public, `github.com/sebbi08/POS`, default branch `master`;
  maintainer pushes directly to `master` (no PR requirement today).
- Existing workflow `.github/workflows/terminal-release.yml` (tag `v*`,
  actions on v7, Node 22) is to be folded into / replaced by the new
  release workflow; its checks keep working.
- Tags: `v0.1.0` (released) and `tse` (private, never push). `master`
  already says `0.2.0` but is untagged. First run of the script: last
  tag `v0.1.0` + `feat` commits since → `0.2.0`, so the bump is a no-op
  on `package.json` and the release is `v0.2.0`. That is expected.
- 130 of the last 137 commit subjects already follow the convention.
- A test guards that all four `package.json` share one version.
- `backend/src/version.ts` reads `../package.json` relative to
  `src/` or `dist/` at runtime — the image must contain the backend's
  `package.json` next to `dist/` for `/api/version` to work.
- Backend config is env-only: `PORT`, `DATABASE_URL`, `ADMIN_PIN`.
  All state is in Postgres; nothing on disk needs a volume
  (`backend/data/receipts` is an unused leftover).
- Frontend calls `/api` on the same origin (Vite proxy in dev).
- The sync endpoint takes large bodies (a whole festival of bookings);
  the deploy README must tell the reverse-proxy operator to allow them.
- E2E gotcha: when `ELECTRON_RUN_AS_NODE=1` is set (e.g. inside a VS
  Code terminal) Electron does not start; CI must not set it.
- GHCR makes a new package private even for a public repo: the README
  explains making the package public once (or `docker login` on the
  server with a read-only token).

## Decided after review (our calls)

- **No half releases.** Terminals auto-download updates, so the release
  workflow first builds the image and the terminal installers, and only
  when *both* builds succeed pushes the image to GHCR and un-drafts the
  GitHub release. Still one tag, no manual gate.
- **Script races.** The CI run for a just-pushed commit may not be listed
  yet: the script retries for a short while before concluding "no run".
  Commit and tag are pushed with `git push --atomic origin master vX.Y.Z`
  so they land together or not at all.
- **Static frontend only in the image.** Express serves the built
  frontend only when a static directory is configured (env var set in
  the image). Dev and E2E keep using Vite unchanged.
- **PIN guard in the image too.** The image sets `NODE_ENV=production`,
  and the backend refuses to start in production without `ADMIN_PIN`,
  so a plain `docker run` cannot fall back to `0000` either.

## Left to the builder

- Tool choice for version calculation and changelog (e.g.
  conventional-recommended-bump + conventional-changelog, or
  commit-and-tag-version), as long as the script steps above hold and
  the waiting-for-CI step happens **before** anything is committed or
  tagged.
- Script language (Node preferred, matches the repo).
- How CI jobs are split and cached; Dockerfile details (multi-stage,
  non-root user, Node 22 base).
- Exact commitlint range logic for push vs. pull_request events.
- Whether the E2E job reuses the root `docker-compose.yml` or a
  `services:` Postgres container (global-setup currently runs
  `docker compose exec postgres …`).
