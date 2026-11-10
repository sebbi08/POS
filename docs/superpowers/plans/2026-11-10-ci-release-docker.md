# CI, Automated Releases and Docker Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Test and test-build every push/PR, enforce Conventional Commits, cut releases with one local script, and let the `vX.Y.Z` tag publish a server Docker image (GHCR) plus the terminal release, deployable with docker-compose.

**Architecture:** One CI workflow (`ci.yml`) for push/PR; one release workflow (`release.yml`, replaces `terminal-release.yml`) on `v*` tags that builds image + installers first and publishes only when both succeed. The server image is a single Node container: Express serves `/api` and, when `STATIC_DIR` is set, the built admin frontend. The release script is plain Node (no release dependencies) with its pure logic in tested modules.

**Tech Stack:** Node 22, Express 5, Vitest, Playwright (+ Electron), Docker (multi-stage, `node:22-alpine`), GitHub Actions, GHCR, commitlint + husky, `gh` CLI, `node:test` for the release modules.

**Spec:** `docs/superpowers/specs/2026-11-10-ci-release-docker-design.md`

## Global Constraints

- Work on branch `ci/release-pipeline`; first commit contains the spec and this plan.
- Node 22 everywhere (CI, Dockerfile base `node:22-alpine`); existing actions stay on `actions/checkout@v7`, `actions/setup-node@v7`.
- Image name `ghcr.io/sebbi08/pos`; tags `X.Y.Z` and `latest`; platform `linux/amd64` only; no image for untagged commits.
- Container listens on plain HTTP port `3001`; env `PORT`, `DATABASE_URL`, `ADMIN_PIN`, `STATIC_DIR`, `NODE_ENV=production`.
- Never `git push --tags`; the tag `tse` must never be pushed or considered a release tag. Release tags match `^v\d+\.\d+\.\d+$`.
- The four `package.json` (root, `backend/`, `frontend/`, `terminal/`) always share one version.
- Bump rules: `fix`/`perf` → patch, `feat` → minor, `!` after type/scope or `BREAKING CHANGE:` in body → major; anything else → no release.
- Release commit subject: `chore(release): vX.Y.Z`; annotated tag `vX.Y.Z`; push with `git push --atomic origin master vX.Y.Z`.
- Root `docker-compose.yml` and `start.sh` stay unchanged.
- Commit messages in this branch follow Conventional Commits.

## Review Focus

- **Version test after a bump:** `backend/src/__tests__/version.test.ts` hard-codes `"0.2.0"`; the first release bump to anything else would turn CI red. → Task 1 makes it version-agnostic.
- **Unknown `/api/*` path with the SPA fallback active:** must stay a 404, never `index.html` (tills parse JSON). → Task 1 test `unknown /api path is 404, not the page`.
- **Release tags mixed with `tse` and non-semver tags:** latest release tag must be the highest semver `v*`, not the newest tag. → Task 4 test `latestReleaseTag ignores tse and non-semver tags`.
- **CI run not yet listed for a just-pushed commit / run still queued:** script must retry, then wait, never tag early. → Task 4 test `findRun retries until the run appears`.
- **Electron in CI on Ubuntu 24.04:** AppArmor blocks Chromium's sandbox (unprivileged user namespaces) → Electron dies at launch. → Task 3 E2E job sets `kernel.apparmor_restrict_unprivileged_userns=0` before running.

---

### Task 1: Backend serves the admin frontend and guards the PIN in production

**Files:**
- Create: `backend/src/static.ts`, `backend/src/__tests__/static.test.ts`, `backend/src/__tests__/config.test.ts`
- Modify: `backend/src/config.ts`, `backend/src/index.ts`, `backend/src/__tests__/version.test.ts`

**Interfaces:**
- Produces: `mountFrontend(app: express.Express, dir: string | undefined): void` — no-op when `dir` is undefined; else `express.static(dir)` plus a GET fallback that sends `dir/index.html` for every path not starting with `/api`. Must be called after all `/api` routes.
- Produces: `assertProductionConfig(env: NodeJS.ProcessEnv): void` in `config.ts` — throws `Error("ADMIN_PIN must be set in production")` when `env.NODE_ENV === "production"` and `env.ADMIN_PIN` is empty/unset.
- Produces: `config.staticDir: string | undefined` from `process.env.STATIC_DIR`.

