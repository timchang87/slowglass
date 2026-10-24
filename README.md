# Slowglass Studio

A desktop studio companion for relearning music production in Ableton Live 12 Lite. It finds study material, mirrors your set, versions your ideas, and teaches through hints rather than answers. The tool shows; you act.

- Plan (architecture, data model, wireframes, roadmap): [`docs/plan.html`](docs/plan.html)
- Spec and tickets: Linear, project **Slowglass Studio** ([SLO-5](https://linear.app/slowglass/issue/SLO-5/spec-slowglass-studio-v1))

## Layout

| Folder | What it is |
|---|---|
| `sidecar/` | Python service (FastAPI + MCP + SQLite). All logic lives here. Managed with `uv`. |
| `app/` | Electron shell with a React renderer. Starts and supervises the sidecar. |
| `docs/` | Plan and agent-skill configuration. |

## Prerequisites

- macOS with [uv](https://docs.astral.sh/uv/) (`brew install uv`)
- Node 22 (`app/.nvmrc`)

## Run

```sh
cd app
npm install
npm start          # builds, opens the window, starts the sidecar
```

The sidecar can also run on its own:

```sh
cd sidecar
uv run slowglass   # serves http://127.0.0.1:47821 (health at /health, MCP at /mcp)
```

Data lives in `~/Music/slowglass/` (the SQLite database is created and migrated on first run).

| Variable | Default | Purpose |
|---|---|---|
| `SLOWGLASS_HOME` | `~/Music/slowglass` | Where the database and library live |
| `SLOWGLASS_PORT` | `47821` | Localhost port for HTTP and MCP |
| `SLOWGLASS_SIDECAR_DIR` | `../sidecar` from the app | Sidecar project the app launches |
| `SLOWGLASS_UV` | `uv` | Path to `uv` if it isn't on `PATH` |

## Connect Claude Code

The repo's `.mcp.json` registers the sidecar as an MCP server named `slowglass`:

1. Start the app (or `uv run slowglass` in `sidecar/`).
2. Open Claude Code in this repo and approve the `slowglass` server when asked (or check with `/mcp`).
3. Claude can now call the sidecar's tools, starting with `health`.

To add it outside this repo: `claude mcp add --transport http slowglass http://127.0.0.1:47821/mcp`.

## Test

```sh
cd sidecar
uv run pytest      # sidecar through its public HTTP and MCP interface
uv run mypy        # strict type check

cd ../app
npm run typecheck
npm run test:e2e   # builds, then Playwright launches the real app and sidecar
```

Tests exercise behaviour through public interfaces only: HTTP and MCP for the sidecar, the running window for the app. Test doubles are allowed only at the outside-world ports (`LiveBridge`, `AudioSource`, `HttpFetcher`, `GitRemote`) as they arrive.
