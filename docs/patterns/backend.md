# Backend Patterns

Reference for advanced patterns to implement in `services/core`. All patterns connect to proto data — GitHub Actions runs, approval gates, environment deployments, pipeline queues, Docker images, and DORA metrics.

---

## 1. GitHub Webhook Ingestion

All live data in the proto (run statuses, queue positions, approval triggers) originates from GitHub webhook events. The webhook endpoint must validate the HMAC signature before processing.

```ts
// src/webhooks/github.router.ts
import { Router, raw } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { webhookQueue } from './queue';

const router = Router();

router.post(
  '/webhooks/github',
  raw({ type: 'application/json' }),  // must receive raw body for HMAC
  (req, res) => {
    const sig     = req.headers['x-hub-signature-256'] as string;
    const secret  = process.env.GITHUB_WEBHOOK_SECRET!;
    const digest  = 'sha256=' + createHmac('sha256', secret).update(req.body).digest('hex');

    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(digest))) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event   = req.headers['x-github-event'] as string;
    const payload = JSON.parse(req.body.toString());

    webhookQueue.add({ event, payload });
    res.status(202).send();
  }
);

export { router as githubWebhookRouter };
```

**Key events to handle:**

| GitHub event | Proto data updated |
|---|---|
| `workflow_run` | Run status, duration, jobs done/total |
| `workflow_job` | Job-level progress within a run |
| `deployment` | Environment deployments, versions |
| `deployment_status` | Environment health (success/failure/pending) |
| `pull_request_review` | Approval count for protected deployments |
| `check_run` | CI gate status (unit, integration, sast, e2e) |

---

## 2. Webhook Event Queue

Process webhook events asynchronously so the `/webhooks/github` endpoint always returns `202` within milliseconds.

```ts
// src/webhooks/queue.ts
import { EventEmitter } from 'events';

interface WebhookJob {
  event:   string;
  payload: Record<string, unknown>;
}

class WebhookQueue extends EventEmitter {
  private queue: WebhookJob[] = [];
  private processing = false;

  add(job: WebhookJob) {
    this.queue.push(job);
    if (!this.processing) this.drain();
  }

  private async drain() {
    this.processing = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await this.process(job);
      } catch (err) {
        console.error(`Webhook error [${job.event}]:`, err);
      }
    }
    this.processing = false;
  }

  private async process(job: WebhookJob) {
    const handler = handlers[job.event];
    if (handler) await handler(job.payload);
  }
}

export const webhookQueue = new WebhookQueue();

// Register handlers
import { handleWorkflowRun }    from './handlers/workflowRun';
import { handleDeployment }     from './handlers/deployment';
import { handleCheckRun }       from './handlers/checkRun';
import { handlePRReview }       from './handlers/prReview';

const handlers: Record<string, (p: Record<string, unknown>) => Promise<void>> = {
  workflow_run:   handleWorkflowRun,
  deployment:     handleDeployment,
  deployment_status: handleDeployment,
  check_run:      handleCheckRun,
  pull_request_review: handlePRReview,
};
```

For production, replace the in-process queue with BullMQ backed by Redis, which handles retries, dead-letter, and distributed workers.

---

## 3. Server-Sent Events for Live Data Push

The active runs panel, queue widget, and approval badge count need live updates without the client polling. SSE is lighter than WebSocket for server-to-client push.

```ts
// src/sse/sse.router.ts
import { Router } from 'express';

const router   = Router();
const clients  = new Map<string, Set<Response>>();   // orgId → connections

export function broadcast(orgId: string, event: string, data: unknown) {
  const conns = clients.get(orgId);
  if (!conns) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) res.write(msg);
}

router.get('/stream', (req, res) => {
  const orgId = req.user!.orgId;

  res.writeHead(200, {
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',   // disable nginx buffering
  });

  res.write(': connected\n\n');

  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25_000);

  if (!clients.has(orgId)) clients.set(orgId, new Set());
  clients.get(orgId)!.add(res);

  req.on('close', () => {
    clearInterval(keepAlive);
    clients.get(orgId)?.delete(res);
  });
});

export { router as sseRouter };
```

In webhook handlers, broadcast after updating the DB:

