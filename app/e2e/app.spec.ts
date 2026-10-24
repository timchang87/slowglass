import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

import { freePort, isAlive, launchApp, sidecarPid } from "./helpers";

const VIEWS = ["Catalogue", "Study", "Studio", "Versions", "Lessons", "Drills"];

test("launching the app starts the sidecar and shows it connected", async () => {
  const { app, window, home } = await launchApp();
  try {
    await expect(window.getByTestId("sidecar-status")).toContainText("sidecar connected", { timeout: 60_000 });
    expect(existsSync(path.join(home, "slowglass.db"))).toBe(true);
  } finally {
    await app.close();
  }
});

test("the six views are tabs with empty states", async () => {
  const { app, window } = await launchApp();
  try {
    for (const view of VIEWS) {
      await window.getByRole("tab", { name: view }).click();
      await expect(window.getByRole("tabpanel")).toContainText(view);
    }
  } finally {
    await app.close();
  }
});

test("a crashed sidecar is restarted and the footer follows it", async () => {
  const { app, window, port } = await launchApp();
  try {
    const status = window.getByTestId("sidecar-status");
    await expect(status).toContainText("sidecar connected", { timeout: 60_000 });
    const firstPid = await sidecarPid(port);

    process.kill(firstPid, "SIGKILL");

    await expect(status).toContainText("sidecar restarting", { timeout: 10_000 });
    await expect(status).toContainText("sidecar connected", { timeout: 60_000 });
    expect(await sidecarPid(port)).not.toBe(firstPid);
  } finally {
    await app.close();
  }
});

test("quitting the app stops the sidecar", async () => {
  const { app, window, port } = await launchApp();
  await expect(window.getByTestId("sidecar-status")).toContainText("sidecar connected", { timeout: 60_000 });
  const pid = await sidecarPid(port);

  await app.close();

  await expect.poll(() => isAlive(pid), { timeout: 10_000 }).toBe(false);
});

test("the shell follows light and dark with Untitled UI surfaces", async () => {
  const { app, window } = await launchApp();
  try {
    const background = () => window.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await window.emulateMedia({ colorScheme: "light" });
    expect(await background()).toBe("rgb(250, 250, 250)"); // Untitled UI neutral-50, --bg-secondary

    await window.emulateMedia({ colorScheme: "dark" });
    expect(await background()).toBe("rgb(10, 10, 10)"); // Untitled UI neutral-950, dark --bg-primary
  } finally {
    await app.close();
  }
});

test("a different process on the sidecar port is not mistaken for the sidecar", async () => {
  const port = await freePort();
  const impostor = createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ version: "9.9.9", pid: process.pid, database: { status: "ok", migration: "x" } }));
  });
  await new Promise<void>((resolve) => impostor.listen(port, "127.0.0.1", resolve));
  const { app, window } = await launchApp({ port });
  try {
    const status = window.getByTestId("sidecar-status");
    const seen = new Set<string>();
    const until = Date.now() + 10_000;
    while (Date.now() < until) {
      seen.add((await status.textContent()) ?? "");
      await window.waitForTimeout(100);
    }
    expect([...seen].some((text) => text.includes("sidecar restarting"))).toBe(true);
    expect([...seen].some((text) => text.includes("sidecar connected"))).toBe(false);
  } finally {
    await app.close();
    impostor.close();
  }
});

test("a hung sidecar is restarted", async () => {
  const { app, window, port } = await launchApp();
  try {
    const status = window.getByTestId("sidecar-status");
    await expect(status).toContainText("sidecar connected", { timeout: 60_000 });
    const hungPid = await sidecarPid(port);

    process.kill(hungPid, "SIGSTOP");

    await expect(status).toContainText("sidecar restarting", { timeout: 30_000 });
    await expect(status).toContainText("sidecar connected", { timeout: 60_000 });
    expect(await sidecarPid(port)).not.toBe(hungPid);
    expect(isAlive(hungPid)).toBe(false);
  } finally {
    await app.close();
  }
});

test("the sidecar exits if the app process dies without quitting", async () => {
  const { app, window, port } = await launchApp();
  await expect(window.getByTestId("sidecar-status")).toContainText("sidecar connected", { timeout: 60_000 });
  const pid = await sidecarPid(port);

  app.process().kill("SIGKILL");

  await expect.poll(() => isAlive(pid), { timeout: 20_000 }).toBe(false);
});
