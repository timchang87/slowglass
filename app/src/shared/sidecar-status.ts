/** What the shell knows about its sidecar, pushed from the main process to the window. */
export type SidecarState = "starting" | "connected" | "restarting" | "stopped";

export interface SidecarStatus {
  state: SidecarState;
  version?: string;
  pid?: number;
  detail?: string;
}

export const SIDECAR_STATUS_CHANNEL = "sidecar:status";
export const SIDECAR_STATUS_GET = "sidecar:status:get";
