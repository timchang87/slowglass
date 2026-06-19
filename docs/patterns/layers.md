# Frontend Architecture Layers

How to structure `client/src` into a coherent set of layers. Starting from the current state — a bare `App.tsx` with an inline axios call and two empty nav components — this doc describes each layer, what goes in it, and how layers connect.

---

## Layer Map

```
client/src/
├── config/          ← env vars & compile-time constants
├── api/             ← axios instance, typed fetchers, error normalization
├── store/           ← Zustand slices (theme, auth, ui)
├── lib/             ← query client, third-party setup
├── router/          ← React Router route tree, layouts, guards
├── pages/           ← one file per route (thin, delegates to features)
├── features/        ← self-contained vertical slices (runs, approvals, …)
│   └── runs/
│       ├── api.ts           ← query functions for this domain
│       ├── queries.ts       ← TanStack Query hooks
│       ├── RunsPage.tsx
│       └── components/
├── components/      ← shared, domain-agnostic UI
└── hooks/           ← shared, domain-agnostic hooks
```

Dependency direction is strictly downward: `pages → features → api → config`. Nothing in `api/` imports from `store/`; nothing in `config/` imports from anywhere else.

---

## 1. Config Layer

**Location:** `client/src/config/`

Centralizes all compile-time and environment configuration. Vite exposes env vars prefixed with `VITE_` on `import.meta.env`. Wrap them here so the rest of the app never calls `import.meta.env` directly.

```ts
// client/src/config/env.ts
function required(key: string): string {
  const val = import.meta.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const config = {
  apiBase:    import.meta.env.VITE_API_BASE    ?? '/api',
  appEnv:     import.meta.env.VITE_APP_ENV     ?? 'development',
  githubOrg:  import.meta.env.VITE_GITHUB_ORG  ?? '',
  isProd:     import.meta.env.PROD,
  isDev:      import.meta.env.DEV,
} as const;
```

```ts
// client/src/config/index.ts
export { config } from './env';
```

Env file for local dev:

```sh
# client/.env.local  (gitignored)
VITE_API_BASE=/api
VITE_APP_ENV=development
VITE_GITHUB_ORG=acme
```

The Vite dev server already proxies `/api` → the Node server (see `vite.config.ts`), so `VITE_API_BASE=/api` works without CORS in dev. In production the CDN/load balancer handles routing.

**Type safety:** Declare custom env vars in `client/src/vite-env.d.ts`:

```ts
// client/src/vite-env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE:   string;
  readonly VITE_APP_ENV:    string;
  readonly VITE_GITHUB_ORG: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

---

## 2. API Layer

**Location:** `client/src/api/`

Owns the axios instance, auth token injection, error normalization, and typed request functions. Nothing outside this layer calls `axios` directly.

### 2a. Axios Instance

```ts
// client/src/api/client.ts
import axios, { AxiosError } from 'axios';
import { config } from '../config';

export const apiClient = axios.create({
  baseURL: config.apiBase,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,   // sends session cookie
});

// Attach auth token if using JWT in localStorage (remove if using cookies only)
apiClient.interceptors.request.use(req => {
  const token = localStorage.getItem('access_token');
  if (token) req.headers.Authorization = `Bearer ${token}`;
  return req;
});

// Normalize error shape
apiClient.interceptors.response.use(
  res => res,
  (err: AxiosError<{ message?: string }>) => {
    if (err.response?.status === 401) {
      // Session expired — clear local state and redirect
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    return Promise.reject(normalizeError(err));
  }
);
```

### 2b. Error Normalization

```ts
// client/src/api/errors.ts
export interface ApiError {
  status:  number;
  message: string;
  code?:   string;
}

export function normalizeError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    return {
      status:  err.response?.status ?? 0,
      message: err.response?.data?.message ?? err.message,
      code:    err.response?.data?.code,
    };
  }
  return { status: 0, message: String(err) };
}

export function isApiError(err: unknown): err is ApiError {
  return typeof err === 'object' && err !== null && 'status' in err;
}
```

### 2c. Typed Fetchers

Each domain area gets a fetcher file. These are plain async functions — no hooks, no side effects. TanStack Query wraps them.

```ts
// client/src/api/runs.ts
import { apiClient } from './client';
import type { Run, ListRunsResponse } from '@slowglass/schemas';

export async function fetchRuns(params: {
  repo?:   string;
  cursor?: string;
  limit?:  number;
}): Promise<ListRunsResponse> {
  const { data } = await apiClient.get('/runs', { params });
  return data;
}

export async function fetchRun(id: string): Promise<Run> {
  const { data } = await apiClient.get(`/runs/${id}`);
  return data;
}

export async function triggerRun(payload: {
  repo:   string;
  branch: string;
  workflow: string;
}): Promise<{ runId: string }> {
  const { data } = await apiClient.post('/runs', payload);
  return data;
}
```

```ts
// client/src/api/approvals.ts
import { apiClient } from './client';

export async function fetchPendingApprovals() {
  const { data } = await apiClient.get('/approvals?state=pending');
  return data;
}

export async function approveDeployment(approvalId: string) {
  const { data } = await apiClient.post(`/approvals/${approvalId}/approve`);
  return data;
}

