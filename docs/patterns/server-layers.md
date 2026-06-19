# Server Architecture Layers

How to structure `services/core/src` into a coherent set of layers. Starting from the current state — a single `app.ts` with one route, a flat `config.ts`, and a single Drizzle schema — this doc describes each layer, what goes in it, and how they connect.

---

## Layer Map

```
services/core/src/
├── config.ts            ← env vars, validated at startup
├── errors.ts            ← typed error classes
├── app.ts               ← Express app setup, middleware wiring
├── server.ts            ← calls app.listen, graceful shutdown
├── db/
│   ├── index.ts         ← Drizzle client singleton
│   ├── relations.ts     ← Drizzle relational definitions
│   └── schemas/         ← one file per domain table
│       ├── index.ts
│       ├── runs.ts
│       ├── approvals.ts
│       ├── environments.ts
│       └── auditLog.ts
├── middleware/
│   ├── asyncHandler.ts  ← eliminates try/catch in every route
│   ├── auth.ts          ← JWT/session verification, req.user
│   ├── tenant.ts        ← org membership check, req.orgId
│   ├── validate.ts      ← Zod request validation factory
│   ├── rateLimiter.ts   ← per-route and global rate limits
│   ├── requestId.ts     ← attaches x-request-id for tracing
│   ├── error.ts         ← global error handler (must be last)
│   └── requestLogger.ts ← structured per-request log line
├── logger.ts            ← pino instance, used everywhere
├── webhooks/            ← GitHub webhook ingestion + queue
│   ├── github.router.ts
│   ├── queue.ts
│   └── handlers/
│       ├── workflowRun.ts
│       ├── deployment.ts
│       └── checkRun.ts
├── sse/                 ← Server-Sent Events broadcaster
│   └── sse.router.ts
└── features/            ← vertical slices (one per domain)
    └── runs/
        ├── runs.router.ts
        ├── runs.service.ts
        ├── runs.repository.ts
        └── runs.schema.ts
```

Dependency direction is strictly downward: `router → service → repository → db`. Routers never import from other routers; services never import repositories from other features directly.

---

## 1. Config Layer

**File:** `src/config.ts`

Replace the existing `getEnvVar` helper with a Zod schema that validates every variable at startup and calls `process.exit(1)` on failure. Catches missing or malformed env vars before the first request is served rather than at the callsite.

```ts
// src/config.ts
import dotenv from 'dotenv';
import path from 'path';
import { z } from 'zod';
import { __dirname } from './utils.js';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const EnvSchema = z.object({
  // Server
  SERVER_PORT: z.coerce.number().default(5000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  NODE_ENV:    z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL:   z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  POSTGRES_USER:             z.string().min(1),
  POSTGRES_HOST:             z.string().min(1),
  POSTGRES_DB:               z.string().min(1),
  POSTGRES_PASSWORD:         z.string().min(1),
  POSTGRES_PORT:             z.coerce.number().default(5432),
  POSTGRES_HOST_AUTH_METHOD: z.string().default('md5'),
  POSTGRES_SSL:              z.string().transform(v => v === 'true').default('false'),
  POSTGRES_POOL_MAX:         z.coerce.number().default(10),

  // GitHub
  GITHUB_TOKEN:          z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),

  // Auth
  SESSION_SECRET: z.string().min(32),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX:       z.coerce.number().default(100),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  for (const [field, msgs] of Object.entries(parsed.error.flatten().fieldErrors)) {
    console.error(`  ${field}: ${msgs?.join(', ')}`);
  }
  process.exit(1);
}

export const config = parsed.data;
```

Consume config anywhere via the `@backend` alias (already in `tsconfig.json`):

```ts
import { config } from '@backend/config.js';
```

NodeNext resolution requires `.js` on all imports even for `.ts` source files — this is enforced by the existing `tsconfig.json`.

**Optional variables** — use `.optional()` or `.default()` for anything that is not required in all environments:

```ts
// Only required in production
SENTRY_DSN: config.NODE_ENV === 'production'
  ? z.string().url()
  : z.string().url().optional(),
```

---

## 2. Error Layer

**File:** `src/errors.ts`

Defined before middleware — everything else depends on these types.

```ts
// src/errors.ts

export class AppError extends Error {
  constructor(
    public readonly status:  number,
    message:                 string,
    public readonly code?:   string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request') {
    super(400, message, 'BAD_REQUEST');
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, `${resource} not found`, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly fields?: Record<string, string[]>,
  ) {
    super(422, message, 'VALIDATION_ERROR');
  }
}

export class RateLimitError extends AppError {
  constructor() {
    super(429, 'Too many requests', 'RATE_LIMITED');
  }
}
```

**When to use each:**

| Error | Situation |
|---|---|
| `BadRequestError` | Malformed input that isn't a schema issue (e.g. invalid base64 cursor) |
| `UnauthorizedError` | Missing or invalid auth token |
| `ForbiddenError` | Authenticated but not permitted (wrong org, insufficient role, self-review) |
| `NotFoundError` | Row doesn't exist, or exists in a different org |
| `ConflictError` | State constraint violated (active run already exists, duplicate name) |
| `ValidationError` | Zod schema rejection — thrown by `validate()` middleware automatically |
| `RateLimitError` | Thrown by rate limiter middleware |

---

## 3. Logger

**File:** `src/logger.ts`

