import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";

import { SIDECAR_STATUS_CHANNEL, SIDECAR_STATUS_GET } from "../shared/sidecar-status";
import { SidecarSupervisor } from "./sidecar";

const DEFAULT_PORT = 47821;
const port = Number(process.env.SLOWGLASS_PORT ?? DEFAULT_PORT);
const sidecarDir = process.env.SLOWGLASS_SIDECAR_DIR ?? path.resolve(app.getAppPath(), "..", "sidecar");

let window: BrowserWindow | undefined;
let stopped = false;

const supervisor = new SidecarSupervisor({
  command: process.env.SLOWGLASS_UV ?? "uv",
  args: ["run", "--project", sidecarDir, "slowglass"],
  // Apps started from Finder get a minimal PATH; make Homebrew's uv findable.
  env: {
    ...process.env,
    SLOWGLASS_PORT: String(port),
    PATH: [process.env.PATH, "/opt/homebrew/bin", "/usr/local/bin"].filter(Boolean).join(":"),
  },
  port,
  onStatus: (status) => window?.webContents.send(SIDECAR_STATUS_CHANNEL, status),
});

function createWindow(): void {
  window = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 720,
    minHeight: 480,
    title: "Slowglass Studio",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
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
