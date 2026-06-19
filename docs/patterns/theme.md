# Theme Management

How to implement dark/light mode for SlowGlass. The proto has a toggle in the avatar dropdown menu that switches between two token sets. This doc covers the full setup: token definition, system-preference detection, persistence, and component-level usage — all grounded in the existing `index.css` and `App.tsx`.

---

## Overview

The approach uses three layers:

1. **CSS custom properties** on `[data-theme]` — single source of truth for every visual value
2. **Zustand store** — holds `dark: boolean`, persisted to `localStorage`
3. **`App.tsx`** — applies `data-theme` to `document.documentElement` via `useEffect`

Components never import a token object or receive a theme prop. They reference CSS variables directly in their module files.

---

## Step 1 — Replace `index.css` with Token-Based Globals

Replace the current Vite default `index.css` with a token-driven file. The existing file has inline light/dark values via `@media (prefers-color-scheme)` — move those to `[data-theme]` attributes so the toggle controls them rather than the OS.

```css
/* client/src/index.css */

/* ── Reset ─────────────────────────────────────────────── */
*, *::before, *::after { box-sizing: border-box; }

body {
  margin: 0;
  min-width: 320px;
  font-family: 'DM Sans', Inter, system-ui, sans-serif;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

/* ── Light tokens (default) ────────────────────────────── */
:root,
[data-theme='light'] {
  color-scheme: light;

  --color-bg:           #f5f6fa;
  --color-surface:      #ffffff;
  --color-card:         #ffffff;
  --color-card-hover:   #f9fafb;
  --color-topbar:       #ffffff;
  --color-input:        #f5f6fa;
  --color-border:       #e5e7ef;
  --color-border-strong:#c8cad8;

  --color-text:         #1c1e2e;
  --color-text-muted:   #6b7280;
  --color-text-faint:   #9ca3af;

  --color-blue:         #4f46e5;
  --color-blue-hover:   #4338ca;
  --color-green:        #059669;
  --color-red:          #dc2626;
  --color-amber:        #d97706;
  --color-purple:       #7c3aed;

  --color-active-nav:        #eef2ff;
  --color-active-nav-border: #4f46e5;

  --shadow-card:    0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-overlay: 0 1px 8px rgba(0,0,0,0.08), 0 4px 16px rgba(0,0,0,0.04);

  --font-mono: 'DM Mono', 'Fira Code', monospace;
}

/* ── Dark tokens ───────────────────────────────────────── */
[data-theme='dark'] {
  color-scheme: dark;

  --color-bg:           #12131a;
  --color-surface:      #1a1b26;
  --color-card:         #1e1f2e;
  --color-card-hover:   #24253a;
  --color-topbar:       #1a1b26;
  --color-input:        #12131a;
  --color-border:       #2e2f45;
  --color-border-strong:#3d3f5c;

  --color-text:         #e8eaf6;
  --color-text-muted:   #7c7f9e;
  --color-text-faint:   #4a4c6a;

  --color-blue:         #818cf8;
  --color-blue-hover:   #93a1fb;
  --color-green:        #34d399;
  --color-red:          #f87171;
  --color-amber:        #fbbf24;
  --color-purple:       #a78bfa;

  --color-active-nav:        rgba(99,102,241,0.15);
  --color-active-nav-border: #818cf8;

  --shadow-card:    0 1px 4px rgba(0,0,0,0.3);
  --shadow-overlay: 0 4px 20px rgba(0,0,0,0.4);
}

/* ── Typography ────────────────────────────────────────── */
a {
  color: var(--color-blue);
  text-decoration: inherit;
  font-weight: 500;
}
a:hover { color: var(--color-blue-hover); }

/* ── Scrollbar ─────────────────────────────────────────── */
* { scrollbar-width: thin; scrollbar-color: var(--color-border) transparent; }
```

---

## Step 2 — Theme Store

```ts
// client/src/store/themeStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  dark:    boolean;
  toggle:  () => void;
  setDark: (dark: boolean) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    set => ({
      dark:    false,
      toggle:  () => set(s => ({ dark: !s.dark })),
      setDark: dark => set({ dark }),
    }),
    {
      name:    'slowglass-theme',           // localStorage key
      partialize: s => ({ dark: s.dark }),  // only persist dark, not functions
    }
  )
);
```

---

## Step 3 — Apply `data-theme` in `App.tsx`

`data-theme` lives on `document.documentElement` (the `<html>` tag) so every CSS selector in every stylesheet can see it.

