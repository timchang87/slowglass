--- PHASE 1: FOUNDATIONS ---

[ ] 1. Migrate compute from EC2 ASG to ECS
      - This is a significant architectural shift (all of CI/CD, blue/green, and ephemeral
        test environments depend on ECS)
      - Define ECS cluster, task definitions, and services for frontend and backend
      - Replace EC2 launch templates and ASG in CDK with ECS equivalents
      - Update networking module to route ALB traffic to ECS target groups
      - Validate staging deployment end-to-end before proceeding

[ ] 2. Set up Prisma for DB migrations
      - Create prisma/schema.prisma matching current DB schema
      - Generate and apply initial migration
      - Replace raw pg queries in server/src/db/index.ts with Prisma client
      - Add migration step to CI and deploy pipeline

[ ] 3. Extend CDK to manage all environments including RDS
      - Add RDS Postgres resource (currently running DB in Docker on EC2)
      - Apply global seed data on RDS startup
      - Complete production environment in infra/environments/production/
      - Add test environment configuration (long-lived, stood up with cdk deploy
        before a work session, torn down after — not ephemeral per CI run)
      - Ensure cdk destroy fully tears down test and prod to reduce cost

--- PHASE 2: LOCAL TESTING ---

[ ] 4. Fix unit tests and integrate MSW locally
      - Resolve missing jsdom dependency in client tests
      - Create MSW handlers and setup files (dependency installed but not integrated)
      - Fix server tests failing due to DB connection (Docker not running locally)

[ ] 5. Set up React component integration tests (component to component)
      - Add testing-library integration tests beyond basic App.test.tsx
      - Write component-to-component interaction test examples

[ ] 6. Add DB transaction harness for supertests
      - Test environment is a long-lived RDS instance stood up via cdk deploy
        with global seed data — not spun up per run
      - Implement transaction rollback per test for isolation so supertests run fast
        against the already-running DB

[ ] 7. Configure Playwright tests
      - Create playwright.config.ts at root
      - Write initial e2e test suite targeting the test environment

--- PHASE 3: CI/CD ---

[ ] 8. Add GitHub CI workflow (build, test, push to ECR, deploy to production)
      - Build Docker images for frontend and backend
      - Run static tests, unit tests, supertests against test environment
      - Push images to ECR
      - Deploy to production

[ ] 9. Add GitHub workflow for Claude PR review
      - Create .github/workflows/claude-pr-review.yml
      - Trigger on pull_request events

[ ] 10. Implement ECS blue/green deployment with lifecycle hooks for Playwright
       - Configure CodeDeploy blue/green for ECS services
       - Add AfterAllowTestTraffic lifecycle hook to run Playwright e2e tests
       - Block traffic shift to production until e2e tests pass

--- LOCAL TOOLING ---

[ ] 11. Add Claude PR review as a local project skill
       - Create a /review-pr slash command skill runnable manually in Claude Code
       - Not a pre-commit hook — invoked on demand before pushing

--- PHASE 4: CACHING, QUEUING & KNOWLEDGE GRAPH ---

[ ] 12. Add Redis for caching on ECS
       - Provision ElastiCache (Redis) via CDK
       - Integrate Redis client in Express server for response caching
       - Cache frequently read data (e.g. journal entries, analytics aggregates)
       - Deploy Redis alongside existing ECS services

[ ] 13. Add Redis + BullMQ for job queuing on ECS
       - Add BullMQ workers as a separate ECS service/task definition
       - Define queues for background jobs (e.g. analytics processing, notifications)
       - Configure dead-letter queues and retry policies
       - Expose job status endpoints from Express server

[ ] 14. Add Redis + FalkorDB + Graphiti for knowledge graph on ECS
       - Provision FalkorDB (Redis-compatible graph DB) via CDK or ECS task
       - Integrate Graphiti for temporal knowledge graph layer over journal entries
       - Use graph queries to surface relationships between journal entries, themes, and CBT concepts
       - Deploy as a separate ECS service alongside the backend

[ ] 15. Add event-driven ingestion for external data sources
       - Ingest third-party activity data automatically (e.g. Strava webhooks for workouts)
       - Route incoming webhook events through BullMQ for async processing
       - Normalize and store ingested events alongside manual journal entries
       - Use ingested data as context in knowledge graph and analytics (e.g. correlate mood with workout activity)
       - Design ingestion layer to support additional sources over time (e.g. sleep trackers, calendar)

Resource: https://claude.ai/chat/29df2d09-4854-49b6-8d19-14a72e7230d0