export async function rejectDeployment(approvalId: string, reason?: string) {
  const { data } = await apiClient.post(`/approvals/${approvalId}/reject`, { reason });
  return data;
}
```

---

## 3. Data Fetching Layer (TanStack Query)

**Location:** `client/src/lib/queryClient.ts` and `client/src/features/*/queries.ts`

### 3a. Query Client Setup

```ts
// client/src/lib/queryClient.ts
import { QueryClient } from '@tanstack/react-query';
import { isApiError } from '../api/errors';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:        30_000,   // 30s before refetch on window focus
      retry: (count, err) => {
        if (isApiError(err) && err.status < 500) return false;  // don't retry 4xx
        return count < 2;
      },
    },
    mutations: {
      onError: err => {
        // Global mutation error handler — log or toast
        console.error('[mutation error]', err);
      },
    },
  },
});
```

```tsx
// client/src/main.tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './lib/queryClient';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
);
```

Install: `npm install @tanstack/react-query` in the `client` workspace.

### 3b. Query Key Factory

Centralize query keys so cache invalidation is consistent:

```ts
// client/src/lib/queryKeys.ts
export const keys = {
  runs: {
    all:    ()           => ['runs']                       as const,
    list:   (filters={}) => ['runs', 'list', filters]      as const,
    detail: (id: string) => ['runs', 'detail', id]         as const,
    log:    (id: string) => ['runs', 'log', id]            as const,
  },
  approvals: {
    all:     ()           => ['approvals']                  as const,
    pending: ()           => ['approvals', 'pending']       as const,
    detail:  (id: string) => ['approvals', 'detail', id]   as const,
  },
  environments: {
    all:    ()                       => ['environments']                   as const,
    detail: (repo: string, env: string) => ['environments', repo, env]    as const,
  },
  metrics: {
    dora: (teamId: string) => ['metrics', 'dora', teamId] as const,
  },
} as const;
```

### 3c. Domain Query Hooks

```ts
// client/src/features/runs/queries.ts
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { fetchRuns, fetchRun, triggerRun } from '../../api/runs';
import { keys } from '../../lib/queryKeys';

export function useRuns(filters: { repo?: string } = {}) {
  return useInfiniteQuery({
    queryKey:      keys.runs.list(filters),
    queryFn:       ({ pageParam }) => fetchRuns({ ...filters, cursor: pageParam }),
    getNextPageParam: page => page.nextCursor ?? undefined,
    initialPageParam: undefined as string | undefined,
  });
}

export function useRun(id: string) {
  return useQuery({
    queryKey: keys.runs.detail(id),
    queryFn:  () => fetchRun(id),
    enabled:  !!id,
  });
}

export function useTriggerRun() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: triggerRun,
    onSuccess: () => {
      client.invalidateQueries({ queryKey: keys.runs.all() });
    },
  });
}
```

---

## 4. State Management Layer

**Location:** `client/src/store/`

Zustand stores hold only UI state and user preferences that can't or shouldn't live in the URL or server cache. Server data belongs in TanStack Query.

```
store/
├── themeStore.ts     ← dark/light toggle (see theme.md)
├── authStore.ts      ← current user session
├── uiStore.ts        ← ephemeral UI state (active team, nav)
└── index.ts          ← re-exports
```

### Auth Store

```ts
// client/src/store/authStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id:    string;
  name:  string;
  email: string;
  orgId: string;
  role:  'admin' | 'reviewer' | 'member' | 'readonly';
}

interface AuthState {
  user:    User | null;
  setUser: (user: User | null) => void;
  signOut: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      user:    null,
      setUser: user => set({ user }),
      signOut: () => {
        set({ user: null });
        localStorage.removeItem('access_token');
      },
    }),
    { name: 'slowglass-auth', partialize: s => ({ user: s.user }) }
  )
);
```

### UI Store

```ts
// client/src/store/uiStore.ts
import { create } from 'zustand';

interface UiState {
  activeTeam:    string;
  setActiveTeam: (team: string) => void;
}

export const useUiStore = create<UiState>()(set => ({
  activeTeam:    'Platform Eng',
  setActiveTeam: team => set({ activeTeam: team }),
}));
```

**Rule:** If data comes from the server, it lives in TanStack Query cache, not in a Zustand store. Zustand is for: user preferences, active team selection, and overlay open/closed state that needs to be shared across subtrees.

---

## 5. Router Layer

**Location:** `client/src/router/`

React Router is already in `package.json`. Set up a route tree in `router/` and switch `main.tsx` to use `RouterProvider`.

### Route Tree

```ts
// client/src/router/routes.tsx
import { createBrowserRouter } from 'react-router';
import { RootLayout }          from './RootLayout';
import { AuthGuard }           from './AuthGuard';
import { DashboardPage }       from '../pages/DashboardPage';
import { EnvironmentsPage }    from '../pages/EnvironmentsPage';
import { RunsPage }            from '../pages/RunsPage';
import { RunDetailPage }       from '../pages/RunDetailPage';
import { ApprovalsPage }       from '../pages/ApprovalsPage';
import { ImagesPage }          from '../pages/ImagesPage';
import { MetricsPage }         from '../pages/MetricsPage';
import { LoginPage }           from '../pages/LoginPage';
import { NotFoundPage }        from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    element: <AuthGuard />,       // wraps all protected routes
    children: [{
      element: <RootLayout />,    // topbar + sidebar shell
      children: [
        { index: true,               element: <DashboardPage />    },
        { path: 'environments',      element: <EnvironmentsPage /> },
        { path: 'runs',              element: <RunsPage />         },
        { path: 'runs/:runId',       element: <RunDetailPage />    },
        { path: 'approvals',         element: <ApprovalsPage />    },
        { path: 'images',            element: <ImagesPage />       },
        { path: 'metrics',           element: <MetricsPage />      },
        { path: '*',                 element: <NotFoundPage />     },
      ],
    }],
  },
]);
```

### Auth Guard

```tsx
// client/src/router/AuthGuard.tsx
import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuthStore } from '../store/authStore';

export function AuthGuard() {
  const user     = useAuthStore(s => s.user);
  const location = useLocation();

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return <Outlet />;
}
```

### Root Layout

```tsx
// client/src/router/RootLayout.tsx
import { Outlet } from 'react-router';
import { TopNavigationBar }  from '../components/TopNavigationBar/TopNavigationBar';
import { SideNavigationBar } from '../components/SideNavigationBar/SideNavigationBar';
import styles from './RootLayout.module.css';

export function RootLayout() {
  return (
    <div className={styles.shell}>
      <TopNavigationBar />
      <div className={styles.body}>
        <SideNavigationBar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

```css
/* client/src/router/RootLayout.module.css */
.shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.main {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 20px 16px 40px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
  box-sizing: border-box;
}
```

Wire the router into `main.tsx`:

```tsx
// client/src/main.tsx
import { RouterProvider } from 'react-router';
import { router } from './router/routes';
// ... existing imports

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </React.StrictMode>
);
```

Remove `<App />` — `RootLayout` replaces it as the shell. The `useEffect` for `data-theme` moves into `RootLayout` (or a `ThemeProvider` wrapper).

---

## 6. Error Boundary Layer

**Location:** `client/src/components/ErrorBoundary/`

React only catches render errors in class-based error boundaries. Add one at the root and at each route.

```tsx
// client/src/components/ErrorBoundary/ErrorBoundary.tsx
import { Component, ReactNode } from 'react';