- [ ] **Step 1: Create branch and commit spec + plan**

```bash
git switch -c ci/release-pipeline
git add docs/superpowers/specs/2026-11-10-ci-release-docker-design.md docs/superpowers/plans/2026-11-10-ci-release-docker.md
git commit -m "docs: design and plan for CI, releases and Docker deployment"
```

- [ ] **Step 2: Write failing tests**

`static.test.ts` (tmp dir via `mkdtempSync` with `index.html` = `<p>admin</p>` and `assets/app.js` = `console.log(1)`; app = express + `app.get("/api/health", …json({status:"ok"}))` + `mountFrontend(app, dir)`):
- `serves index.html at /` → 200, text contains `<p>admin</p>`
- `serves static assets` → `GET /assets/app.js` 200, body `console.log(1)`
- `deep admin routes fall back to index.html` → `GET /reporting/2026` 200, contains `<p>admin</p>`
- `api routes still win` → `GET /api/health` body `{status:"ok"}`
- `unknown /api path is 404, not the page` → `GET /api/nope` 404, text does not contain `<p>admin</p>`
- `without a dir nothing is served` → `mountFrontend(app, undefined)`; `GET /` 404

`config.test.ts`:
- `production without ADMIN_PIN throws` → `assertProductionConfig({ NODE_ENV: "production" })` throws `/ADMIN_PIN/`
- `production with empty ADMIN_PIN throws` → `{ NODE_ENV: "production", ADMIN_PIN: "" }` throws
- `production with ADMIN_PIN is fine`, `development without ADMIN_PIN is fine` (dev keeps the `0000` fallback)

`version.test.ts`: replace the literal `"0.2.0"` in both tests — first test asserts `new Set(versions).size === 1`; second asserts `res.body` equals `{ version: <backend/package.json version read in the test> }`.

- [ ] **Step 3: Run, expect FAIL** — `cd backend && npx vitest run src/__tests__/static.test.ts src/__tests__/config.test.ts` → module/export not found.

- [ ] **Step 4: Implement** `static.ts`, `assertProductionConfig` + `staticDir` in `config.ts`; in `index.ts` call `assertProductionConfig(process.env)` before anything else and `mountFrontend(app, config.staticDir)` after the last `app.use("/api/…")`. Use Express 5 path syntax for the fallback (`app.get(/^(?!\/api(\/|$)).*/, …)` or a `/{*splat}` handler that calls `next()` for `/api`).

- [ ] **Step 5: Run, expect PASS** — `cd backend && npx vitest run && npx tsc --noEmit`

- [ ] **Step 6: Commit** — `feat(backend): serve the admin frontend and require ADMIN_PIN in production`

---

### Task 2: Dockerfile and deploy compose

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `deploy/docker-compose.yml`, `deploy/.env.example`, `deploy/README.md`

**Interfaces:**
- Consumes: Task 1 env vars (`STATIC_DIR`, `NODE_ENV`).
- Produces: `docker build -t ghcr.io/sebbi08/pos:dev .` from repo root (used by CI and release).

- [ ] **Step 1: Dockerfile** — multi-stage. Build stage: `npm ci` + `npm run build` in `backend/` and `frontend/`. Runtime stage: `WORKDIR /app/backend`; copy `backend/package.json`, `backend/package-lock.json`, `npm ci --omit=dev`; copy `backend/dist` → `./dist`, `frontend/dist` → `/app/public`; `ENV NODE_ENV=production STATIC_DIR=/app/public PORT=3001`; `USER node`; `EXPOSE 3001`; `CMD ["node","dist/index.js"]`. (`version.ts` reads `/app/backend/package.json`.) `.dockerignore`: `**/node_modules`, `**/dist`, `terminal`, `e2e`, `.git`, `test-results`, `playwright-report`, `docs`, `.superpowers`.

