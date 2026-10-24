import type { SlowglassApi } from "../preload/preload";

declare global {
  interface Window {
    slowglass: SlowglassApi;
  }
}
