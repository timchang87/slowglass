#!/usr/bin/env node
// One instance per worktree (ADR-0001): each checkout gets its own port, data folder and .mcp.json.
//
//   npm run worktree -- setup [--repick]     set up the current checkout (safe to rerun)
//   npm run worktree -- new <branch> [base]  create a worktree under .claude/worktrees/ and set it up
//   npm run worktree -- rm <branch> [--force] stop a worktree's app and sidecar, then remove it

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

const MAIN_PORT = 47821;
const WORKTREE_PORTS = { first: 47822, count: 1000 };
const ENV_KEYS = ["SLOWGLASS_PORT", "SLOWGLASS_HOME", "SLOWGLASS_LABEL"];

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

/** Progress goes to stderr, so the SessionStart hook doesn't flood Claude's context. */
function say(message) {
  process.stderr.write(`${message}\n`);
}

function fail(message) {
  say(`worktree: ${message}`);
  process.exit(1);
}

function run(cwd, command, args) {
  say(`$ ${command} ${args.join(" ")}  (in ${path.relative(process.cwd(), cwd) || "."})`);
  const result = spawnSync(command, args, { cwd, stdio: ["ignore", process.stderr, process.stderr] });
  if (result.status !== 0) fail(`${command} ${args.join(" ")} failed`);
}

/** Every checkout of this repo; the first is the main one. */
function listWorktrees(cwd) {
  const worktrees = [];
  for (const block of git(cwd, "worktree", "list", "--porcelain").split("\n\n")) {
    const lines = block.split("\n");
    const root = lines.find((line) => line.startsWith("worktree "))?.slice("worktree ".length);
    const branch = lines.find((line) => line.startsWith("branch "))?.slice("branch refs/heads/".length);
    if (root !== undefined) worktrees.push({ root, branch });
  }
  return worktrees;
}

function readEnv(root) {
  try {
    return parseEnv(readFileSync(path.join(root, ".env"), "utf8"));
  } catch {
    return {};
  }
}

