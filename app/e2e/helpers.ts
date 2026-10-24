import { _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

import type { HealthReport } from "../src/shared/sidecar-status";

export interface LaunchedApp {
  app: ElectronApplication;
  window: Page;
  port: number;
  home: string;
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") return reject(new Error("no port"));
      server.close(() => resolve(address.port));
    });
  });
}

/** Launch the built app with its sidecar on a free port and a throwaway home folder. */
export async function launchApp(options: { port?: number } = {}): Promise<LaunchedApp> {
  const port = options.port ?? (await freePort());
  const home = mkdtempSync(path.join(tmpdir(), "slowglass-e2e-"));
  const app = await electron.launch({
    args: [path.resolve(__dirname, "..")],
    env: { ...process.env, SLOWGLASS_HOME: home, SLOWGLASS_PORT: String(port) },
  });
  const window = await app.firstWindow();
  return { app, window, port, home };
}

export async function sidecarPid(port: number): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  const body = (await response.json()) as HealthReport;
  return body.pid;
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