A single pino instance shared across the app. Structured JSON in production; pretty-printed in dev.

```ts
// src/logger.ts
import pino from 'pino';
import { config } from '@backend/config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  ...(config.NODE_ENV !== 'production' && {
    transport: {
      target:  'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' },
    },
  }),
});
```

Install: `npm install pino pino-pretty` in the `services/core` workspace.

Child loggers carry request context through the call stack without passing a logger argument:

```ts
// In a router handler, attach a child logger to req
req.log = logger.child({ requestId: req.id, orgId: req.orgId });

// In a service, receive the logger if needed
export class RunsService {
  async triggerRun(orgId: string, payload: ..., log: pino.Logger) {
    log.info({ repo: payload.repo }, 'triggering run');
    // ...
  }
}
```

Add `req.log` to the Express type augmentation in `middleware/auth.ts`:

```ts
declare global {
  namespace Express {
    interface Request {
      id?:    string;
      user?:  { id: string; orgId: string; role: Role };
      orgId?: string;
      log?:   pino.Logger;
    }
  }
}
```

---

## 4. App vs Server Split

The existing `app.ts` calls `app.listen()` inline, which starts a server on every import — including in tests. Split into `app.ts` (pure configuration) and `server.ts` (the entry point).

### `app.ts`

```ts
// src/app.ts
import express      from 'express';
import cors         from 'cors';
import helmet       from 'helmet';
import { json, urlencoded } from 'express';
import { config }           from '@backend/config.js';
import { requestId }        from '@backend/middleware/requestId.js';
import { requestLogger }    from '@backend/middleware/requestLogger.js';
import { globalRateLimiter} from '@backend/middleware/rateLimiter.js';
import { errorMiddleware }  from '@backend/middleware/error.js';
import { runsRouter }       from '@backend/features/runs/runs.router.js';
import { approvalsRouter }  from '@backend/features/approvals/approvals.router.js';
import { environmentsRouter}from '@backend/features/environments/environments.router.js';
import { githubWebhookRouter } from '@backend/webhooks/github.router.js';
import { sseRouter }           from '@backend/sse/sse.router.js';

export const app = express();

// Security headers — before anything else
app.use(helmet());

// CORS
app.use(cors({
  origin:      config.CORS_ORIGIN,
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
}));

// Body parsing — limit prevents large payload attacks
app.use(json({ limit: '256kb' }));
app.use(urlencoded({ extended: false, limit: '256kb' }));

// Observability
app.use(requestId);
app.use(requestLogger);

// Global rate limit (per-IP)
app.use(globalRateLimiter);

// Health — unauthenticated, before auth middleware
app.get('/healthz', (_req, res) => res.json({ ok: true }));
app.get('/readyz',  async (_req, res) => {
  // TODO: check DB connectivity
  res.json({ ok: true });
});

// Webhooks — use raw body parser (see webhook section)
app.use('/webhooks/github', githubWebhookRouter);

// SSE — long-lived connections
app.use('/stream', sseRouter);

// API routes
app.use('/runs',         runsRouter);
app.use('/approvals',    approvalsRouter);
app.use('/environments', environmentsRouter);

// Error handler — must be registered last
app.use(errorMiddleware);

export default app;
```

Install: `npm install helmet` in the `services/core` workspace.

### `server.ts`

```ts
// src/server.ts
import { app }    from '@backend/app.js';
import { config } from '@backend/config.js';
import { logger } from '@backend/logger.js';
import { getDb }  from '@backend/db/index.js';

const server = app.listen(config.SERVER_PORT, () => {
  logger.info({ port: config.SERVER_PORT }, '✅ Server started');
});

server.on('error', err => {
  logger.fatal({ err }, '❌ Server failed to start');
  process.exit(1);
});

// Graceful shutdown — finish in-flight requests before closing the DB pool
async function shutdown(signal: string) {
  logger.info({ signal }, 'Shutting down...');
  server.close(async () => {
    try {
      // Drain the pg pool
      const pool = (getDb() as any).session?.client?.pool;
      if (pool) await pool.end();
      logger.info('Shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  });

  // Force exit if shutdown takes longer than 10s
  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
```

Update `package.json`:
- `"main": "dist/src/server.js"`
- `"start": "node dist/src/server.js"`
- `"dev": "nodemon src/server.ts"` (already uses nodemon)

---

## 5. Middleware Layer

**Location:** `src/middleware/`

### `asyncHandler` — Eliminate Repetitive try/catch

Every async route handler currently needs `try { ... } catch (err) { next(err) }`. This wrapper removes it:

```ts
// src/middleware/asyncHandler.ts
import { RequestHandler, Request, Response, NextFunction } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

Usage in routers — compare before and after:

```ts
// Before
runsRouter.get('/:runId', async (req, res, next) => {
  try {
    const run = await service.getRun(req.params.runId!, req.user!.orgId);
    res.json(run);
  } catch (err) {
    next(err);
  }
});

// After
import { asyncHandler } from '@backend/middleware/asyncHandler.js';

runsRouter.get('/:runId', asyncHandler(async (req, res) => {
  const run = await service.getRun(req.params['runId']!, req.user!.orgId);
  res.json(run);
}));
```

### Request ID

```ts
// src/middleware/requestId.ts
import { RequestHandler } from 'express';
import { randomUUID }     from 'crypto';