```tsx
// client/src/App.tsx
import { FC, useEffect } from 'react';
import { useThemeStore } from './store/themeStore';
import { TopNavigationBar } from './components/TopNavigationBar/TopNavigationBar';
import { SideNavigationBar } from './components/SideNavigationBar/SideNavigationBar';

const App: FC = () => {
  const dark = useThemeStore(s => s.dark);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  return (
    <>
      <TopNavigationBar />
      <SideNavigationBar />
    </>
  );
};

export default App;
```

No provider needed — `useThemeStore` works anywhere in the tree.

---

## Step 4 — Detect System Preference on First Load

The store initializes `dark: false`, which ignores the OS setting. Detect and apply the preference before the store hydrates so there's no flash of the wrong theme.

Add this to `client/src/main.tsx`, before `ReactDOM.createRoot`:

```ts
// client/src/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Apply theme before first render to avoid flash
const stored = localStorage.getItem('slowglass-theme');
const prefersDark = stored
  ? (JSON.parse(stored)?.state?.dark ?? false)
  : window.matchMedia('(prefers-color-scheme: dark)').matches;

document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

This reads the persisted value synchronously from `localStorage` on the same tick as the HTML parse, so no flicker.

---

## Step 5 — The Toggle Component

The proto puts the toggle inside the avatar dropdown. Wire it to the store:

```tsx
// client/src/components/ThemeToggle/ThemeToggle.tsx
import { FC } from 'react';
import { useThemeStore } from '../../store/themeStore';
import styles from './ThemeToggle.module.css';

export const ThemeToggle: FC = () => {
  const { dark, toggle } = useThemeStore();

  return (
    <button
      role="switch"
      aria-checked={dark}
      onClick={toggle}
      className={styles.track}
      data-state={dark ? 'on' : 'off'}
    >
      <span className={styles.thumb} />
      <span className={styles.label}>{dark ? 'Dark mode' : 'Light mode'}</span>
    </button>
  );
};
```

```css
/* client/src/components/ThemeToggle/ThemeToggle.module.css */
.track {
  display: flex;
  align-items: center;
  gap: 10px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 7px 10px;
  border-radius: 7px;
  font-family: inherit;
  font-size: 13px;
  color: var(--color-text-muted);
  width: 100%;
}
.track:hover { background: var(--color-active-nav); color: var(--color-text); }

/* The pill */
.track::before {
  content: '';
  display: block;
  width: 36px;
  height: 20px;
  border-radius: 10px;
  background: var(--color-border);
  flex-shrink: 0;
  transition: background 0.2s;
  position: relative;
}
.track[data-state='on']::before { background: var(--color-blue); }

/* The knob — use a real element so it can translate */
.thumb {
  display: none; /* use ::before on track above; swap for a real element if you need JS transitions */
}

.label { flex: 1; text-align: left; }
```

Alternatively, use `@radix-ui/react-switch` for accessible keyboard control (see Radix patterns doc).

---

## Using Tokens in CSS Modules

Every component references tokens directly — no props, no imports:

```css
/* Example: RunStatus.module.css */
.badge {
  background: var(--color-card);
  border: 1px solid var(--color-border);
  border-radius: 20px;
  padding: 3px 9px;
}

.success { color: var(--color-green); }
.failed  { color: var(--color-red);   }
.running { color: var(--color-blue);  }
.awaiting{ color: var(--color-amber); }
```

```tsx
// RunStatus.tsx — no theme prop needed
import styles from './RunStatus.module.css';

export const RunStatus: FC<{ status: string }> = ({ status }) => (
  <span className={`${styles.badge} ${styles[status] ?? ''}`}>
    {STATUS_LABELS[status]}
  </span>
);
```

---

## Token Naming Convention

| Prefix | Use |
|---|---|
| `--color-bg` | Page background |
| `--color-surface` | Elevated surfaces (dropdowns, modals) |
| `--color-card` | Cards and panels |
| `--color-card-hover` | Card hover background |
| `--color-border` | Default borders |
| `--color-border-strong` | Prominent borders (section dividers) |
| `--color-text` | Primary text |
| `--color-text-muted` | Secondary labels and meta |
| `--color-text-faint` | Tertiary: timestamps, placeholders |
| `--color-blue` | Primary interactive / brand |
| `--color-active-nav` | Selected nav item background |
| `--shadow-card` | Resting card elevation |
| `--shadow-overlay` | Dropdowns and popovers |
| `--font-mono` | Commit hashes, code, env var values |

Semantic values only — avoid `--color-indigo-600` style raw scales. If you need a one-off tint (e.g. blue at 12% opacity), compute it inline: `background: color-mix(in srgb, var(--color-blue) 12%, transparent)`.
