# Importing the teammate's dashboard into `apps/dashboard`

Status: waiting for the dashboard's location (DECISIONS.md D3). Nothing is
imported, deleted or overwritten until it arrives and you approve.

## 1. Rules

- **Do not lose the teammate's work.** Import with history when it is a git repo;
  otherwise copy into a fresh commit that records where it came from.
- **Do not touch `apps/web`** during import. Retire it later as its own change.
- **No functional changes in the import commit.** Fixes and API wiring come after, in reviewable commits.
- Never commit secrets found in the teammate's project (`.env`, keys). Replace with `.env.example`.

## 2. Import options

| Source | Command (run from repo root, on a branch) | Keeps history |
|---|---|---|
| Git repo (GitHub URL + branch) | `git rm -r apps/dashboard && git commit -m "Free apps/dashboard for import"` then `git subtree add --prefix=apps/dashboard <repo-url> <branch>` | Yes |
| Local folder on this Mac | Copy without `node_modules`, `dist`, `.env`: `rsync -a --exclude node_modules --exclude dist --exclude .env <path>/ apps/dashboard/` then commit noting the source path and date | No |
| ZIP | Unzip into an empty scratch folder, inspect, then copy as above | No |

Private repos: access through your normal GitHub login (`gh auth`), never by
pasting tokens into chat or files.

## 3. Make it a workspace member

1. Give it a unique `name` in `apps/dashboard/package.json` (e.g. `dashboard`).
2. Remove its own lockfile (`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`); run `npm install` at the repo root so the root lockfile owns dependencies.
3. Ensure it has `dev` and `build` scripts so `turbo run dev` / `build` include it.
4. Root scripts: add `"dev:dashboard": "turbo run dev --filter=dashboard"`.

## 4. Review checklist after import (report, don't fix silently)

- Stack and versions (expected React + Vite + Tailwind).
- Hard-coded emergency records, fake stats or mock data → list them.
- Hard-coded IPs/URLs → must become `VITE_GATEWAY_URL` (and later `VITE_BACKEND_URL`) with `.env.example`.
- Which gateway endpoints it calls vs `docs/CONTRACT.md` (v1 now, v2 later).
- Uses the WebSocket `/ws` for live updates, or polls.
- Builds and runs: `npm run build -w dashboard`, `npm run dev -w dashboard`.
- Accessibility basics and alignment with `DESIGN_SYSTEM.md` tokens.

## 5. Then (Phase 6)

Connect to real gateway data: `/gateway/status`, `/gateway/messages`,
`/gateway/messages/{id}`, ack/resolve (and dispatch in v2), `/gateway/nodes`,
`/gateway/checkins`, live updates over `/ws`. CORS is already open on the gateway
(`SIGNALMESH_CORS_ORIGINS`, default `*`; restrict for production).