export const requestId: RequestHandler = (req, res, next) => {
  req.id = (req.headers['x-request-id'] as string) ?? randomUUID();
  res.setHeader('x-request-id', req.id);
  next();
};
```

### Request Logger

```ts
// src/middleware/requestLogger.ts
import { RequestHandler } from 'express';
import { logger }         from '@backend/logger.js';

export const requestLogger: RequestHandler = (req, res, next) => {
  // Attach a child logger with request context for use in handlers
  req.log = logger.child({ requestId: req.id });

  const start = Date.now();
  res.on('finish', () => {
    req.log!.info({
      method:  req.method,
      path:    req.path,
      status:  res.statusCode,
      ms:      Date.now() - start,
      orgId:   req.orgId,
    }, 'request');
  });
  next();
};
```

### Auth Middleware

```ts
// src/middleware/auth.ts
import { RequestHandler } from 'express';
import { UnauthorizedError } from '@backend/errors.js';
import { config } from '@backend/config.js';
import jwt from 'jsonwebtoken';

type Role = 'admin' | 'reviewer' | 'member' | 'readonly';

declare global {
  namespace Express {
    interface Request {
      id?:    string;
      user?:  { id: string; orgId: string; role: Role };
      orgId?: string;
      log?:   import('pino').Logger;
    }
  }
}

interface JwtPayload {
  sub:   string;
  orgId: string;
  role:  Role;
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return next(new UnauthorizedError());

  try {
    const payload = jwt.verify(token, config.SESSION_SECRET) as JwtPayload;
    req.user = { id: payload.sub, orgId: payload.orgId, role: payload.role };
    next();
  } catch {
    next(new UnauthorizedError('Invalid or expired token'));
  }
};

export const requireRole = (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new ForbiddenError(`Requires one of: ${roles.join(', ')}`));
    }
    next();
  };
```

### Tenant Middleware

Verifies the authenticated user is an active member of their org and stamps `req.orgId`. All feature routers use this after `requireAuth` so controllers never trust a body-supplied org ID.

```ts
// src/middleware/tenant.ts
import { RequestHandler } from 'express';
import { ForbiddenError } from '@backend/errors.js';
import { getDb } from '@backend/db/index.js';
import { orgMembers } from '@backend/db/schemas/index.js';
import { and, eq } from 'drizzle-orm';
import { asyncHandler } from './asyncHandler.js';

export const requireTenant: RequestHandler = asyncHandler(async (req, _res, next) => {
  const { id: userId, orgId } = req.user!;
  const db = getDb();

  const [member] = await db
    .select({ role: orgMembers.role })
    .from(orgMembers)
    .where(and(eq(orgMembers.userId, userId), eq(orgMembers.orgId, orgId)))
    .limit(1);

  if (!member) return next(new ForbiddenError('Not a member of this organization'));

  req.orgId = orgId;
  next();
});
```

Apply in `app.ts` as a router-level middleware on all protected routes:

```ts
import { requireAuth }   from '@backend/middleware/auth.js';
import { requireTenant } from '@backend/middleware/tenant.js';

const protectedRouter = Router();
protectedRouter.use(requireAuth, requireTenant);
protectedRouter.use('/runs',         runsRouter);
protectedRouter.use('/approvals',    approvalsRouter);
protectedRouter.use('/environments', environmentsRouter);

app.use(protectedRouter);
```

### Validation Middleware

```ts
// src/middleware/validate.ts
import { RequestHandler } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '@backend/errors.js';

type Target = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, target: Target = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      return next(new ValidationError('Validation failed', flattenZodErrors(result.error)));
    }
    // Write back so coerced/defaulted values are available downstream
    (req as any)[target] = result.data;
    next();
  };
}

function flattenZodErrors(err: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const key = issue.path.join('.') || '_';
    (out[key] ??= []).push(issue.message);
  }
  return out;
}
```

### Rate Limiter

```ts
// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import { config } from '@backend/config.js';
import { RateLimitError } from '@backend/errors.js';

// Global: all routes
export const globalRateLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max:      config.RATE_LIMIT_MAX,
  handler:  (_req, _res, next) => next(new RateLimitError()),
  standardHeaders: true,
  legacyHeaders:   false,
});

// Strict: write operations (approve, trigger run)
export const strictRateLimiter = rateLimit({
  windowMs: 60_000,
  max:      10,
  handler:  (_req, _res, next) => next(new RateLimitError()),
  standardHeaders: true,
  legacyHeaders:   false,
});
```

Install: `npm install express-rate-limit` in the `services/core` workspace.

Apply `strictRateLimiter` on mutation routes:

```ts
runsRouter.post('/', strictRateLimiter, validate(TriggerRunBody), asyncHandler(async (req, res) => {
  const run = await service.triggerRun(req.orgId!, req.body);
  res.status(201).json(run);
}));
```

### Error Middleware

```ts
// src/middleware/error.ts
import { ErrorRequestHandler } from 'express';
import { AppError, ValidationError } from '@backend/errors.js';
import { logger } from '@backend/logger.js';