```ts
// src/webhooks/handlers/workflowRun.ts
import { broadcast } from '../../sse/sse.router';
import { db }        from '../../db';
import { runs }      from '../../db/schema';

export async function handleWorkflowRun(payload: Record<string, unknown>) {
  const run = await upsertRun(payload);
  broadcast(run.orgId, 'run:update', run);
}
```

Client subscribes (see frontend SSE pattern) to `run:update`, `approval:new`, `queue:change`.

---

## 4. Approval Workflow State Machine

The proto shows approvals with: required count, wait timer, prevent-self-review, and a resolved state (approved/rejected). Model this as explicit transitions, not ad-hoc flag updates.

```ts
// src/approvals/state.ts

type ApprovalState = 'pending' | 'approved' | 'rejected' | 'expired';

interface ApprovalTransition {
  from:   ApprovalState[];
  to:     ApprovalState;
  guard?: (ctx: ApprovalContext) => boolean | string;
}

interface ApprovalContext {
  approval:  Approval;
  actorId:   string;
  currentApprovals: number;
}

const transitions: Record<string, ApprovalTransition> = {
  approve: {
    from:  ['pending'],
    to:    'approved',
    guard: (ctx) => {
      const rules = ctx.approval.protectionRules;
      if (rules.preventSelfReview && ctx.actorId === ctx.approval.authorId)
        return 'Cannot approve your own deployment';
      if (ctx.currentApprovals + 1 < rules.requiredApprovals)
        return 'Not enough approvals yet';
      return true;
    },
  },
  reject: {
    from:  ['pending'],
    to:    'rejected',
  },
  expire: {
    from:  ['pending'],
    to:    'expired',
  },
};

export function transition(
  action:  string,
  ctx:     ApprovalContext,
): { ok: true; next: ApprovalState } | { ok: false; reason: string } {
  const t = transitions[action];
  if (!t) return { ok: false, reason: `Unknown action: ${action}` };
  if (!t.from.includes(ctx.approval.state))
    return { ok: false, reason: `Cannot ${action} from state ${ctx.approval.state}` };

  if (t.guard) {
    const result = t.guard(ctx);
    if (result !== true) return { ok: false, reason: result as string };
  }

  return { ok: true, next: t.to };
}
```

```ts
// src/approvals/approvals.service.ts
export async function approveDeployment(approvalId: string, actorId: string) {
  const approval = await db.query.approvals.findFirst({ where: eq(approvals.id, approvalId) });
  if (!approval) throw new NotFoundError();

  const count = await db.select({ n: count() })
    .from(approvalVotes)
    .where(eq(approvalVotes.approvalId, approvalId));

  const result = transition('approve', {
    approval,
    actorId,
    currentApprovals: Number(count[0].n),
  });

  if (!result.ok) throw new ForbiddenError(result.reason);

  await db.transaction(async tx => {
    await tx.insert(approvalVotes).values({ approvalId, actorId, votedAt: new Date() });
    if (result.next === 'approved') {
      await tx.update(approvals)
        .set({ state: 'approved', resolvedAt: new Date(), resolvedBy: actorId })
        .where(eq(approvals.id, approvalId));
    }
    await auditLog(tx, { action: 'approval.approve', actorId, resourceId: approvalId });
  });

  broadcast(approval.orgId, 'approval:update', { id: approvalId, state: result.next });
}
```

---

## 5. Cursor-Based Pagination for Runs and Images

The proto's Runs and Images views list potentially thousands of rows. Offset pagination degrades under concurrent inserts; cursor pagination is stable.

```ts
// src/runs/runs.service.ts
import { and, eq, lt, desc } from 'drizzle-orm';

interface PageParams {
  orgId:   string;
  repo?:   string;
  cursor?: string;   // opaque: base64(createdAt:id)
  limit:   number;
}

export async function listRuns({ orgId, repo, cursor, limit }: PageParams) {
  let cursorFilter = undefined;

  if (cursor) {
    const [ts, id] = Buffer.from(cursor, 'base64').toString().split(':');
    cursorFilter = or(
      lt(runs.createdAt, new Date(ts)),
      and(eq(runs.createdAt, new Date(ts)), lt(runs.id, id))
    );
  }

  const rows = await db.select()
    .from(runs)
    .where(and(
      eq(runs.orgId, orgId),
      repo ? eq(runs.repo, repo) : undefined,
      cursorFilter,
    ))
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(limit + 1);   // fetch one extra to know if there's a next page

  const hasNext  = rows.length > limit;
  const page     = hasNext ? rows.slice(0, limit) : rows;
  const nextCursor = hasNext
    ? Buffer.from(`${page.at(-1)!.createdAt.toISOString()}:${page.at(-1)!.id}`).toString('base64')
    : null;

  return { runs: page, nextCursor };
}
```