/** Rewrite our keys in the checkout's .env, keeping any other lines the user added. */
function writeEnv(root, values) {
  const file = path.join(root, ".env");
  const kept = existsSync(file)
    ? readFileSync(file, "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "" && !ENV_KEYS.some((key) => line.startsWith(`${key}=`)))
        .filter((line) => !line.startsWith("# Written by scripts/worktree.mjs"))
    : [];
  const ours = Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${value}`);
  writeFileSync(file, ["# Written by scripts/worktree.mjs setup; see docs/adr/0001-one-instance-per-worktree.md", ...ours, ...kept, ""].join("\n"));
}

function portIsFree(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

/** FNV-1a, so a worktree's preferred port is the same every time it is set up. */
function hash(text) {
  let value = 0x811c9dc5;
  for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return value;
}

/** The first free port from the path's preferred one, skipping ports other checkouts have claimed. */
async function pickWorktreePort(root, claimed) {
  const start = hash(root) % WORKTREE_PORTS.count;
  for (let offset = 0; offset < WORKTREE_PORTS.count; offset += 1) {
    const port = WORKTREE_PORTS.first + ((start + offset) % WORKTREE_PORTS.count);
    if (!claimed.has(port) && (await portIsFree(port))) return port;
  }
  fail(`no free port in ${WORKTREE_PORTS.first}–${WORKTREE_PORTS.first + WORKTREE_PORTS.count - 1}`);
}

function writeMcpConfig(root, port) {
  const config = JSON.parse(readFileSync(path.join(root, ".mcp.json.example"), "utf8"));
  config.mcpServers.slowglass.url = `http://127.0.0.1:${port}/mcp`;
  writeFileSync(path.join(root, ".mcp.json"), `${JSON.stringify(config, null, 2)}\n`);
}

async function setup(root, { repick = false } = {}) {
  const worktrees = listWorktrees(root);
  const isMain = path.resolve(worktrees[0].root) === path.resolve(root);
  const current = readEnv(root);

  if (!repick) {
    run(path.join(root, "app"), "npm", ["install", "--no-audit", "--no-fund"]);
    run(path.join(root, "sidecar"), "uv", ["sync"]);
  }

  let port = Number(current.SLOWGLASS_PORT) || undefined;
  if (isMain) {
    if (repick) fail(`the main checkout always uses port ${MAIN_PORT}; stop whatever holds it instead`);
    port = MAIN_PORT;
  } else if (port === undefined || repick) {
    const claimed = new Set(
      worktrees
        .filter((worktree) => path.resolve(worktree.root) !== path.resolve(root))
        .map((worktree) => Number(readEnv(worktree.root).SLOWGLASS_PORT))
        .concat(MAIN_PORT),
    );
    if (repick && port !== undefined) claimed.add(port);
    port = await pickWorktreePort(root, claimed);
  }

  const home = current.SLOWGLASS_HOME ?? (isMain ? path.join(homedir(), "Music", "slowglass") : path.join(root, ".slowglass"));
  const label = isMain ? undefined : git(root, "branch", "--show-current") || git(root, "rev-parse", "--short", "HEAD");

  mkdirSync(home, { recursive: true });
  writeEnv(root, { SLOWGLASS_PORT: port, SLOWGLASS_HOME: home, SLOWGLASS_LABEL: label });
  writeMcpConfig(root, port);

  say(`worktree: ${isMain ? "main checkout" : label} → port ${port}, data in ${home}`);
  say("worktree: restart Claude Code (or reconnect with /mcp) if .mcp.json changed during this session");
}

function slug(branch) {
  return branch.replace(/[^A-Za-z0-9._-]+/g, "-");
}

async function create(cwd, branch, base) {
  if (!branch) fail("usage: worktree new <branch> [base]");
  const main = listWorktrees(cwd)[0].root;
  const root = path.join(main, ".claude", "worktrees", slug(branch));
  const exists = spawnSync("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd }).status === 0;
  const args = exists ? ["worktree", "add", root, branch] : ["worktree", "add", "-b", branch, root, base ?? "HEAD"];
  run(cwd, "git", args);
  await setup(root);
  say(`worktree: ready at ${root}`);
}

/** Pids of every process running from inside the worktree: its Electron app, uv and the sidecar. */
function processesUnder(root) {
  const result = spawnSync("pgrep", ["-f", `${root}/`], { encoding: "utf8" });
  return result.stdout
    .split("\n")
    .map(Number)
    .filter((pid) => pid > 0 && pid !== process.pid);
}

async function stop(root) {
  const signal = (pids, name) => pids.forEach((pid) => {
    try {
      process.kill(pid, name);
    } catch {
      // already gone
    }
  });
  const pids = processesUnder(root);
  if (pids.length === 0) return;
  say(`worktree: stopping ${pids.length} process(es)`);
  signal(pids, "SIGTERM");
  for (let waited = 0; waited < 5_000 && processesUnder(root).length > 0; waited += 200) {
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  signal(processesUnder(root), "SIGKILL");
}

function unsavedWork(root) {
  const problems = [];
  if (git(root, "status", "--porcelain") !== "") problems.push("uncommitted changes");
  const hasUpstream = spawnSync("git", ["rev-parse", "--abbrev-ref", "@{upstream}"], { cwd: root }).status === 0;
  const unpushed = hasUpstream
    ? git(root, "rev-list", "--count", "@{upstream}..HEAD")
    : git(root, "rev-list", "--count", "HEAD", "--not", "--remotes");
  if (Number(unpushed) > 0) problems.push(`${unpushed} unpushed commit(s)`);
  return problems;
}

async function remove(cwd, branch, { force = false } = {}) {
  if (!branch) fail("usage: worktree rm <branch> [--force]");
  const [main, ...others] = listWorktrees(cwd);
  if (main.branch === branch) fail("refusing to remove the main checkout");
  const worktree = others.find((candidate) => candidate.branch === branch);
  if (worktree === undefined) fail(`no worktree has branch ${branch} checked out`);
  const problems = unsavedWork(worktree.root);
  if (problems.length > 0 && !force) fail(`${worktree.root} has ${problems.join(" and ")}; rerun with --force to discard`);
  await stop(worktree.root);
  run(main.root, "git", ["worktree", "remove", ...(force ? ["--force"] : []), worktree.root]);
  say(`worktree: removed ${worktree.root} (branch ${branch} is kept)`);
}

const [command, ...rest] = process.argv.slice(2);
const flags = new Set(rest.filter((arg) => arg.startsWith("--")));
const positional = rest.filter((arg) => !arg.startsWith("--"));
const here = git(process.cwd(), "rev-parse", "--show-toplevel");

switch (command) {
  case "setup":
    await setup(here, { repick: flags.has("--repick") });
    break;
  case "new":
    await create(here, positional[0], positional[1]);
    break;
  case "rm":
    await remove(here, positional[0], { force: flags.has("--force") });
    break;
  default:
    fail("usage: worktree setup [--repick] | new <branch> [base] | rm <branch> [--force]");
}
