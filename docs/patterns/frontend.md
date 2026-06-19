# Frontend Patterns

Reference for advanced patterns to implement across the SlowGlass client. All patterns are grounded in the proto's actual UI — team context, live pipeline data, approval flows, env drilldowns, and images.

---

## 1. URL-Synchronized Filter State

The Images and Runs views have multi-dimensional filter state (repo, service, sort, search). Using `useState` means filters reset on navigation. Use React Router search params instead.

```ts
// hooks/useFilterState.ts
import { useSearchParams } from 'react-router';

export function useFilterState(defaults: Record<string, string>) {
  const [params, setParams] = useSearchParams();

  function get(key: string) {
    return params.get(key) ?? defaults[key];
  }

  function set(key: string, value: string) {
    setParams(prev => {
      const next = new URLSearchParams(prev);
      if (value === defaults[key]) next.delete(key);
      else next.set(key, value);
      return next;
    }, { replace: true });
  }

  function reset() {
    setParams({}, { replace: true });
  }

  return { get, set, reset };
}
```

```tsx
// pages/Images.tsx
const filter = useFilterState({ repo: 'all', service: 'all', sort: 'builtAt' });
const repo    = filter.get('repo');
const sort    = filter.get('sort');

<select value={repo} onChange={e => filter.set('repo', e.target.value)} />
```

The proto's "deep link to environment" pattern (`onNavToEnv(repo, env)`) becomes:

```ts
// In Dashboard: navigate to Environments with state in URL
navigate(`/environments?repo=${repoKey}&env=${envName}`);
```

---

## 2. Real-Time Polling with Backoff

Active runs, the pipeline queue, and notifications need live data. Use a polling hook that backs off when the tab is hidden and cleans up on unmount.

```ts
// hooks/usePoll.ts
import { useEffect, useRef } from 'react';

export function usePoll(fn: () => void, intervalMs: number) {
  const savedFn = useRef(fn);
  savedFn.current = fn;

  useEffect(() => {
    let id: ReturnType<typeof setInterval>;

    function tick() {
      if (!document.hidden) savedFn.current();
    }

    tick();
    id = setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (!document.hidden) tick();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [intervalMs]);
}
```

```tsx
// In the Dashboard or Runs view
const { data: activeRuns, refetch } = useQuery({ queryKey: ['runs', 'active'], queryFn: fetchActiveRuns });
usePoll(refetch, 5_000); // 5-second live updates
```

For statuses that change rapidly (during a deploy), poll at 3s. For queue / approval counts in the dashboard header badge, 10–15s is fine.

---

## 3. Server-Sent Events for Run Log Streaming

The CI gate detail panel (failed runs like `run2`) will need live log output when a run is in progress. SSE is the right fit — unidirectional, no WebSocket overhead.

```ts
// hooks/useRunLog.ts
import { useEffect, useState } from 'react';

export function useRunLog(runId: string | null) {
  const [lines, setLines] = useState<string[]>([]);
  const [done,  setDone]  = useState(false);

  useEffect(() => {
    if (!runId) return;
    setLines([]);
    setDone(false);

    const es = new EventSource(`/api/runs/${runId}/log`);

    es.addEventListener('line', e => {
      setLines(prev => [...prev, e.data]);
    });

    es.addEventListener('done', () => {
      setDone(true);
      es.close();
    });

    es.onerror = () => es.close();

    return () => es.close();
  }, [runId]);

  return { lines, done };
}
```

Auto-scroll the log panel to the bottom as lines arrive:

```tsx
const bottomRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [lines]);

<div style={{ overflowY: 'auto', maxHeight: 400, fontFamily: 'monospace' }}>
  {lines.map((line, i) => <div key={i}>{line}</div>)}
  <div ref={bottomRef} />
</div>
```

---

## 4. Optimistic Updates for Approvals

The approval action (approve / reject) should feel instant. Update local state before the request resolves; roll back on failure.

Using TanStack Query's `onMutate` / `onError` / `onSettled`:

```ts
const queryClient = useQueryClient();

const approve = useMutation({
  mutationFn: (approvalId: string) =>
    api.post(`/approvals/${approvalId}/approve`),

  onMutate: async (approvalId) => {
    await queryClient.cancelQueries({ queryKey: ['approvals', 'pending'] });
    const previous = queryClient.getQueryData(['approvals', 'pending']);

    queryClient.setQueryData(['approvals', 'pending'], (old: Approval[]) =>
      old.filter(a => a.id !== approvalId)
    );

    return { previous };
  },

  onError: (_err, _id, context) => {
    queryClient.setQueryData(['approvals', 'pending'], context?.previous);
  },

  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['approvals'] });
  },
});
```