export const errorMiddleware: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    if (err.status >= 500) {
      logger.error({ err, requestId: req.id }, 'Server error');
    }
    return res.status(err.status).json({
      error: {
        message:    err.message,
        code:       err.code,
        requestId:  req.id,
        ...(err instanceof ValidationError && { fields: err.fields }),
      },
    });
  }

  logger.error({ err, requestId: req.id }, 'Unhandled error');
  res.status(500).json({
    error: { message: 'Internal server error', code: 'INTERNAL_ERROR', requestId: req.id },
  });
};
```

---

## 6. Router / Controller Layer

**Location:** `src/features/<domain>/<domain>.router.ts`

Routers own: parsing inputs, running `validate()`, calling the service, and sending the response. No business logic, no Drizzle imports, no direct DB calls.

```ts
// src/features/runs/runs.router.ts
import { Router }          from 'express';
import { asyncHandler }    from '@backend/middleware/asyncHandler.js';
import { validate }        from '@backend/middleware/validate.js';
import { strictRateLimiter } from '@backend/middleware/rateLimiter.js';
import { requireRole }     from '@backend/middleware/auth.js';
import { RunsService }     from './runs.service.js';
import { ListRunsQuery, TriggerRunBody } from './runs.schema.js';

export const runsRouter = Router();
const service = new RunsService();

// GET /runs
runsRouter.get('/',
  validate(ListRunsQuery, 'query'),
  asyncHandler(async (req, res) => {
    const result = await service.listRuns({
      orgId: req.orgId!,
      ...(req.query as ReturnType<typeof ListRunsQuery.parse>),
    });
    res.json(result);
  })
);

// GET /runs/:runId
runsRouter.get('/:runId', asyncHandler(async (req, res) => {
  const run = await service.getRun(req.params['runId']!, req.orgId!);
  res.json(run);
}));

// POST /runs  — requires reviewer+, strict rate limit
runsRouter.post('/',
  requireRole('admin', 'reviewer'),
  strictRateLimiter,
  validate(TriggerRunBody),
  asyncHandler(async (req, res) => {
    const run = await service.triggerRun(req.orgId!, req.body);
    res.status(201).json(run);
  })
);

// POST /runs/:runId/cancel
runsRouter.post('/:runId/cancel',
  requireRole('admin', 'reviewer'),
  asyncHandler(async (req, res) => {
    const run = await service.cancelRun(req.params['runId']!, req.orgId!, req.user!.id);
    res.json(run);
  })
);
```

---

## 7. Service Layer

**Location:** `src/features/<domain>/<domain>.service.ts`

Services own: business rules, authorization checks, state machine transitions, and cross-repository coordination. They never touch `req`/`res` or import from `drizzle-orm`.

```ts
// src/features/runs/runs.service.ts
import {
  NotFoundError, ForbiddenError, ConflictError, BadRequestError,
} from '@backend/errors.js';
import { getDb }         from '@backend/db/index.js';
import { broadcast }     from '@backend/sse/sse.router.js';
import { RunsRepository } from './runs.repository.js';
import { AuditRepository } from '@backend/features/audit/audit.repository.js';

interface ListParams {
  orgId:   string;
  repo?:   string;
  status?: string;
  cursor?: string;
  limit:   number;
}

export class RunsService {
  private runs  = new RunsRepository();
  private audit = new AuditRepository();

  async listRuns(params: ListParams) {
    return this.runs.list(params);
  }

  async getRun(runId: string, orgId: string) {
    const run = await this.runs.findById(runId);
    if (!run)              throw new NotFoundError('Run');
    if (run.orgId !== orgId) throw new ForbiddenError();
    return run;
  }

  async triggerRun(orgId: string, payload: {
    repo: string; branch: string; workflow: string;
  }) {
    // Business rule: no concurrent runs for the same repo+branch
    const active = await this.runs.findActive({
      orgId, repo: payload.repo, branch: payload.branch,
    });
    if (active) {
      throw new ConflictError(
        `An active run already exists for ${payload.repo}/${payload.branch}`
      );
    }

    const run = await this.runs.create({ orgId, ...payload, status: 'pending' });

    // Broadcast to all SSE clients in this org
    broadcast(orgId, 'run:created', run);
    return run;
  }

  async cancelRun(runId: string, orgId: string, actorId: string) {
    const run = await this.getRun(runId, orgId);  // validates org membership

    const cancellableStatuses = ['pending', 'running', 'awaiting'];
    if (!cancellableStatuses.includes(run.status)) {
      throw new BadRequestError(`Cannot cancel a run with status '${run.status}'`);
    }

    // Coordinate two repositories inside a single transaction
    const db = getDb();
    const updated = await db.transaction(async tx => {
      const updated = await this.runs.updateStatus(runId, 'cancelled', tx);
      await this.audit.log({
        orgId, actorId, action: 'run.cancel', resourceId: runId,
      }, tx);
      return updated;
    });

    broadcast(orgId, 'run:update', updated);
    return updated;
  }
}
```

**Key rule:** When a service method needs to write to multiple tables atomically, it creates a transaction and passes `tx` into each repository method. Repositories accept an optional `tx` argument.

---

## 8. Repository / Data Access Layer

**Location:** `src/features/<domain>/<domain>.repository.ts`

Repositories own all Drizzle queries. They return plain typed objects. Nothing outside a repository touches `drizzle-orm` operators.

```ts
// src/features/runs/runs.repository.ts
import { and, eq, lt, or, desc, isNull } from 'drizzle-orm';
import { getDb, type Db } from '@backend/db/index.js';
import { runs }           from '@backend/db/schemas/runs.js';

