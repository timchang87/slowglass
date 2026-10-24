import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";

import { type HealthReport, sameStatus, type SidecarStatus } from "../shared/sidecar-status";

export interface SidecarOptions {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  port: number;
  /** Token the sidecar must echo from /health, so another process on the port is never mistaken for it. */
  instance: string;
  onStatus: (status: SidecarStatus) => void;
}

const POLL_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const STOP_GRACE_MS = 5_000;
/** A sidecar that was healthy and stops answering for this long is killed and restarted. */
const HANG_MS = 6_000;
/** A freshly spawned sidecar that never answers within this long is killed and restarted. */
const STARTUP_MS = 30_000;

/** Whether nothing is listening on the port yet, so the sidecar can bind it. */
function portIsFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
  });
}

function signalGroup(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return;
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
}

/** Starts the Python sidecar, watches its health, and restarts it if it dies. */
export class SidecarSupervisor {
  private child: ChildProcess | undefined;
  private poll: NodeJS.Timeout | undefined;
  private restartTimer: NodeJS.Timeout | undefined;
  private restarts = 0;
  private stopping = false;
  private lastStatus: SidecarStatus = { state: "starting" };
  private lastHealthyAt = 0;
  private healthySinceSpawn = false;

  constructor(private readonly options: SidecarOptions) {}

  get status(): SidecarStatus {
    return this.lastStatus;
  }

  start(): void {
    this.stopping = false;
    void this.launch();
    this.poll = setInterval(() => void this.checkHealth(), POLL_MS);
  }

  async stop(): Promise<void> {
    this.stopping = true;
    clearInterval(this.poll);
    clearTimeout(this.restartTimer);
    const child = this.child;
    if (child !== undefined && child.exitCode === null && child.signalCode === null) {
      const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
      signalGroup(child, "SIGTERM");
      const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), STOP_GRACE_MS));
      if ((await Promise.race([exited, timeout])) === "timeout") signalGroup(child, "SIGKILL");
    }
    this.setStatus({ state: "stopped" });
  }

  /**
   * Spawn the sidecar, unless another process holds its port. The port is never switched
   * automatically (Claude's `.mcp.json` points at it), so a busy port is reported and retried.
   */
  private async launch(): Promise<void> {
    const free = await portIsFree(this.options.port);
    if (this.stopping) return;
    if (free) {
      this.spawnChild();
      return;
    }
    this.setStatus({
      state: "blocked",
      detail: `port ${this.options.port} is in use by another process; free it or run \`npm run worktree -- setup --repick\``,
    });
    this.scheduleLaunch();
  }

  private scheduleLaunch(): void {
    const delay = Math.min(1_000 * 2 ** this.restarts, MAX_BACKOFF_MS);
    this.restarts += 1;
    this.restartTimer = setTimeout(() => {
      if (!this.stopping) void this.launch();
    }, delay);
  }

  private spawnChild(): void {
    const child = spawn(this.options.command, this.options.args, {
      env: this.options.env,
      stdio: ["ignore", "inherit", "inherit"],
      // Own process group, so stopping reaches the Python process under `uv run` too.
      detached: true,
    });
    this.child = child;
    this.lastHealthyAt = Date.now();
    this.healthySinceSpawn = false;
    child.once("error", (error) => this.handleExit(child, `could not start: ${error.message}`));
    child.once("exit", (code, signal) => this.handleExit(child, `exited (${signal ?? code})`));
  }

  private handleExit(child: ChildProcess, detail: string): void {
    if (this.stopping || child !== this.child) return;
    this.child = undefined;
    this.setStatus({ state: "restarting", detail });
    this.scheduleLaunch();
  }

  private async checkHealth(): Promise<void> {
    const child = this.child;
    if (child === undefined || this.stopping) return;
    const report = await this.fetchOwnHealth();
    if (this.stopping || child !== this.child) return;
    if (report !== undefined) {
      this.restarts = 0;
      this.lastHealthyAt = Date.now();
      this.healthySinceSpawn = true;
      this.setStatus({ state: "connected", version: report.version, pid: report.pid });
      return;
    }
    const silentFor = Date.now() - this.lastHealthyAt;
    if (silentFor > (this.healthySinceSpawn ? HANG_MS : STARTUP_MS)) {
      signalGroup(child, "SIGKILL"); // the exit handler schedules the restart
    } else if (this.lastStatus.state === "connected") {
      this.setStatus({ state: "starting", detail: "not responding" });
    }
  }

  /** The health report, only if it came from the sidecar this supervisor launched. */
  private async fetchOwnHealth(): Promise<HealthReport | undefined> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.options.port}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (!response.ok) return undefined;
      const report = (await response.json()) as HealthReport;
      return report.instance === this.options.instance ? report : undefined;
    } catch {
      return undefined;
    }
  }

  private setStatus(status: SidecarStatus): void {
    const changed = !sameStatus(status, this.lastStatus);
    this.lastStatus = status;
    if (changed) this.options.onStatus(status);
  }
}