The proto shows approval dot progress (`a.approved / a.needed`). Increment optimistically before the server confirms:

```ts
queryClient.setQueryData(['approvals', 'pending'], (old: Approval[]) =>
  old.map(a => a.id === approvalId ? { ...a, approved: a.approved + 1 } : a)
);
```

---

## 5. Global State with Zustand

The proto's top-level `App` state — `team`, `active`, `dark`, `envRepo`, `envName` — needs to be globally accessible without prop-drilling. Split into slices.

```ts
// store/index.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  team:    string;
  dark:    boolean;
  setTeam: (team: string) => void;
  setDark: (dark: boolean) => void;
}

export const useAppStore = create<AppState>()(
  persist(
    set => ({
      team:    'Platform Eng',
      dark:    false,
      setTeam: team => set({ team }),
      setDark: dark => set({ dark }),
    }),
    { name: 'slowglass-prefs', partialize: s => ({ team: s.team, dark: s.dark }) }
  )
);
```

```ts
// store/envStore.ts — ephemeral, not persisted
export const useEnvStore = create<{
  repo: string;
  env:  string;
  navigate: (repo: string, env: string) => void;
}>(set => ({
  repo:     'frontend',
  env:      'us-east-1',
  navigate: (repo, env) => set({ repo, env }),
}));
```

The proto's `onNavToEnv` callback becomes:

```tsx
const navigate = useEnvStore(s => s.navigate);
// In Dashboard:
<DeploymentSnapshot onCellClick={(repo, env) => {
  navigate(repo, env);
  router.push('/environments');
}} />
```

---

## 6. Theme Token System with CSS Custom Properties

The proto passes a `t` token object as a prop to every component. Replace this with CSS custom properties so components don't need the prop.

```css
/* styles/tokens.css */
:root {
  --color-bg:          #f5f6fa;
  --color-surface:     #ffffff;
  --color-card:        #ffffff;
  --color-border:      #e5e7ef;
  --color-text:        #1c1e2e;
  --color-text-muted:  #6b7280;
  --color-blue:        #4f46e5;
  --color-green:       #059669;
  --color-red:         #dc2626;
  --color-amber:       #d97706;
  --color-purple:      #7c3aed;
  --shadow-card:       0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
}

[data-theme='dark'] {
  --color-bg:          #12131a;
  --color-surface:     #1a1b26;
  --color-card:        #1e1f2e;
  --color-border:      #2e2f45;
  --color-text:        #e8eaf6;
  --color-text-muted:  #7c7f9e;
  --color-blue:        #818cf8;
  --color-green:       #34d399;
  --color-red:         #f87171;
  --color-amber:       #fbbf24;
  --color-purple:      #a78bfa;
  --shadow-card:       0 1px 4px rgba(0,0,0,0.3);
}
```

Apply theme on the root element:

```tsx
// App.tsx
const { dark } = useAppStore();
<div data-theme={dark ? 'dark' : 'light'}>
  <Outlet />
</div>
```

Components reference tokens in CSS Modules:

```css
/* RunStatus.module.css */
.badge { background: var(--color-card); border: 1px solid var(--color-border); }
.success { color: var(--color-green); }
.failed  { color: var(--color-red);   }
```

---

## 7. Radix UI Composition for Overlay Patterns

The proto implements popovers, dropdowns, and tooltips manually with a `position: fixed` backdrop div and inline state. Replace with Radix primitives for keyboard navigation, focus management, and accessibility.

**Team switcher → Radix DropdownMenu:**

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import styles from './TeamSwitcher.module.css';