---

## 6. GitHub API Proxy with Caching

The app fetches PR details, commit messages, and workflow run metadata from the GitHub API. Rate limiting (5,000 req/hr per token) requires caching.

```ts
// src/github/github.client.ts
import axios from 'axios';

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` },
});

// In-memory LRU cache (replace with Redis in production)
const cache  = new Map<string, { data: unknown; expiresAt: number }>();
const TTL_MS = 60_000;  // 1 minute

export async function githubGet<T>(path: string, ttl = TTL_MS): Promise<T> {
  const cached = cache.get(path);
  if (cached && Date.now() < cached.expiresAt) return cached.data as T;

  const { data, headers } = await github.get<T>(path);

  // Respect GitHub's cache hints
  const maxAge = parseInt(headers['cache-control']?.match(/max-age=(\d+)/)?.[1] ?? '0') * 1000;
  cache.set(path, { data, expiresAt: Date.now() + Math.max(ttl, maxAge) });

  // Warn when approaching rate limit
  const remaining = parseInt(headers['x-ratelimit-remaining'] ?? '5000');
  if (remaining < 200) console.warn(`GitHub rate limit low: ${remaining} remaining`);

  return data;
}
```

Usage:

```ts
const pr = await githubGet<GitHubPR>(`/repos/${org}/${repo}/pulls/${prNumber}`);
```

---

## 7. Multi-Tenant Scoping

Every resource — runs, approvals, environments, images — belongs to an org. Enforce org scoping at the service layer, never trust the request body for the org ID.

```ts
// src/middleware/tenant.ts
import { RequestHandler } from 'express';
import { db } from '../db';

export const tenantMiddleware: RequestHandler = async (req, _res, next) => {
  const userId = req.user!.id;
  const member = await db.query.orgMembers.findFirst({
    where: and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, req.user!.orgId)),
  });
  if (!member) return next(new ForbiddenError('Not a member of this org'));
  req.orgId = member.orgId;
  next();
};
```

All service functions receive `orgId` from `req.orgId`, not from request params:

```ts
// Good — orgId comes from verified session
router.get('/runs', tenantMiddleware, async (req, res) => {
  const runs = await listRuns({ orgId: req.orgId, repo: req.query.repo });
  res.json(runs);
});
```

Declare the augmentation in `src/types/express.d.ts`:

```ts
declare namespace Express {
  interface Request {
    user?:  { id: string; orgId: string; role: string };
    orgId?: string;
  }
}
```

---

## 8. Audit Log

The proto's Variables tab shows secrets that can be revealed, and the Approvals view records who approved what. Both need an audit trail.

```ts
// src/db/schema/auditLog.ts
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const auditLog = pgTable('audit_log', {
  id:         uuid('id').primaryKey().defaultRandom(),
  orgId:      uuid('org_id').notNull(),
  actorId:    uuid('actor_id').notNull(),
  action:     text('action').notNull(),      // 'approval.approve', 'secret.reveal', 'run.trigger'
  resourceId: text('resource_id'),
  metadata:   jsonb('metadata'),
  createdAt:  timestamp('created_at').notNull().defaultNow(),
});
```

```ts
// src/audit/audit.ts
import { db } from '../db';
import { auditLog } from '../db/schema';

