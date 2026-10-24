import { useEffect, useState } from "react";

import type { SidecarStatus } from "../shared/sidecar-status";
import { VIEWS } from "./views";

function statusLabel(status: SidecarStatus): string {
  switch (status.state) {
    case "connected":
      return "● sidecar connected";
    case "starting":
      return "◌ sidecar starting…";
    case "restarting":
      return "◌ sidecar restarting…";
    case "blocked":
      return `● sidecar blocked: ${status.detail ?? "port in use"}`;
    case "stopped":
      return "● sidecar stopped";
  }
}

export function App() {
  const [selected, setSelected] = useState(0);
  const [status, setStatus] = useState<SidecarStatus>({ state: "starting" });

  useEffect(() => window.slowglass.onSidecarStatus(setStatus), []);

  const view = VIEWS[selected] ?? VIEWS[0]!;

  return (
    <div className="shell">
      <nav className="tabs" role="tablist" aria-label="Views">
        {VIEWS.map((v, index) => (
          <button
            key={v.name}
            id={`tab-${v.name}`}
            className="tab"
            role="tab"
            aria-selected={index === selected}
            aria-controls="view"
            tabIndex={index === selected ? 0 : -1}
            onClick={() => setSelected(index)}
          >
            {v.name}
          </button>
        ))}
      </nav>
      <main id="view" className="view" role="tabpanel" aria-labelledby={`tab-${view.name}`}>
        <section className="empty">
          <h1>{view.name}</h1>
          <p>{view.empty}</p>
        </section>
      </main>
      <footer className="footer">
        <span className="spacer" />
        <span data-testid="sidecar-status" className={`item status-${status.state}`} title={status.detail}>
          {statusLabel(status)}
        </span>
        {status.version !== undefined && <span className="item mono">v{status.version}</span>}
      </footer>
    </div>
  );
}