interface Props {
  fallback?: (reset: () => void) => ReactNode;
  children: ReactNode;
}
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return this.props.fallback
        ? this.props.fallback(this.reset)
        : <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ padding: 32, textAlign: 'center' }}>
      <p style={{ color: 'var(--color-red)', fontWeight: 600 }}>Something went wrong</p>
      <pre style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{error.message}</pre>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

Use in `RootLayout` and around each page's data-heavy section:

```tsx
// In RootLayout
<main className={styles.main}>
  <ErrorBoundary>
    <Outlet />
  </ErrorBoundary>
</main>
```

For async/query errors use TanStack Query's `isError` state inline — error boundaries only catch synchronous render failures.

---

## 7. MSW Test Layer

**Location:** `client/src/__tests__/mocks/`

MSW is already set up (`handlers.ts`, `server.ts`). The pattern for each API domain:

```ts
// client/src/__tests__/mocks/handlers.ts
import { http, HttpResponse } from 'msw';
import { PENDING_APPROVALS } from './fixtures/approvals';

export const handlers = [
  http.get('*/test', () =>
    HttpResponse.json({ message: 'Hello from the mocked server!' })
  ),

  http.get('*/runs', ({ request }) => {
    const url    = new URL(request.url);
    const repo   = url.searchParams.get('repo');
    const runs   = repo ? MOCK_RUNS.filter(r => r.repo === repo) : MOCK_RUNS;
    return HttpResponse.json({ runs, nextCursor: null });
  }),

  http.post('*/approvals/:id/approve', ({ params }) =>
    HttpResponse.json({ id: params.id, state: 'approved' })
  ),

  http.post('*/approvals/:id/reject', () =>
    HttpResponse.json({ id: '', state: 'rejected' })
  ),
];
```

Keep fixtures in `__tests__/mocks/fixtures/` — one file per domain. Import the same fixtures in component tests so data shapes stay consistent.

---

## Layer Summary

| Layer | Location | Imports from | Never imports |
|---|---|---|---|
| Config | `config/` | nothing | anything |
| API | `api/` | `config/` | `store/`, `router/` |
| Query client | `lib/` | `api/` | `store/`, `router/` |
| Stores | `store/` | `config/` | `api/`, `lib/` |
| Router | `router/` | `store/`, `components/`, `pages/` | `api/` directly |
| Features | `features/*/` | `api/`, `lib/`, `store/`, `components/` | other features |
| Pages | `pages/` | `features/`, `router/` | `api/` directly |
| Components | `components/` | `store/`, `config/` | `api/`, `features/` |

The key invariant: **pages and features never call `apiClient` directly** — they go through query hooks in `features/*/queries.ts`. This keeps all cache logic in one place and makes MSW mocking reliable.
