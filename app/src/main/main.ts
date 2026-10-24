import { app, BrowserWindow, ipcMain } from "electron";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

import { SIDECAR_STATUS_CHANNEL, SIDECAR_STATUS_GET } from "../shared/sidecar-status";
import { SidecarSupervisor } from "./sidecar";

const DEFAULT_PORT = 47821;

/** The checkout's `.env` (written by `scripts/worktree.mjs setup`); empty when there is none. */
function readCheckoutEnv(): NodeJS.ProcessEnv {
  try {
    return parseEnv(readFileSync(path.resolve(app.getAppPath(), "..", ".env"), "utf8"));
  } catch {
    return {};
  }
}

// Variables already in the environment win over the checkout's `.env`.
const env: NodeJS.ProcessEnv = { ...readCheckoutEnv(), ...process.env };
const port = Number(env.SLOWGLASS_PORT ?? DEFAULT_PORT);
const home = env.SLOWGLASS_HOME ?? path.join(homedir(), "Music", "slowglass");
const label = env.SLOWGLASS_LABEL;
const sidecarDir = env.SLOWGLASS_SIDECAR_DIR ?? path.resolve(app.getAppPath(), "..", "sidecar");

// Each checkout keeps its Electron profile beside its data, so parallel worktrees never share one.
app.setPath("userData", path.join(home, "electron"));

const instance = randomUUID();

let window: BrowserWindow | undefined;
let stopped = false;

const supervisor = new SidecarSupervisor({
  command: env.SLOWGLASS_UV ?? "uv",
  args: ["run", "--project", sidecarDir, "slowglass"],
  // Apps started from Finder get a minimal PATH; make Homebrew's uv findable.
  env: {
    ...env,
    SLOWGLASS_HOME: home,
    SLOWGLASS_PORT: String(port),
    SLOWGLASS_INSTANCE: instance,
    SLOWGLASS_PARENT_PID: String(process.pid),
    PATH: [env.PATH, "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean).join(":"),
  },
  port,
  instance,
  onStatus: (status) => window?.webContents.send(SIDECAR_STATUS_CHANNEL, status),
});

function createWindow(): void {
  window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: label ? `Slowglass Studio · ${label}` : "Slowglass Studio",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // Keep the checkout label rather than the page's <title>.
  window.on("page-title-updated", (event) => event.preventDefault());
  void window.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
  window.on("closed", () => {
    window = undefined;
  });
}

ipcMain.handle(SIDECAR_STATUS_GET, () => supervisor.status);

void app.whenReady().then(() => {
  supervisor.start();
  createWindow();
});

app.on("window-all-closed", () => app.quit());

app.on("before-quit", (event) => {
  if (stopped) return;
  event.preventDefault();
  void supervisor.stop().then(() => {
    stopped = true;
    app.quit();
  });
});
