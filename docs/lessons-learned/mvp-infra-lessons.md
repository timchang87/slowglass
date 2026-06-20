# Lessons Learned: mvp-infra

## 1. Root vs Workspace Config

Anything needed by every workspace (vitest, coverage config, shared devDependencies) should be configured at root and hoisted via npm workspaces. Workspace-level config should only contain what diverges from the root.

## 2. `-ws --if-present` as a Smell

If a script needs to run the same way everywhere, it belongs at root. `-ws --if-present` is a signal the package should be hoisted and the script centralized. `-ws` is reserved for scripts whose underlying commands differ per workspace.

## 3. Per-Workspace Build Scripts

Scripts like `build` and `dev` share the same name across workspaces but execute different commands (`vite build` vs `tsc`), so their implementations must live at the workspace level and be orchestrated from root via `-ws`.

## 4. Vitest Default Config Breaks Multi-Workspace Setups

Without a root `vitest.config.ts`, vitest falls back to defaults: one environment, no path aliases, no setup files. This cannot satisfy workspaces with diverging requirements (`jsdom` vs `node`, `@frontend/*` vs `@backend/*`, different `setupFiles`). The `projects` API is the correct solution — each project gets its own isolated config while running under one vitest process.

## 5. Root `tsconfig.json` Covers Tooling, Not Runtime

Without a root `tsconfig.json`, root-level `.ts` files (like `vitest.config.ts`) are invisible to ESLint and the IDE language server. Vitest itself is unaffected since it uses esbuild for transpilation, not tsc. These are independent systems and should not be conflated.

## 6. `noEmit` Conflicts with `composite`

`noEmit: true` prevents TypeScript from emitting `.d.ts` files, which `composite` mode requires. Use `emitDeclarationOnly: true` instead — it satisfies `composite` while still letting Vite handle JS output.

## 7. ESLint TypeScript Parser Config Should Be Consistent

Either all workspaces own their parser config via a workspace-level `.eslintrc.cjs`, or everything is handled at root via overrides. Mixing both creates duplication and blind spots. Pick one pattern and apply it consistently across all workspaces.

## 8. `infra/` as a Top-Level Workspace

Infrastructure isn't app code and has its own lifecycle. It should be a peer workspace with separate test gates, deploy pipelines, and CI/CD events — not nested inside a service. Promoting it to top-level makes that boundary explicit.

## 9. ESLint `packageDir` Must Include Root in a Monorepo

The `import/no-extraneous-dependencies` rule uses `packageDir` to know which `package.json` files to check when validating imports. When a package is hoisted to root, the workspace-level `packageDir` must include the root path — otherwise ESLint won't find the dependency and will incorrectly flag it as extraneous.

`__dirname` in a workspace config resolves to the workspace directory. `path.resolve(__dirname, '../')` goes one level up — which in a nested workspace like `services/core/` is `services/`, not the root. Use `path.resolve(__dirname, '../../')` to reach the root. Always pass both the workspace directory and the root to `packageDir` in a monorepo.
