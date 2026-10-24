# One instance per worktree

Status: accepted (2026-10-24, SLO-33)

## Context

Development runs as several Claude sessions in parallel, each in its own git worktree on its own branch. Each session runs the app, the sidecar and the tests while it works. Out of the box every checkout would collide: the sidecar's port (47821), the database in `~/Music/slowglass`, the Electron profile, and the checked-in `.mcp.json` that points every Claude session at one sidecar.

This is about parallel development only. Running several copies of the app for real use is not a goal.

## Decision

Every checkout gets its own instance, configured by a gitignored `.env` at its root that `scripts/worktree.mjs setup` writes:

- `SLOWGLASS_PORT`: 47821 in the main checkout. A worktree gets a port derived from a hash of its path in 47822–48821, stepping past ports that are busy or claimed by another checkout. The port is chosen once and kept, because `.mcp.json` points at it and Claude reads that only at session start. A busy port at launch blocks the sidecar with a message pointing at `setup --repick`; the app never switches ports on its own.
- `SLOWGLASS_HOME`: `~/Music/slowglass` in the main checkout, `<worktree>/.slowglass/` in a worktree. The Electron profile (`userData`) is always `$SLOWGLASS_HOME/electron`.
- `SLOWGLASS_LABEL`: the branch name in a worktree, shown in the window title.

The Electron main process and the sidecar's settings both read the checkout's `.env`; variables already in the environment win. `.mcp.json` is generated per checkout from the tracked `.mcp.json.example`. A SessionStart hook runs `setup` in any checkout without a `.env`, so worktrees Claude Code creates are set up too.

Alembic history stays linear: when parallel branches each add a migration, the later one is rebased so its `down_revision` points at the other. A test fails when there is more than one head.

## Consequences

- Worktrees never share data, so a branch's migrations can't damage another branch's database or the real library.
- A fresh worktree's first Claude session may need `/mcp` to reconnect, because the hook writes `.mcp.json` as the session starts.
- Merge conflicts between branches are resolved at PR time, by people or agents; the migration-head test catches the one git can't see.
