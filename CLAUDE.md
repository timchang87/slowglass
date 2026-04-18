# Project: Refresh

Mental health personal journal blog with analytics features powered by concepts from psychology and cognitive behavioral therapy. Project tech stack includes TypeScript, React, React Router, Tailwind, Vite, Zod, Zustand, Node.js, Express.js, PostgreSQL, Drizzle ORM, Docker, Terraform, and AWS.

## Code Style

- TypeScript strict mode, no `any` types
- Use named exports, not default exports
- Tailwind CSS

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
- `/infra`: Terraform IaC

## Important Notes

- NEVER commit .env files