- [ ] **Step 2: deploy files** — `deploy/docker-compose.yml`: service `postgres` (`postgres:17-alpine`, `POSTGRES_USER=pos`, `POSTGRES_DB=pos`, `POSTGRES_PASSWORD=${POSTGRES_PASSWORD:?set POSTGRES_PASSWORD in .env}`, named volume `pg-data:/var/lib/postgresql/data`, healthcheck `pg_isready -U pos`, **no** `ports`); service `app` (`image: ghcr.io/sebbi08/pos:${POS_TAG:-latest}`, `ports: "${POS_PORT:-3001}:3001"`, `DATABASE_URL=postgresql://pos:${POSTGRES_PASSWORD}@postgres:5432/pos`, `ADMIN_PIN=${ADMIN_PIN:?set ADMIN_PIN in .env}`, `depends_on: postgres: condition: service_healthy`, healthcheck `wget -qO- http://127.0.0.1:3001/api/health`); both `restart: unless-stopped`. `.env.example` lists `ADMIN_PIN`, `POSTGRES_PASSWORD`, `POS_PORT=3001`, `POS_TAG=latest`. README: first setup, update (`docker compose pull && docker compose up -d`), pinning `POS_TAG`, reverse proxy must forward plain HTTP and allow ≥10 MB request bodies (sync), making the GHCR package public once (or `docker login ghcr.io` with a `read:packages` token), backup hint (`docker compose exec postgres pg_dump -U pos pos`).

- [ ] **Step 3: Verify locally**

```bash
docker build -t ghcr.io/sebbi08/pos:dev .
cd deploy && printf 'ADMIN_PIN=4711\nPOSTGRES_PASSWORD=secret\nPOS_PORT=3090\nPOS_TAG=dev\n' > .env
docker compose -p pos-deploy-test up -d --wait
curl -s localhost:3090/api/health      # {"status":"ok"}
curl -s localhost:3090/api/version     # {"version":"0.2.0"}
curl -s localhost:3090/reporting | grep -c '<div id="root">'   # 1
docker compose -p pos-deploy-test down -v && rm .env
ADMIN_PIN= POSTGRES_PASSWORD=x docker compose -p pos-deploy-test config   # fails: set ADMIN_PIN
docker run --rm -e DATABASE_URL=postgresql://x@127.0.0.1/x ghcr.io/sebbi08/pos:dev   # exits: ADMIN_PIN must be set in production
```

Add `deploy/.env` to `.gitignore`.

- [ ] **Step 4: Commit** — `build: server Docker image and deploy compose`

---

### Task 3: Commitlint and CI workflow

**Files:**
- Create: `commitlint.config.mjs`, `.husky/commit-msg`, `.github/workflows/ci.yml`
- Modify: root `package.json` (+ lock)

**Interfaces:**
- Produces: workflow file name `ci.yml`, name `CI` — the release script looks runs up by `--workflow ci.yml`.

- [ ] **Step 1: Commitlint** — root devDeps `@commitlint/cli`, `@commitlint/config-conventional`, `husky`; script `"prepare": "husky"`; config extends `@commitlint/config-conventional` with `"subject-case": [0]` (German nouns like „Vollbild“ are capitalised). `.husky/commit-msg`: `npx --no -- commitlint --edit "$1"`.

- [ ] **Step 2: Verify** — `echo "added stuff" | npx commitlint` exits 1; `echo "feat(terminal): Vollbild button" | npx commitlint` exits 0; `npx commitlint --from v0.1.0 --to HEAD` exits 0 (if older history fails, CI only checks new ranges — record the result).

- [ ] **Step 3: `ci.yml`** — `on: push` (all branches, `tags-ignore: ['**']`) and `pull_request`. Jobs, all `ubuntu-latest`, Node 22 with npm cache:
  - `commitlint`: checkout `fetch-depth: 0`, root `npm ci`; PR → `--from base.sha --to head.sha`; push → `--from github.event.before --to github.sha`, but when `before` is all zeros (new branch) use `--from origin/master`.
  - `unit`: `npm ci` in root/backend/frontend/terminal; `npm test` (root script); `node --test scripts/`; `cd backend && npx tsc --noEmit`; `cd frontend && npm run build`; `cd terminal && npx tsc --noEmit && npx electron-vite build`.
  - `docker`: `docker build .` (no push).
  - `e2e`: `npm ci` in all four; `docker compose up -d postgres` + wait loop on `docker compose exec -T postgres pg_isready -U pos`; `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`; `npx playwright install --with-deps chromium`; `xvfb-run -a npx playwright test`; upload `test-results/` as artifact on failure.

