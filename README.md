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
npm run worktree -- setup   # installs dependencies, writes .env and .mcp.json for this checkout
cd app
npm start                   # builds, opens the window, starts the sidecar
```

The sidecar can also run on its own:

```sh
cd sidecar
uv run slowglass   # serves http://127.0.0.1:47821 (health at /health, MCP at /mcp)
```

Data lives in `~/Music/slowglass/` (the SQLite database is created and migrated on first run).

Settings come from the environment, then from the checkout's `.env`, then from these defaults:

| Variable | Default | Purpose |
|---|---|---|
| `SLOWGLASS_HOME` | `~/Music/slowglass` | Where the database, library and Electron profile live |
| `SLOWGLASS_PORT` | `47821` | Localhost port for HTTP and MCP |
| `SLOWGLASS_LABEL` | none | Shown in the window title (a worktree's branch) |
| `SLOWGLASS_SIDECAR_DIR` | `../sidecar` from the app | Sidecar project the app launches |
| `SLOWGLASS_UV` | `uv` | Path to `uv` if it isn't on `PATH` |

The app also sets `SLOWGLASS_INSTANCE` (a per-launch token the sidecar echoes from `/health`, so another process on the port is never mistaken for it) and `SLOWGLASS_PARENT_PID` (the sidecar exits if the app process disappears). Claude's MCP tools are available whenever the sidecar is running; `.mcp.json` points at this checkout's port.

## Parallel worktrees

Each worktree runs its own instance, so several Claude sessions can build in parallel ([ADR-0001](docs/adr/0001-one-instance-per-worktree.md)):

```sh
npm run worktree -- new slo-42-thing      # .claude/worktrees/slo-42-thing, own port, data and .mcp.json
npm run worktree -- setup --repick        # in a worktree whose port another process has taken
npm run worktree -- rm slo-42-thing       # stops its app and sidecar, removes it (--force to drop unpushed work)
```

The main checkout keeps port 47821 and `~/Music/slowglass`. A worktree's data lives in its own `.slowglass/` and its window title shows the branch. Worktrees that Claude Code creates are set up by a SessionStart hook; run `/mcp` once if the `slowglass` server isn't connected in that first session.

## Connect Claude Code

Each checkout's `.mcp.json` (generated from `.mcp.json.example` by `setup`) registers the sidecar as an MCP server named `slowglass`:

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
