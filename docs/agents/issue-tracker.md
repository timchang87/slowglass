# Issue tracker: Linear

Issues and specs for this repo live in Linear, workspace https://linear.app/slowglass/, team **Slowglass** (key `SLO`), project **Slowglass Studio**. Use the Linear MCP tools (`save_issue`, `get_issue`, `list_issues`, `list_comments`, `save_comment`, `save_project`, `save_document`, `save_milestone`).

The other projects in the SLO team (SlowGlass Platform, SlowGlass SRE) are unrelated to this repo; never file into them.

## Conventions

- **Create an issue**: `save_issue` with team `Slowglass`, project `Slowglass Studio`, a title, and a Markdown description.
- **Read an issue**: `get_issue` by identifier (e.g. `SLO-42`), then `list_comments` for its discussion.
- **List issues**: `list_issues` filtered by project `Slowglass Studio`, plus label and state filters.
- **Sub-issues**: `save_issue` with `parentId` set to the parent's identifier.
- **Blocking**: native Linear relations via `blockedBy` / `blocks` on `save_issue`.
- **Comment**: `save_comment`.
- **Apply / remove labels**: `addLabels` / `removeLabels` on `save_issue`.
- **Close**: set state to Done (or Canceled) and leave a comment saying why.
- **Milestones**: project milestones follow the roadmap: Spike, Versioning, Catalogue, Studio, Coach.

## When a skill says "publish to the issue tracker"

A spec becomes an issue in the project titled "Spec: <name>" holding the full text (e.g. SLO-5), and the project description links to it. A ticket becomes an issue in the project, attached to the right milestone, with the spec issue as parent where it implements part of it.

## When a skill says "fetch the relevant ticket"

`get_issue` plus `list_comments`.

## Choosing the base branch: parallel or stacked

Linear's blocking relations decide where a ticket's branch starts; there is no separate label. When picking up a ticket, `get_issue` with `includeRelations: true` and look at `blockedBy`:

- **Every blocker Done or Canceled (or none):** branch from `main` in its own worktree (`npm run worktree -- new <branch>`) and open the PR against `main`. This is parallel work.
- **One blocker still open:** stack on it. Branch from the blocker's branch (`npm run worktree -- new <branch> <blocker's branch>`) and open the PR with the blocker's branch as its base. Say so at the top of the PR body ("Stacked on #N"). Once the blocker merges, rebase onto `main` and retarget the PR to `main`.
- **Several blockers still open:** stack on the one this ticket builds on most directly; if it needs more than one of them, wait until all but one have merged.

Branch names come from the issue's `gitBranchName`, so a blocker's branch is found the same way.

Stacking only helps with dependent work. Two independent tickets that edit the same files will conflict whether or not they are stacked: keep those PRs small, rebase often, and resolve at PR time. Alembic migrations stay linear either way (see `CLAUDE.md`).

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: one issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body.
- **Child ticket**: a sub-issue of the map, labelled `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, assigned to the driving dev.
- **Blocking**: native Linear `blockedBy` relations. A ticket is unblocked when every blocker is Done or Canceled.
- **Frontier query**: the map's open sub-issues with no open blocker and no assignee; first in map order wins.
- **Claim**: assign to `me`, the session's first write.
- **Resolve**: comment the answer, set Done, then append a context pointer (gist + link) to the map's Decisions-so-far.
