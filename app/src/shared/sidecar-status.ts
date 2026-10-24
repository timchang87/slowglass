/** What the shell knows about its sidecar, pushed from the main process to the window. */
export type SidecarState = "starting" | "connected" | "restarting" | "stopped";

export interface SidecarStatus {
  state: SidecarState;
  version?: string;
  pid?: number;
  detail?: string;
}

export function sameStatus(a: SidecarStatus, b: SidecarStatus): boolean {
  return a.state === b.state && a.version === b.version && a.pid === b.pid && a.detail === b.detail;
}

/** The sidecar's GET /health body (mirrors HealthReport in the sidecar). */
export interface HealthReport {
  version: string;
  pid: number;
  instance: string | null;
  database: { status: string; migration: string | null; error?: string };
}

export const SIDECAR_STATUS_CHANNEL = "sidecar:status";
export const SIDECAR_STATUS_GET = "sidecar:status:get";
