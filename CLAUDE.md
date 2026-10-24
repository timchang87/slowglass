# Slowglass Studio

Desktop tool for relearning music production in Ableton Live 12 Lite. Electron shell (`app/`) plus a Python sidecar (`sidecar/`, FastAPI + MCP + SQLite) that holds all logic. The tool never writes to Live, never downloads files, and coaches with hints, not answers. Plan: `docs/plan.html`.

## Commands

- `cd sidecar && uv run pytest` / `uv run mypy`: sidecar tests and strict types
- `cd app && npm run typecheck` / `npm run test:e2e`: shell types and Playwright smoke tests
- `cd app && npm start`: run the app

## Conventions

- Test through public interfaces only (sidecar HTTP and MCP, the app window). Test doubles only at outside-world ports.
- Every sidecar capability is exposed both over HTTP (for the app) and as an MCP tool (for Claude).
- UI uses Untitled UI tokens (`app/src/renderer/tokens.css`); don't invent colours.

## Agent skills

### Issue tracker

Issues and specs live in Linear (workspace https://linear.app/slowglass/): Slowglass team (SLO), project "Slowglass Studio". See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
