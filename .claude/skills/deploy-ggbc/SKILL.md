---
name: deploy-ggbc
description: "Push, merge, and deploy Good Girls Bot Club (sillytavern-mobile) to the production droplet. Use this skill whenever the user says /deploy-ggbc, asks to 'deploy ggbc', 'push and deploy', 'update the droplet', 'ship it', or wants to merge branches and update the live server. Also trigger when the user finishes a GGBC feature and wants to get it running on the server."
---

# Deploy Good Girls Bot Club to Production

Push feature branches, merge them, wait for each repo's Docker image CI to finish, then update the live droplet with a pull-only deploy.

Both the frontend and backend images are built in GitHub Actions and pulled from GHCR. **The droplet never builds — it just `docker compose pull`s and restarts.** Deploys should take under a minute once CI is green.

## Repos

| Repo | Local path | Remote | Merge target | Image tag | CI workflow |
|------|-----------|--------|-------------|-----------|-------------|
| sillytavern-mobile (frontend) | `/Users/sammy/Documents/GitHub/sillytavern-mobile` | `sammygallo/sillytavern-mobile` | `main` | `ghcr.io/sammygallo/sillytavern-mobile:latest` | `.github/workflows/docker-publish.yml` |
| SillyTavern (backend) | `/Users/sammy/Documents/GitHub/SillyTavern` | `sammygallo/SillyTavern` | `feat/role-based-permissions` | `ghcr.io/sammygallo/sillytavern:feat-role-based-permissions` | `.github/workflows/docker-publish.yml` |

## Droplet

- **Host:** `159.89.180.146` (DigitalOcean `s-1vcpu-1gb`, 2 GB swap)
- **User:** `root`
- **App dir:** `/opt/sillytavern-mobile`
- **Connect:** `ssh root@159.89.180.146`
- **Public URL:** fronted by a reverse proxy; the frontend container binds to `127.0.0.1:8080` internally

## Environment gotchas — READ THIS BEFORE DEBUGGING

These are non-obvious things about the production environment that will bite you if you don't know them:

### 1. Droplet has a `docker-compose.override.yml`

At `/opt/sillytavern-mobile/docker-compose.override.yml` there's a host-specific override that pins the frontend port to `127.0.0.1:8080:80` (instead of the repo default `${PORT:-80}:80`). This file is **gitignored** and **must not be deleted or committed**. It's why the frontend isn't directly exposed to the internet — the reverse proxy in front of the droplet forwards to `127.0.0.1:8080`.

If you see unexpected port behavior, `ssh root@159.89.180.146 "cat /opt/sillytavern-mobile/docker-compose.override.yml"` to check it. If it's missing, recreate it with:

```yaml
services:
  frontend:
    ports: !override
      - "127.0.0.1:8080:80"
```

The `!override` tag is critical — without it, compose *merges* the ports lists and tries to bind both 80 and 8080, causing a port-in-use error.

### 2. `seed-owner` is a one-shot init container — it's NOT always running

There are THREE containers, not two:
- `sillytavern-mobile-frontend-1` — always running (nginx + Vite build)
- `sillytavern-mobile-sillytavern-1` — always running (ST backend)
- `sillytavern-mobile-seed-owner-1` — **runs once at startup to seed the owner user, then exits**

A successful `docker ps` check will show only the first two as currently "Up" after some time — that is correct. The seed-owner has `restart: "no"` so it doesn't come back. Don't report it as "missing" — check `docker ps -a` if you need to verify it ran at all.

### 3. Building the frontend on the droplet is the OLD way and must never happen again

The droplet is a 1 vCPU / 1 GB box. Running `vite build` on it takes 12+ minutes and thrashes the memory budget. The skill's deploy command must **never** use `docker compose up --build`. It must always be `docker compose pull && docker compose up -d`. The image is built in GitHub Actions and pulled from GHCR.

## Arguments

The skill accepts optional branch names as arguments:

```
/deploy-ggbc                                          # auto-detect branches
/deploy-ggbc claude/some-branch                       # frontend only
/deploy-ggbc - feat/some-branch                       # backend only (dash = skip frontend)
/deploy-ggbc claude/some-branch feat/some-branch      # both repos
```

If invoked with no args and there are no branches ahead of `main`/`feat/role-based-permissions`, interpret it as "sync the droplet with whatever is currently on the deployment branches" — skip the merge steps and go straight to step 5.

## Workflow

### 0. Always start with a fetch

Before ANY branch inspection, merge, or PR operation, fetch both repos. Stale `origin/main` state has caused failed deploys in the past.

```bash
cd /Users/sammy/Documents/GitHub/sillytavern-mobile && git fetch origin
cd /Users/sammy/Documents/GitHub/SillyTavern && git fetch origin
```

### 1. Determine what to deploy

If branch args were provided, use them. Otherwise, detect:

```bash
# Frontend: check for commits ahead of main on the current branch
cd /Users/sammy/Documents/GitHub/sillytavern-mobile
git log --oneline origin/main..HEAD  # if on a feature branch

# Backend: check for commits ahead of feat/role-based-permissions
cd /Users/sammy/Documents/GitHub/SillyTavern
git log --oneline origin/feat/role-based-permissions..HEAD
```

Confirm with the user what you're about to merge before proceeding. If a repo has no changes, skip it.

#### Frontend: verify the build locally before pushing

**Do NOT rely on `tsc --noEmit` alone.** The Dockerfile runs `npm run build` → `tsc -b && vite build`, which uses `tsconfig.app.json` with stricter project-reference settings than the root `tsconfig.json`. Errors like zustand hook overloads resolving to `unknown`, or narrowed-union comparisons, will pass `tsc --noEmit` but fail `tsc -b`. Always run the **same thing CI will run** locally first:

```bash
cd /Users/sammy/Documents/GitHub/sillytavern-mobile
npm run build  # runs tsc -b && vite build — matches the Dockerfile
```

If `npm run build` is green, the Docker CI build will be green. This is a two-minute local check that saves a ~3-minute round-trip of push → CI fail → fix → push → CI again. **Incurred on 2026-04-15 during the AI settings catalog deploy — two TS errors slipped past `tsc --noEmit` and failed in CI.**

The backend repo doesn't have the equivalent split; its build is the standard SillyTavern tree.

### 2. Merge — preferred path: `gh pr merge`

For any branch that has an open PR, just merge it:

```bash
# Frontend
gh pr merge <pr-number> --repo sammygallo/sillytavern-mobile --merge --admin

# Backend
gh pr merge <pr-number> --repo sammygallo/SillyTavern --merge --admin
```

No local checkout required, no worktree hunting, and GitHub handles any fast-forward edge cases. The `--admin` flag bypasses any branch protection that might block direct merges.

If there's no PR yet, open one first:

```bash
cd /Users/sammy/Documents/GitHub/sillytavern-mobile
git push origin <branch-name>
gh pr create --base main --head <branch-name> --title "..." --body "..."
gh pr merge <new-pr-number> --repo sammygallo/sillytavern-mobile --merge --admin
```

#### Fallback: local merge

Only use this if `gh pr merge` isn't available or the branch has no PR and you can't create one:

```bash
cd /Users/sammy/Documents/GitHub/sillytavern-mobile
git push origin <branch-name>
# Find where main is checked out (may be a worktree) — git branch -v
git checkout main
git merge <branch-name> --no-edit
git push origin main
```

### 3. Wait for CI

Both repos build images in GitHub Actions. The droplet only pulls — it never builds — so you must wait for each repo whose code you pushed.

Get the run ID and watch it in one flow:

```bash
# Frontend
FE_RUN=$(gh run list --repo sammygallo/sillytavern-mobile --workflow docker-publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $FE_RUN --repo sammygallo/sillytavern-mobile --exit-status

# Backend
BE_RUN=$(gh run list --repo sammygallo/SillyTavern --workflow docker-publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')
gh run watch $BE_RUN --repo sammygallo/SillyTavern --exit-status
```

Typical durations:
- **Frontend CI:** ~1.5-3 minutes (Vite build on GitHub runner with GHA cache)
- **Backend CI:** ~5-8 minutes (full SillyTavern Docker build)

Use `run_in_background: true` on the Bash call if you want to keep working in parallel — you'll get a task-notification when it completes.

#### ⚠️ `gh run watch --exit-status` can be silently swallowed by pipes

If you pipe `gh run watch` through `tail`, `head`, or similar (which is tempting for log truncation), **the pipe's exit code (0) masks gh's non-zero exit code**. The background task will report success even though CI failed, and you'll only discover the failure if you actually read the output. Two ways to avoid this:

```bash
# Option A: ALWAYS follow the watch with an explicit conclusion check.
gh run watch $FE_RUN --repo sammygallo/sillytavern-mobile --exit-status
CONCLUSION=$(gh run view $FE_RUN --repo sammygallo/sillytavern-mobile --json conclusion --jq .conclusion)
echo "Conclusion: $CONCLUSION"  # Expect: success

# Option B: enable pipefail if you must pipe.
set -o pipefail
gh run watch $FE_RUN --repo sammygallo/sillytavern-mobile --exit-status 2>&1 | tail -20
```

**Option A is the safer default** — do it every time, even when the background task says exit 0. **Incurred on 2026-04-15:** the first deploy reported "exit code 0" from a backgrounded watch + tail pipeline while CI had actually failed, only caught by reading the output.

If CI fails, stop and report the failing step:
```bash
gh run view <run-id> --repo <repo> --log-failed
```

### 4. Deploy to droplet

```bash
ssh root@159.89.180.146 "cd /opt/sillytavern-mobile && git pull origin main && docker compose pull && docker compose up -d"
```