- [ ] **Step 4: Lint the workflow** — `docker run --rm -v "$PWD":/repo -w /repo rhysd/actionlint:latest -color` → no findings.

- [ ] **Step 5: Commit** — `ci: test, build and lint commits on every push and pull request`

- [ ] **Step 6: Verify on GitHub** — after the user OKs pushing the branch: `git push -u origin ci/release-pipeline`; `gh run watch --exit-status $(gh run list --branch ci/release-pipeline --workflow ci.yml -L1 --json databaseId -q '.[0].databaseId')` → all four jobs green. Fix and re-push until green.

---

### Task 4: Release script

**Files:**
- Create: `scripts/release/conventional.mjs`, `scripts/release/conventional.test.mjs`, `scripts/release/ci-wait.mjs`, `scripts/release/ci-wait.test.mjs`, `scripts/release/release.mjs`
- Modify: root `package.json` (`"release": "node scripts/release/release.mjs"`, root `test` script appends `&& node --test scripts/`)

**Interfaces:**
- Produces (`conventional.mjs`):
  - `latestReleaseTag(tags: string[]): string | null` — highest semver among `^v\d+\.\d+\.\d+$`.
  - `bumpType(commits: {subject: string, body: string}[]): "major" | "minor" | "patch" | null`
  - `nextVersion(current: string, bump: "major"|"minor"|"patch"): string`
  - `changelogSection(version: string, date: string, commits: {subject, body, hash}[]): string` — `## vX.Y.Z (YYYY-MM-DD)`, then `### Breaking Changes`, `### Features`, `### Bug Fixes` (only non-empty groups; `perf` under Bug Fixes), one bullet per commit `- scope: subject (shorthash)`.
  - `extractSection(changelog: string, version: string): string | null` — text of that version's section (used by `release.yml`).
- Produces (`ci-wait.mjs`): `findRun(listRuns: () => Promise<Run[]>, { attempts: number, delayMs: number, sleep }): Promise<Run | null>` with `Run = { databaseId: number, status: string, conclusion: string }`.
- `release.mjs` CLI: `node scripts/release/release.mjs [--dry-run]`; `node scripts/release/release.mjs notes vX.Y.Z` prints `extractSection(CHANGELOG.md, …)`.

- [ ] **Step 1: Write failing tests (`node:test` + `node:assert/strict`)**
  - `latestReleaseTag ignores tse and non-semver tags` → `["tse","v0.1.0","v0.10.0","v0.9.1","v1.0.0-rc1","release"]` → `"v0.10.0"`
  - `bumpType`: `[fix]`→patch; `[perf]`→patch; `[fix, feat]`→minor; `[feat(x)!: …]`→major; `[fix]` with body `BREAKING CHANGE: y`→major; `[docs, test, chore]`→null; `[chore(release): v0.1.0]`→null
  - `nextVersion`: `0.1.0`+minor→`0.2.0`; `0.2.3`+patch→`0.2.4`; `0.2.3`+major→`1.0.0`; `1.4.2`+minor→`1.5.0`
  - `changelogSection` for `feat(terminal): touch keypad` (hash `20d4be4…`) and `fix: x` → exact expected string with `### Features` before `### Bug Fixes`, `docs:` commits omitted
  - `extractSection` returns only the requested section from a two-section changelog; `null` for a missing version
  - `findRun retries until the run appears` → list returns `[]`, `[]`, then `[run]` → resolves `run`, `sleep` called twice; `findRun gives up` → always `[]` with `attempts: 3` → `null`

- [ ] **Step 2: Run, expect FAIL** — `node --test scripts/` → modules not found.

- [ ] **Step 3: Implement** the two modules (pure; `findRun` takes injected `sleep`).