type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

export class RunsRepository {
  private db(tx?: Tx): Db | Tx { return tx ?? getDb(); }

  async list(params: {
    orgId: string; repo?: string; status?: string; cursor?: string; limit: number;
  }) {
    const { orgId, repo, status, cursor, limit } = params;

    let cursorFilter;
    if (cursor) {
      const decoded = Buffer.from(cursor, 'base64').toString();
      const sepIdx  = decoded.lastIndexOf(':');
      const ts      = decoded.slice(0, sepIdx);
      const id      = decoded.slice(sepIdx + 1);
      cursorFilter  = or(
        lt(runs.createdAt, new Date(ts!)),
        and(eq(runs.createdAt, new Date(ts!)), lt(runs.id, id!))
      );
    }

    const rows = await this.db()
      .select()
      .from(runs)
      .where(and(
        eq(runs.orgId, orgId),
        isNull(runs.deletedAt),                          // soft delete filter
        repo   ? eq(runs.repo, repo)     : undefined,
        status ? eq(runs.status, status) : undefined,
        cursorFilter,
      ))
      .orderBy(desc(runs.createdAt))
      .limit(limit + 1);

    const hasNext    = rows.length > limit;
    const page       = hasNext ? rows.slice(0, limit) : rows;
    const last       = page.at(-1);
    const nextCursor = hasNext && last
      ? Buffer.from(`${last.createdAt.toISOString()}:${last.id}`).toString('base64')
      : null;

    return { runs: page, nextCursor };
  }

  async findById(id: string, tx?: Tx) {
    const [row] = await this.db(tx).select().from(runs).where(
      and(eq(runs.id, id), isNull(runs.deletedAt))
    ).limit(1);
    return row ?? null;
  }

  async findActive(params: { orgId: string; repo: string; branch: string }, tx?: Tx) {
    const [row] = await this.db(tx)
      .select()
      .from(runs)
      .where(and(
        eq(runs.orgId,  params.orgId),
        eq(runs.repo,   params.repo),
        eq(runs.branch, params.branch),
        eq(runs.status, 'running'),
        isNull(runs.deletedAt),
      ))
      .limit(1);
    return row ?? null;
  }

  async create(data: typeof runs.$inferInsert, tx?: Tx) {
    const [row] = await this.db(tx).insert(runs).values(data).returning();
    return row!;
  }

  async updateStatus(id: string, status: string, tx?: Tx) {
    const [row] = await this.db(tx)
      .update(runs)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(runs.id, id), isNull(runs.deletedAt)))
      .returning();
    return row ?? null;
  }

  // Soft delete — preserves audit trail
  async softDelete(id: string, tx?: Tx) {
    const [row] = await this.db(tx)
      .update(runs)
      .set({ deletedAt: new Date() })
      .where(eq(runs.id, id))
      .returning();
    return row ?? null;
  }
}
```

**Transaction pattern:** The service creates the transaction and passes `tx` down. Repositories never create their own transactions.

```ts
// In a service method:
const db = getDb();
await db.transaction(async tx => {
  await this.runs.updateStatus(runId, 'cancelled', tx);
  await this.audit.log({ ... }, tx);
  // If either throws, both roll back automatically
});
```

---

## 9. Schema Layer

**Two kinds of schemas** live in this project:

### Drizzle Table Schemas — `src/db/schemas/`

One file per table. Export Drizzle table definitions and the inferred TypeScript types:

```ts
// src/db/schemas/runs.ts
import { pgTable, uuid, text, timestamp, real, index } from 'drizzle-orm/pg-core';

