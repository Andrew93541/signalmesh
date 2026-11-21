# apps/dashboard — reserved for the responder dashboard

This folder is a placeholder for the teammate's responder dashboard
(DECISIONS.md D3). It intentionally has no `package.json`, so npm workspaces and
Turborepo ignore it until the real code arrives.

- Import steps: [`docs/DASHBOARD_IMPORT.md`](../../docs/DASHBOARD_IMPORT.md).
- **Before importing with `git subtree add`, remove this README** (`git rm -r apps/dashboard`) — subtree refuses to import into an existing folder.
- `apps/web` (Next.js starter) is kept untouched until the dashboard is imported and working; removing it is a separate, approved step.
