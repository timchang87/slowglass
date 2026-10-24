import { type ChildProcess, spawn } from "node:child_process";

import type { SidecarStatus } from "../shared/sidecar-status";

export interface SidecarOptions {
  command: string;
  args: string[];
  env: NodeJS.ProcessEnv;
  port: number;
  onStatus: (status: SidecarStatus) => void;
}

const POLL_MS = 500;
const MAX_BACKOFF_MS = 10_000;
const STOP_GRACE_MS = 5_000;

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
  private current: SidecarStatus = { state: "starting" };

  constructor(private readonly options: SidecarOptions) {}

  get status(): SidecarStatus {
    return this.current;
  }

  start(): void {
    this.stopping = false;
    this.spawnChild();
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

  private spawnChild(): void {
    const child = spawn(this.options.command, this.options.args, {
      env: this.options.env,
      stdio: ["ignore", "inherit", "inherit"],
      // Own process group, so stopping reaches the Python process under `uv run` too.
      detached: true,
    });
    this.child = child;
    child.once("error", (error) => this.handleExit(child, `could not start: ${error.message}`));
    child.once("exit", (code, signal) => this.handleExit(child, `exited (${signal ?? code})`));
  }

  private handleExit(child: ChildProcess, detail: string): void {
    if (this.stopping || child !== this.child) return;
    this.child = undefined;
    const delay = Math.min(1_000 * 2 ** this.restarts, MAX_BACKOFF_MS);
    this.restarts += 1;
    this.setStatus({ state: "restarting", detail });
    this.restartTimer = setTimeout(() => {
      if (!this.stopping) this.spawnChild();
    }, delay);
  }

  private async checkHealth(): Promise<void> {
    if (this.child === undefined || this.stopping) return;
    try {
      const response = await fetch(`http://127.0.0.1:${this.options.port}/health`, {
        signal: AbortSignal.timeout(1_000),
      });
      const body = (await response.json()) as { version: string; pid: number };
      if (this.stopping) return;
      this.restarts = 0;
      this.setStatus({ state: "connected", version: body.version, pid: body.pid });
    } catch {
      if (this.current.state === "connected") this.setStatus({ state: "starting", detail: "not responding" });
    }
  }

  private setStatus(status: SidecarStatus): void {
    const same =
      status.state === this.current.state && status.pid === this.current.pid && status.detail === this.current.detail;
    this.current = status;
    if (!same) this.options.onStatus(status);
  }
}