export const runs = pgTable('runs', {
  id:        uuid('id').primaryKey().defaultRandom(),
  orgId:     uuid('org_id').notNull(),
  repo:      text('repo').notNull(),
  branch:    text('branch').notNull(),
  workflow:  text('workflow').notNull(),
  commit:    text('commit'),
  status:    text('status').notNull().default('pending'),
  progress:  real('progress').default(0),
  duration:  text('duration'),
  trigger:   text('trigger').default('push'),
  author:    text('author'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  deletedAt: timestamp('deleted_at'),         // soft delete
}, table => [
  index('runs_org_created_idx').on(table.orgId, table.createdAt.desc()),
  index('runs_org_repo_idx').on(table.orgId, table.repo),
]);

export type Run    = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
```

Barrel re-export:

```ts
// src/db/schemas/index.ts
export * from './runs.js';
export * from './approvals.js';
export * from './environments.js';
export * from './orgMembers.js';
export * from './auditLog.js';
```

### Drizzle Relations — `src/db/relations.ts`

Define relations separately from the table file so they can import across schemas without circular dependencies:

```ts
// src/db/relations.ts
import { relations } from 'drizzle-orm';
import { runs, approvals, environments, orgMembers } from './schemas/index.js';

export const runsRelations = relations(runs, ({ one, many }) => ({
  approval: one(approvals, {
    fields:     [runs.id],
    references: [approvals.runId],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  run: one(runs, {
    fields:     [approvals.runId],
    references: [runs.id],
  }),
}));
```

Import relations in `db/index.ts`:

```ts
import * as schema    from '@backend/db/schemas/index.js';
import * as relations from '@backend/db/relations.js';

db = drizzle(pool, { schema: { ...schema, ...relations }, logger: ... });
```

This unlocks relational queries:

```ts
const run = await db.query.runs.findFirst({
  where: eq(runs.id, runId),
  with:  { approval: true },
});
```

### Zod Request Schemas — `src/features/<domain>/<domain>.schema.ts`

```ts
// src/features/runs/runs.schema.ts
import { z } from 'zod';

export const RunStatus = z.enum([
  'success', 'failed', 'running', 'deploying',
  'awaiting', 'pending', 'cancelled',
]);

export const ListRunsQuery = z.object({
  repo:   z.string().optional(),
  status: RunStatus.optional(),
  cursor: z.string().optional(),
  limit:  z.coerce.number().min(1).max(100).default(25),
});

export const TriggerRunBody = z.object({
  repo:     z.string().min(1),
  branch:   z.string().min(1),
  workflow: z.string().min(1),
});

export type RunStatus      = z.infer<typeof RunStatus>;
export type TriggerRunBody = z.infer<typeof TriggerRunBody>;
```

---

## 10. DB Layer

**File:** `src/db/index.ts`

Extends the existing singleton to pass schema + relations, tune the pool, and expose a typed `Db` type used across repositories:

```ts
// src/db/index.ts
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool }    from 'pg';
import { config }  from '@backend/config.js';
import { logger }  from '@backend/logger.js';
import * as schema    from '@backend/db/schemas/index.js';
import * as relations from '@backend/db/relations.js';

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (!_db) {
    const pool = new Pool({
      host:              config.POSTGRES_HOST,
      port:              config.POSTGRES_PORT,
      user:              config.POSTGRES_USER,
      password:          config.POSTGRES_PASSWORD,
      database:          config.POSTGRES_DB,
      ssl:               config.POSTGRES_SSL,
      max:               config.POSTGRES_POOL_MAX,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });

    pool.on('error', err => logger.error({ err }, 'pg pool error'));
    pool.on('connect', () => logger.debug('pg new connection'));

    _db = drizzle(pool, {
      schema: { ...schema, ...relations },
      logger: config.NODE_ENV === 'development',
    });
  }
  return _db;
}

export type Db = ReturnType<typeof getDb>;
```

**Migration workflow** — the existing npm scripts map to these operations:

| Script | When to run |
|---|---|
| `npm run db:generate` | After changing any `src/db/schemas/*.ts` file |
| `npm run db:migrate`  | On deploy (applies pending migrations to the target DB) |
| `npm run db:push`     | In local dev only — skips migration files, pushes schema directly |
| `npm run db:studio`   | Open Drizzle Studio to browse/edit data |
| `npm run db:check`    | In CI — fails if there are schema changes without a migration file |
| `npm run db:drop`     | Remove the most recent migration (dev only) |

Always run `db:check` in CI before `db:migrate` on deploy. Never use `db:push` against staging or production.

---

## 11. Webhook Layer

**Location:** `src/webhooks/`

GitHub sends events to `/webhooks/github`. The router validates the HMAC signature and hands off to an async queue — the endpoint always returns `202` within milliseconds.

```ts
// src/webhooks/github.router.ts
import { Router, raw } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';
import { config }  from '@backend/config.js';
import { logger }  from '@backend/logger.js';
import { webhookQueue } from './queue.js';

export const githubWebhookRouter = Router();

// raw() must come before json() for this route — wired directly in app.ts
githubWebhookRouter.post('/',
  raw({ type: 'application/json' }),
  (req, res) => {
    const sig    = req.headers['x-hub-signature-256'] as string | undefined;
    const digest = 'sha256=' + createHmac('sha256', config.GITHUB_WEBHOOK_SECRET)
      .update(req.body as Buffer)
      .digest('hex');

    if (!sig || !timingSafeEqual(Buffer.from(sig), Buffer.from(digest))) {
      logger.warn({ requestId: req.id }, 'Invalid webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const event   = req.headers['x-github-event'] as string;
    const payload = JSON.parse((req.body as Buffer).toString()) as Record<string, unknown>;

    webhookQueue.enqueue({ event, payload, requestId: req.id ?? '' });
    res.status(202).send();
  }
);
```

```ts
// src/webhooks/queue.ts
import { logger } from '@backend/logger.js';
import { handleWorkflowRun } from './handlers/workflowRun.js';
import { handleDeployment }  from './handlers/deployment.js';
import { handleCheckRun }    from './handlers/checkRun.js';

type Job = { event: string; payload: Record<string, unknown>; requestId: string };

const handlers: Record<string, (p: Record<string, unknown>) => Promise<void>> = {
  workflow_run:      handleWorkflowRun,
  deployment:        handleDeployment,
  deployment_status: handleDeployment,
  check_run:         handleCheckRun,
};

class WebhookQueue {
  private queue: Job[] = [];
  private busy  = false;

  enqueue(job: Job) {
    this.queue.push(job);
    if (!this.busy) this.drain();
  }

  private async drain() {
    this.busy = true;
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      const log = logger.child({ event: job.event, requestId: job.requestId });
      try {
        const handler = handlers[job.event];
        if (handler) {
          await handler(job.payload);
          log.info('webhook processed');
        } else {
          log.debug('no handler for event');
        }
      } catch (err) {
        log.error({ err }, 'webhook handler error');
      }
    }
    this.busy = false;
  }
}

export const webhookQueue = new WebhookQueue();
```

```ts
// src/webhooks/handlers/workflowRun.ts
import { getDb }    from '@backend/db/index.js';
import { runs }     from '@backend/db/schemas/runs.js';
import { broadcast } from '@backend/sse/sse.router.js';
import { eq }       from 'drizzle-orm';

export async function handleWorkflowRun(payload: Record<string, unknown>) {
  const wf     = payload['workflow_run'] as Record<string, unknown>;
  const status = mapGitHubStatus(wf['status'] as string, wf['conclusion'] as string | null);
  const db     = getDb();

  const [updated] = await db
    .update(runs)
    .set({ status, updatedAt: new Date() })
    .where(eq(runs.id, String(wf['id'])))
    .returning();

  if (updated) broadcast(updated.orgId, 'run:update', updated);
}

function mapGitHubStatus(status: string, conclusion: string | null): string {
  if (status === 'completed') return conclusion === 'success' ? 'success' : 'failed';
  if (status === 'in_progress') return 'running';
  return 'pending';
}
```

---

## 12. SSE Layer

**Location:** `src/sse/sse.router.ts`

Authenticated clients hold a persistent connection. Webhook handlers broadcast events through this layer.

```ts
// src/sse/sse.router.ts
import { Router } from 'express';
import { requireAuth }   from '@backend/middleware/auth.js';
import { requireTenant } from '@backend/middleware/tenant.js';
import { logger }        from '@backend/logger.js';

export const sseRouter = Router();

// orgId → Set of active Response objects
const clients = new Map<string, Set<import('express').Response>>();

export function broadcast(orgId: string, event: string, data: unknown) {
  const conns = clients.get(orgId);
  if (!conns?.size) return;

  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(msg); }
    catch { conns.delete(res); }
  }
}

sseRouter.get('/',
  requireAuth,
  requireTenant,
  (req, res) => {
    const orgId = req.orgId!;

    res.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',   // disable nginx response buffering
    });

    // Initial handshake
    res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    // Keep-alive ping every 25s (browser SSE timeout is typically 30s)
    const keepAlive = setInterval(() => {
      try { res.write(': ping\n\n'); }
      catch { cleanup(); }
    }, 25_000);

    if (!clients.has(orgId)) clients.set(orgId, new Set());
    clients.get(orgId)!.add(res);

    logger.debug({ orgId, total: clients.get(orgId)!.size }, 'SSE client connected');

    function cleanup() {
      clearInterval(keepAlive);
      clients.get(orgId)?.delete(res);
      if (clients.get(orgId)?.size === 0) clients.delete(orgId);
      logger.debug({ orgId }, 'SSE client disconnected');
    }

    req.on('close', cleanup);
  }
);
```

Events broadcast from anywhere in the app:

```ts
import { broadcast } from '@backend/sse/sse.router.js';

broadcast(orgId, 'approval:created', approval);
broadcast(orgId, 'run:update',       run);
broadcast(orgId, 'queue:change',     { pending: queueLength });
```

---

## 13. Testing Layer

**Location:** `src/**/*.test.ts`

The existing `app.test.ts` pattern is the right one — supertest against the exported `app`. Extend it per feature.

### Test Helpers

Shared setup utilities to avoid boilerplate across test files:

```ts
// src/__tests__/helpers.ts
import { vi } from 'vitest';

// Pre-built auth mock — import in any test that needs requireAuth bypassed
export function mockAuth(overrides?: Partial<Express.Request['user']>) {
  const user = {
    id: 'user-test-1', orgId: 'org-test-1', role: 'admin' as const,
    ...overrides,
  };
  vi.mock('@backend/middleware/auth.js', () => ({
    requireAuth: (_req: any, _res: any, next: any) => { _req.user = user; next(); },
    requireRole: () => (_req: any, _res: any, next: any) => next(),
  }));
  vi.mock('@backend/middleware/tenant.js', () => ({
    requireTenant: (_req: any, _res: any, next: any) => { _req.orgId = user.orgId; next(); },
  }));
  return user;
}

// Stub the SSE broadcaster so tests don't need connected clients
export function mockBroadcast() {
  vi.mock('@backend/sse/sse.router.js', () => ({ broadcast: vi.fn() }));
}
```

### Integration Tests (Router + Middleware)

```ts
// src/features/runs/runs.test.ts
import request   from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app       from '@backend/app.js';
import { mockAuth, mockBroadcast } from '@backend/__tests__/helpers.js';

mockAuth();
mockBroadcast();

vi.mock('./runs.service.js', () => ({
  RunsService: vi.fn().mockImplementation(() => ({
    listRuns:   vi.fn().mockResolvedValue({ runs: [], nextCursor: null }),
    getRun:     vi.fn().mockResolvedValue({ id: 'run-1', repo: 'frontend', status: 'success' }),
    triggerRun: vi.fn().mockResolvedValue({ id: 'run-2', status: 'pending' }),
    cancelRun:  vi.fn().mockResolvedValue({ id: 'run-1', status: 'cancelled' }),
  })),
}));

describe('GET /runs', () => {
  it('returns paginated list', async () => {
    const res = await request(app).get('/runs');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ runs: expect.any(Array), nextCursor: null });
  });

  it('rejects limit > 100', async () => {
    const res = await request(app).get('/runs?limit=999');
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('POST /runs', () => {
  it('creates a run with valid payload', async () => {
    const res = await request(app)
      .post('/runs')
      .send({ repo: 'frontend', branch: 'main', workflow: 'deploy' });
    expect(res.status).toBe(201);
  });

  it('rejects missing repo', async () => {
    const res = await request(app)
      .post('/runs')
      .send({ branch: 'main', workflow: 'deploy' });
    expect(res.status).toBe(422);
    expect(res.body.error.fields).toHaveProperty('repo');
  });
});
```

### Unit Tests (Service Layer)

```ts
// src/features/runs/runs.service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RunsService }    from './runs.service.js';
import { ConflictError, NotFoundError, BadRequestError } from '@backend/errors.js';

// Mock the entire module; individual methods set on the instance below
vi.mock('./runs.repository.js');
vi.mock('@backend/features/audit/audit.repository.js');
vi.mock('@backend/sse/sse.router.js', () => ({ broadcast: vi.fn() }));
vi.mock('@backend/db/index.js', () => ({
  getDb: () => ({ transaction: (fn: any) => fn({}) }),
}));

describe('RunsService', () => {
  let service: RunsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new RunsService();
  });

  describe('triggerRun', () => {
    it('throws ConflictError when a run is already active', async () => {
      (service as any).runs.findActive = vi.fn().mockResolvedValue({ id: 'r-1' });

      await expect(
        service.triggerRun('org-1', { repo: 'api', branch: 'main', workflow: 'deploy' })
      ).rejects.toThrow(ConflictError);
    });

    it('creates and broadcasts a run', async () => {
      (service as any).runs.findActive = vi.fn().mockResolvedValue(null);
      (service as any).runs.create     = vi.fn().mockResolvedValue({ id: 'r-2', orgId: 'org-1' });

      const result = await service.triggerRun('org-1', {
        repo: 'api', branch: 'main', workflow: 'deploy',
      });
      expect(result.id).toBe('r-2');
    });
  });

  describe('cancelRun', () => {
    it('throws BadRequestError for a completed run', async () => {
      (service as any).runs.findById = vi.fn().mockResolvedValue({
        id: 'r-1', orgId: 'org-1', status: 'success',
      });

      await expect(
        service.cancelRun('r-1', 'org-1', 'user-1')
      ).rejects.toThrow(BadRequestError);
    });
  });
});
```

### Webhook Tests

```ts
// src/webhooks/github.router.test.ts
import request        from 'supertest';
import { createHmac } from 'crypto';
import { describe, it, expect, vi } from 'vitest';
import app from '@backend/app.js';

vi.mock('./queue.js', () => ({ webhookQueue: { enqueue: vi.fn() } }));

const SECRET = 'test-secret-at-least-32-chars-long';

vi.mock('@backend/config.js', () => ({
  config: { GITHUB_WEBHOOK_SECRET: SECRET, NODE_ENV: 'test', /* ... */ },
}));

function sign(body: string) {
  return 'sha256=' + createHmac('sha256', SECRET).update(body).digest('hex');
}

describe('POST /webhooks/github', () => {
  it('accepts a valid signature', async () => {
    const body = JSON.stringify({ action: 'completed' });
    const res  = await request(app)
      .post('/webhooks/github')
      .set('x-github-event', 'workflow_run')
      .set('x-hub-signature-256', sign(body))
      .set('Content-Type', 'application/json')
      .send(body);
    expect(res.status).toBe(202);
  });

  it('rejects an invalid signature', async () => {
    const res = await request(app)
      .post('/webhooks/github')
      .set('x-hub-signature-256', 'sha256=bad')
      .set('Content-Type', 'application/json')
      .send('{}');
    expect(res.status).toBe(401);
  });
});
```

---

## Layer Summary

| Layer | File location | Imports from | Never imports |
|---|---|---|---|
| Config | `src/config.ts` | nothing | anything |
| Errors | `src/errors.ts` | nothing | anything |
| Logger | `src/logger.ts` | `config` | `features/`, `middleware/` |
| DB schemas | `src/db/schemas/*.ts` | `drizzle-orm` | `features/`, `middleware/` |
| DB relations | `src/db/relations.ts` | `db/schemas` | `features/`, `middleware/` |
| DB | `src/db/index.ts` | `config`, `logger`, `db/schemas`, `db/relations` | `features/`, `middleware/` |
| Middleware | `src/middleware/` | `errors`, `config`, `logger`, `db` | `features/` |
| Repository | `features/*/repository.ts` | `db`, `db/schemas` | other feature repositories |
| Service | `features/*/service.ts` | own repository, `errors`, `sse`, `db` | `middleware/`, Express types |
| Router | `features/*/router.ts` | own service, `middleware` | other feature services |
| Webhook | `src/webhooks/` | `db`, `sse`, `logger`, `config` | `features/` services |
| SSE | `src/sse/` | `middleware/auth`, `middleware/tenant`, `logger` | `features/` |
| App | `src/app.ts` | all routers, middleware | `features/` internals |
| Server | `src/server.ts` | `app`, `config`, `logger`, `db` | everything else |

**The key invariants:**
- Services never touch `req`/`res` or import from `express`
- Routers never contain business logic or import from `drizzle-orm`
- Transactions are created in the service layer and passed into repositories, never the other way around
- `broadcast()` is called from the service layer, never from repositories or routers