export function TeamSwitcher() {
  const { team, setTeam } = useAppStore();
  const meta = TEAM_META[team];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className={styles.trigger}>
          <TeamBadge abbr={meta.abbr} color={meta.color} />
          Acme Corp
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className={styles.content} sideOffset={6}>
          <DropdownMenu.Label className={styles.label}>VIEW AS TEAM</DropdownMenu.Label>
          {TEAMS.map(t => (
            <DropdownMenu.Item key={t} onSelect={() => setTeam(t)} className={styles.item}>
              <TeamBadge abbr={TEAM_META[t].abbr} color={TEAM_META[t].color} />
              {t}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
```

**Deployment grid cell → Radix Tooltip:**

```tsx
import * as Tooltip from '@radix-ui/react-tooltip';

<Tooltip.Provider delayDuration={200}>
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <button className={styles.cell} onClick={() => onCellClick(repo, env)}>
        <RunStatus status={env.status} />
        <span className={styles.version}>{env.version}</span>
      </button>
    </Tooltip.Trigger>
    <Tooltip.Portal>
      <Tooltip.Content className={styles.tooltip} side="top">
        Deployed by {env.deployedBy} · {env.deployedAt}
        <Tooltip.Arrow />
      </Tooltip.Content>
    </Tooltip.Portal>
  </Tooltip.Root>
</Tooltip.Provider>
```

**Approval action → Radix Dialog:**

```tsx
import * as Dialog from '@radix-ui/react-dialog';

<Dialog.Root>
  <Dialog.Trigger asChild>
    <button className={styles.approveBtn}>Approve</button>
  </Dialog.Trigger>
  <Dialog.Portal>
    <Dialog.Overlay className={styles.overlay} />
    <Dialog.Content className={styles.dialog}>
      <Dialog.Title>Approve deployment</Dialog.Title>
      <Dialog.Description>{approval.desc}</Dialog.Description>
      <div className={styles.actions}>
        <Dialog.Close asChild>
          <button onClick={() => approve.mutate(approval.id)}>Confirm</button>
        </Dialog.Close>
        <Dialog.Close asChild><button>Cancel</button></Dialog.Close>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>
```

---

## 8. Expandable Row Pattern (Accordion)

The Runs and Images views use a `expanded === r.id` toggle to reveal a detail panel inline. Use Radix Accordion so keyboard users can expand rows and the animation is handled consistently.

```tsx
import * as Accordion from '@radix-ui/react-accordion';
import styles from './RunsTable.module.css';

<Accordion.Root type="single" collapsible className={styles.table}>
  {runs.map(run => (
    <Accordion.Item key={run.id} value={run.id} className={styles.row}>
      <Accordion.Header>
        <Accordion.Trigger className={styles.trigger}>
          <RunStatus status={run.status} />
          <span className={styles.name}>{run.name}</span>
          <CommitTag commit={run.commit} />
          <span className={styles.duration}>{run.duration}</span>
          <ChevronIcon className={styles.chevron} />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className={styles.content}>
        <GateDetail runId={run.id} />
      </Accordion.Content>
    </Accordion.Item>
  ))}
</Accordion.Root>
```

```css
/* RunsTable.module.css */
.content {
  overflow: hidden;
}
.content[data-state='open']   { animation: slideDown 150ms ease-out; }
.content[data-state='closed'] { animation: slideUp  150ms ease-out; }

@keyframes slideDown { from { height: 0 } to { height: var(--radix-accordion-content-height) } }
@keyframes slideUp   { from { height: var(--radix-accordion-content-height) } to { height: 0 } }
```

---

## 9. Data Table with Virtual Scrolling

Runs and Images can have hundreds of rows. Virtualizing the list avoids rendering off-screen rows.

```tsx
import { useVirtualizer } from '@tanstack/react-virtual';

export function RunsTable({ runs }: { runs: Run[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count:         runs.length,
    getScrollElement: () => parentRef.current,
    estimateSize:  () => 52,       // row height in px
    overscan:      5,
  });

  return (
    <div ref={parentRef} style={{ overflowY: 'auto', height: '100%' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(item => {
          const run = runs[item.index];
          return (
            <div
              key={run.id}
              style={{
                position:  'absolute',
                top:       item.start,
                left:      0, right:  0,
                height:    item.size,
              }}
            >
              <RunRow run={run} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Install: `npm install @tanstack/react-virtual` in the `client` workspace.

---

## 10. RBAC-Aware Components

The proto filters `PENDING_APPROVALS` and `ACTIVE_RUNS` by team. In the real app, permissions come from the authenticated user's role.

```ts
// hooks/usePermissions.ts
import { useAuthStore } from '@/store/authStore';

export function usePermissions() {
  const user = useAuthStore(s => s.user);

  return {
    canApprove:      user?.role === 'admin' || user?.role === 'reviewer',
    canViewSecrets:  user?.role === 'admin',
    canTriggerRun:   user?.role !== 'readonly',
    isOwnApproval:   (authorId: string) => user?.id === authorId,
  };
}
```

```tsx
// In ApprovalCard
const { canApprove, isOwnApproval } = usePermissions();
const selfReview = approval.protectionRules.preventSelfReview && isOwnApproval(approval.authorId);

<button
  disabled={!canApprove || selfReview}
  title={selfReview ? 'Cannot approve your own deployment' : undefined}
>
  Approve
</button>
```

The `showSecrets` toggle in the Variables tab should gate on `canViewSecrets` and log each reveal server-side (see backend audit log pattern).
