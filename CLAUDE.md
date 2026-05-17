# Project: Refresh

A GitHub and AWS wrapper to help organizations and their teams track and manage workflows from development to deployment. Project tech stack includes TypeScript, React, React Router, CSS Modules, Vite, Zod, Zustand, Node.js, Express.js, PostgreSQL, Drizzle ORM, Docker, AWS CDK, and AWS.

## Code Style

- TypeScript strict mode, no `any` types
- Use named exports, not default exports
- CSS Modules

## Commands

- `docker compose up`: Starts vite dev server, node server, and postgres in their own containers
- `npm run test`: Run vitest tests
- `npm run test:staged`: Run related vitest tests only
- `npm run test:integration`: Run supertest tests (coming soon)
- `npm run test:e2e`: Run Playwright end-to-end tests (coming soon)
- `npm run lint`: ESLint check
- `npm run format`: Run Prettier formatting
- `npm run types-check`: Run TypeScript types check
- `npm run db:generate`: Generate SQL migrations from schema changes
- `npm run db:migrate`: Apply pending migrations
- `npm run db:push`: Push schema directly to DB (dev only)
- `npm run db:studio`: Open Drizzle Studio
- `npm run db:check`: Check for migration issues
- `npm run db:drop`: Drop a migration

## Architecture

- `/server/src`: Express server with MVC architecture and service layer
- `/client/src`: React components, pages, and logic
- `/infra`: AWS CDK IaC

## Important Notes

- NEVER commit .env files