- [ ] **Step 4: Run, expect PASS** — `node --test scripts/`

- [ ] **Step 5: Implement `release.mjs`** — steps in this order, each via `execFileSync`; abort with a clear message on any failure, changing nothing before step 5:
  1. `git fetch origin --tags --prune`; require branch `master`, clean `git status --porcelain`, `git rev-parse HEAD` == `git rev-parse origin/master`.
  2. Tags from `git tag --list 'v*'` → `latestReleaseTag`; commits `git log <tag>..HEAD --format=%H%x1f%s%x1f%b%x1e`; `bumpType` null → print "Nothing to release" and exit 0.
  3. Version = `nextVersion(<tag without v>, bump)`; print version + `changelogSection`; `--dry-run` stops here.
  4. CI gate: `findRun(() => gh run list --workflow ci.yml --commit <HEAD sha> --json databaseId,status,conclusion, {attempts: 12, delayMs: 5000})`; `null` → abort "no CI run for <sha>"; else `gh run watch <id> --exit-status` (non-zero → abort "CI failed on master").
  5. `npm version <v> --no-git-tag-version --allow-same-version` in root, `backend`, `frontend`, `terminal`; prepend section to `CHANGELOG.md` (create with `# Changelog` header if missing); `git add` the 8 package files + `CHANGELOG.md`; `git commit -m "chore(release): v<v>"`; `git tag -a v<v> -m "v<v>"`.
  6. `git push --atomic origin master v<v>`; print `gh run list --workflow release.yml -L1` hint.

- [ ] **Step 6: Verify** — `npm run release -- --dry-run` on the branch tip prints `0.2.0` and a Features section listing the keypad/fullscreen commits, and changes nothing (`git status` clean). Run the real path against a throwaway clone with a local bare remote and a stubbed `gh` on `PATH` (prints a successful run JSON / exits 0 for `watch`): commit + tag land in the bare remote, `tse` (create it in the clone) does not.

- [ ] **Step 7: Commit** — `feat(release): release script with conventional version bump and CI gate`

---

### Task 5: Release workflow

**Files:**
- Create: `.github/workflows/release.yml`
- Delete: `.github/workflows/terminal-release.yml`

**Interfaces:**
- Consumes: Dockerfile (Task 2), `node scripts/release/release.mjs notes <tag>` (Task 4).

- [ ] **Step 1: `release.yml`** — `on: push: tags: ['v*']`; `permissions: contents: write, packages: write`. Jobs:
  - `verify`: the two existing guards from `terminal-release.yml` (tag == terminal and backend `package.json` version; tagged commit is ancestor of `origin/master`); create the draft release (as today) with notes from `release.mjs notes $GITHUB_REF_NAME`.
  - `terminal` (needs verify, matrix windows/ubuntu): as today — `npm ci`, `electron-vite build`, `electron-builder --publish always` (uploads into the **draft**, invisible to auto-update).
  - `image` (needs verify): `docker/setup-buildx-action`, `docker/build-push-action` with `push: false`, `platforms: linux/amd64`, `cache-to: type=gha,mode=max`.
  - `publish` (needs terminal + image): `docker/login-action` to `ghcr.io` with `GITHUB_TOKEN`; `docker/build-push-action` `push: true`, `cache-from: type=gha`, tags `ghcr.io/sebbi08/pos:${version}` and `:latest`; then `gh release edit "$GITHUB_REF_NAME" --draft=false`. Image push first, un-draft last.
  Use the current major versions of the docker actions (`gh api repos/docker/build-push-action/releases/latest -q .tag_name` etc.).

- [ ] **Step 2: Lint** — actionlint as in Task 3 → no findings.

- [ ] **Step 3: Commit** — `ci: tag builds and publishes the server image and the terminal together`

---

### Task 6: Finish

- [ ] **Step 1:** Full local verification: `npm test`, `node --test scripts/`, `env -u ELECTRON_RUN_AS_NODE npx playwright test`, CI on the branch green.
- [ ] **Step 2:** Hand over to superpowers:finishing-a-development-branch (merge to `master`). The first real release (`npm run release`) is the user's call after merge; it will produce `v0.2.0`.
