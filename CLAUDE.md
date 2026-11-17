# ii00ii — handoff for a local Claude Code session

## What this is
ii00ii.com: daily photoreal 3D puzzles for the web ("Look twice"). Owner: sashbrus.
Full plan: https://claude.ai/artifact/9wJYZeaLhkWwxpX9pC9jYv
(same text as `ii00ii — Master Plan.md` in this folder, which is not committed).

## State on 2026-11-18
- https://ii00ii.com is live: Worker `ii00ii` (static assets, custom domain), deployed from this
  folder with `wrangler deploy`. It still serves the first placeholder page from `main`.
- This folder is a clone of https://github.com/sashbrus/ii00ii (private). `main` is untouched.
- Branch `phase-0-foundation` (local, not pushed) holds the Phase 0 monorepo:
  - `apps/site` — Astro static shell; the landing page is the playable logo.
  - `packages/kit` — viewpoint maths, puzzle file parsing, local-date key.
  - `games/look` — solver that proves a LOOK puzzle file is fair.
  - `content/dailies` — puzzle files (`logo.json` drives the landing page).
  - `workers/api` — health-check stub, not deployed.
  - `pipeline` — size-budget script.
  - `.github/workflows/ci.yml` — lint, types, tests + solver, build, size budget, phone smoke test.
- Not done yet: Workers Builds connection (needs the owner in the Cloudflare dashboard),
  `www` redirect, renderer bake-off, content pipeline, puzzle "depths" in the file format.

## How to run things
- pnpm is not installed globally and corepack here is too old for pnpm 12. Use
  `npx --yes pnpm@12.21.0 <command>` (for example `... install`, `... run checks`).
- `pnpm run checks` runs everything CI runs. `pnpm dev` serves the site locally.
- The system Node is 22.14; Astro 7 needs 22.23.4+. pnpm downloads a newer Node itself
  (the `node` entry in root devDependencies) and runs all scripts with it.
- E: is exFAT and cannot hold symlinks. That is why `pnpm-workspace.yaml` uses a flat
  `nodeLinker: hoisted` install and internal packages resolve through tsconfig `paths`
  plus the alias in `vitest.config.ts`. Do not add `workspace:` dependencies.
- The smoke test uses the installed Edge locally and Playwright's Chromium in CI.
- `.env` holds CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (7-day token from 2026-11-17).
  Never commit or print it. `deploy.cmd` loads it, builds the site and runs `wrangler deploy`.

## Rules agreed with the owner
- Do not take screenshots or control the screen. Use the terminal only.
- Ask before anything irreversible. The owner merges to production.
- No accounts, chat, ad networks or third-party trackers on the site (children will play).