export async function auditLog(
  tx: typeof db,   // accepts transaction or bare db
  entry: {
    action:     string;
    actorId:    string;
    orgId:      string;
    resourceId?: string;
    metadata?:  Record<string, unknown>;
  }
) {
  await tx.insert(auditLog).values(entry);
}
```

Call inside a transaction so the audit row is rolled back if the main operation fails:

```ts
await db.transaction(async tx => {
  await tx.update(secrets).set({ revealCount: sql`reveal_count + 1` }).where(...);
  await auditLog(tx, { action: 'secret.reveal', actorId, orgId, resourceId: secretKey });
});
```

---

## 9. Zod Schema Sharing Between Client and Server

The proto uses Zod on both sides. Share schemas from a package rather than duplicating them.

```
packages/
  schemas/
    src/
      runs.ts
      approvals.ts
      environments.ts
    package.json
```

```ts
// packages/schemas/src/runs.ts
import { z } from 'zod';

export const RunStatus = z.enum(['success', 'failed', 'running', 'deploying', 'awaiting', 'pending', 'cancelled']);

export const Run = z.object({
  id:        z.string().uuid(),
  name:      z.string(),
  repo:      z.string(),
  branch:    z.string(),
  commit:    z.string(),
  status:    RunStatus,
  duration:  z.string().nullable(),
  createdAt: z.string().datetime(),
});

export type Run = z.infer<typeof Run>;

// API response schemas
export const ListRunsResponse = z.object({
  runs:       z.array(Run),
  nextCursor: z.string().nullable(),
});
```

```ts
// Server: validate outgoing response
res.json(ListRunsResponse.parse({ runs, nextCursor }));

// Client: validate incoming data from API
const data = ListRunsResponse.parse(await res.json());
```

Reference in workspaces:

```json
// client/package.json
{ "dependencies": { "@slowglass/schemas": "*" } }

// services/core/package.json
{ "dependencies": { "@slowglass/schemas": "*" } }
```

---

## 10. DORA Metrics Aggregation

The proto's Metrics view shows deploy frequency, lead time, MTTR, and change failure rate per team. These are computed from the runs and deployment tables, not stored as separate fields.

```ts
// src/metrics/dora.service.ts
import { db }        from '../db';
import { runs, deployments } from '../db/schema';
import { and, eq, gte, sql } from 'drizzle-orm';

interface DoraParams {
  orgId:  string;
  teamId: string;
  since:  Date;
}

export async function computeDeployFrequency({ orgId, teamId, since }: DoraParams) {
  const [{ count, days }] = await db
    .select({
      count: sql<number>`count(*)::int`,
      days:  sql<number>`extract(epoch from now() - ${since}) / 86400`,
    })
    .from(deployments)
    .where(and(
      eq(deployments.orgId, orgId),
      eq(deployments.teamId, teamId),
      eq(deployments.environment, 'production'),
      eq(deployments.status, 'success'),
      gte(deployments.deployedAt, since),
    ));

  return count / days;  // deploys per day
}

export async function computeChangeFailureRate({ orgId, teamId, since }: DoraParams) {
  const [result] = await db
    .select({
      total:  sql<number>`count(*)::int`,
      failed: sql<number>`count(*) filter (where ${deployments.status} = 'failed')::int`,
    })
    .from(deployments)
    .where(and(
      eq(deployments.orgId, orgId),
      eq(deployments.teamId, teamId),
      eq(deployments.environment, 'production'),
      gte(deployments.deployedAt, since),
    ));

  return result.total > 0 ? (result.failed / result.total) * 100 : 0;
}

export async function computeMTTR({ orgId, teamId, since }: DoraParams) {
  // MTTR = avg time from a failed deploy to the next successful deploy on same env
  const [{ avg_minutes }] = await db.execute(sql`
    select avg(extract(epoch from recovery.deployed_at - failure.deployed_at) / 60)::int as avg_minutes
    from deployments failure
    join lateral (
      select deployed_at from deployments
      where org_id       = ${orgId}
        and team_id      = ${teamId}
        and environment  = failure.environment
        and status       = 'success'
        and deployed_at  > failure.deployed_at
      order by deployed_at
      limit 1
    ) recovery on true
    where failure.org_id     = ${orgId}
      and failure.team_id    = ${teamId}
      and failure.status     = 'failed'
      and failure.deployed_at >= ${since}
  `);

  return avg_minutes ?? 0;
}
```

Cache computed metrics for 5 minutes — they're expensive queries and the proto surfaces them on the Metrics page, not the real-time dashboard.
