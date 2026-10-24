import { contextBridge, ipcRenderer } from "electron";

import type { SidecarStatus } from "../shared/sidecar-status";

// A sandboxed preload can only require "electron", so these mirror the constants in shared/sidecar-status.
const SIDECAR_STATUS_CHANNEL = "sidecar:status";
const SIDECAR_STATUS_GET = "sidecar:status:get";

const api = {
  /** Calls back with the current sidecar status now and on every change. */
  onSidecarStatus(callback: (status: SidecarStatus) => void): () => void {
    const listener = (_event: unknown, status: SidecarStatus) => callback(status);
    ipcRenderer.on(SIDECAR_STATUS_CHANNEL, listener);
    void ipcRenderer.invoke(SIDECAR_STATUS_GET).then((status: SidecarStatus) => callback(status));
    return () => ipcRenderer.removeListener(SIDECAR_STATUS_CHANNEL, listener);
  },
};

export type SlowglassApi = typeof api;

contextBridge.exposeInMainWorld("slowglass", api);