Pull-only deploy:
- `git pull origin main` — fetches the latest `docker-compose.yml` and any config/script changes
- `docker compose pull` — pulls the freshly-published frontend AND backend images from GHCR
- `docker compose up -d` — recreates any containers whose image changed and restarts them

Should complete in under a minute. **Never add `--build`.** Building on the droplet is explicitly prohibited (see Environment gotcha #3).

### 5. Verify

```bash
ssh root@159.89.180.146 "docker ps --format '{{.Names}}\t{{.Status}}'"
```

Expected output after a successful deploy:
- `sillytavern-mobile-frontend-1` — **Up** (running)
- `sillytavern-mobile-sillytavern-1` — **Up** (running)
- `sillytavern-mobile-seed-owner-1` — may or may not appear (it exits after seeding — see Environment gotcha #2)

For a deeper check, smoke-test the proxy endpoint:
```bash
ssh root@159.89.180.146 "curl -sI http://127.0.0.1:8080 | head -3"
```
Should return `HTTP/1.1 200 OK`.

Report the final status to the user.

## Error handling

### Merge conflict
Stop immediately, report it, let the user resolve manually. Do NOT try to auto-resolve.

### CI failure
Do NOT deploy. Show the failing step:
```bash
gh run view <run-id> --repo <repo> --log-failed
```
Report the error and wait for the user to fix it.

**Recovery path when CI fails AFTER the merge** (the commits are on `main`/`feat/role-based-permissions`, but the image didn't publish):

1. The existing feature branch is still valid — don't branch off main again.
2. Commit the fix directly on the feature branch, push:
   ```bash
   git add <fixed files> && git commit -m "fix: ..." && git push origin <feature-branch>
   ```
3. Open a NEW PR from the same branch to the same target. GitHub compares the feature branch to main, so the new PR contains only the fix commits (the previously merged ones are already on main and won't appear).
   ```bash
   gh pr create --repo sammygallo/sillytavern-mobile --base main --head <feature-branch> --title "fix(...): ..." --body "Follow-up to #<prev-pr>"
   gh pr merge <new-pr-number> --repo sammygallo/sillytavern-mobile --merge --admin
   ```
4. Wait for CI again (step 3 of the main workflow), then deploy.

Do **not** try to `git revert` the original merge — that leaves history noisy for no benefit. A forward-fix PR is cleaner, and since CI didn't publish the broken image, nothing was ever live. **Pattern used on 2026-04-15:** PR #80 merged, CI failed, PR #81 from the same `claude/gifted-driscoll` branch shipped the fix in ~3 minutes.

### `docker compose pull` reports "manifest unknown"
CI hasn't finished or it failed. Re-check:
```bash
gh run list --repo <repo> --workflow docker-publish.yml --limit 3
```
If the run is still in progress, wait for it. If it failed, see "CI failure" above. **Never deploy before CI is green.**

### `git pull` on droplet fails with "Your local changes would be overwritten"
Someone has modified a tracked file on the droplet. Do NOT blow the changes away blindly. First inspect, then use stash:

```bash
ssh root@159.89.180.146 "cd /opt/sillytavern-mobile && git status && git diff"
# Inspect the diff, confirm with user if it's the override-file case or something new.
# If safe to pop later:
ssh root@159.89.180.146 "cd /opt/sillytavern-mobile && git stash push -m 'local' <files> && git pull origin main && git stash pop"
```

If the diff is the `ports:` line (`127.0.0.1:8080:80`), the droplet's override file has gone missing or been deleted — recreate it (see Environment gotcha #1) instead of stashing.

### Container not starting
```bash
ssh root@159.89.180.146 "cd /opt/sillytavern-mobile && docker compose logs --tail 50 <service-name>"
```
Services are `frontend`, `sillytavern`, `seed-owner`. Report the logs to the user.

### Previous deploy was interrupted mid-build (legacy state)
If you SSH in and see a zombie `docker build` or `vite` process, the droplet is in the "old-way" state:
```bash
ssh root@159.89.180.146 "ps aux | grep -E 'docker build|vite|tsc|npm' | grep -v grep"
```
Kill any zombies (`kill -9 <pid>`), then retry the deploy. The droplet should never be building — always pulling.

### Droplet is low on disk / RAM
2 GB swap is in place, but disk can fill up with stale images:
```bash
ssh root@159.89.180.146 "df -h / && docker image prune -af"
```
`docker image prune -af` reclaims space from untagged / orphaned images. Safe to run routinely.

## CI cost tip

The docker-publish workflow triggers on every push to the default branch. For docs-only or `.gitignore`-only changes, that's wasted CI time. **Note:** putting `[skip ci]` in a PR's commit message does NOT work with `--merge` strategy — GitHub creates a new merge commit that doesn't inherit the tag. Options:

1. Use `--squash` or `--rebase` for docs-only PRs (preserves commit message).
2. Add `paths-ignore` to `.github/workflows/docker-publish.yml` to exclude `**.md`, `.gitignore`, `docs/**`, etc. Better long-term fix — do this next time the workflow is touched.
