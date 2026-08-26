## Project Overview

- **Framework**: TanStack Start (React 19) with SSR
- **Router**: TanStack Router (file-based, `src/routes/`)
- **Auth/DB**: Supabase (JWT auth + Postgres)
- **Styling**: Tailwind CSS v4 + Radix UI primitives (shadcn-style in `src/components/ui/`)
- **State**: TanStack Query (server state)
- **Build**: Vite via `@lovable.dev/vite-tanstack-config` wrapper; Nitro bundles for Cloudflare target by default

## Key Commands

```bash
npm run dev        # Dev server (also regenerates routeTree.gen.ts)
npm run lint       # ESLint incl. Prettier checks (the only static check)
npm run build      # Production build (Vite + Nitro) — catches type errors
npm run preview    # Preview production build
```

- **No test framework and no `typecheck` script exist.** Verification = `lint` then `build`, in that order (lint catches formatting issues, build catches type errors).
- Never rewrite pushed git history (no force-push/rebase of published commits) — external tooling syncs from this branch.

## Architecture Notes

### Entry Points

- `src/start.ts` — real app entrypoint: registers `attachSupabaseAuth` (functionMiddleware) and `errorMiddleware` (requestMiddleware).
- `src/server.ts` — Nitro/SSR entry, wired via `vite.config.ts` (`tanstackStart.server.entry: "server"`). Wraps TanStack's server entry to catch h3-swallowed 500s and render the error page.
- `src/router.tsx` — router + QueryClient. `BACKGROUND_SYNC_KEYS` here controls queries that refetch every 5 min in background (`products`, `categories`, `transactions`) — update when adding globally-fresh data.

### Auth Flow

- Client → `attachSupabaseAuth` attaches bearer token to all serverFn calls.
- Server → `requireSupabaseAuth` validates JWT, injects `{ supabase, userId, claims }` into function context.
- Route guard `_authenticated/route.tsx` `beforeLoad`: session required, profile must be `approved`, org not `suspended`/`rejected`, `super_admin` redirected to `/admin`.

### Supabase Integration

- `src/integrations/supabase/` is **auto-generated — do not edit** (`client.ts` browser, `client.server.ts` service-role, `types.ts` DB types). Regenerate types after schema changes.
- Env vars `SUPABASE_URL` + `SUPABASE_PUBLISHABLE_KEY` are validated at request time in `requireSupabaseAuth`; if missing, every protected call throws.

### Data Access — two patterns coexist

1. **Client-direct**: browser Supabase client guarded by RLS (most route files, `billing.functions.ts`). Multi-step writes go through Postgres RPCs (e.g. `create_bill_with_stock`) defined in `supabase/migrations/`.
2. **Server functions**: `createServerFn` + `requireSupabaseAuth` middleware (e.g. `invites.functions.ts`) — use for logic that must not ship to the client or needs elevated trust.

Schema changes ship as SQL migration files under `supabase/migrations/` (Supabase CLI config in `supabase/config.toml`).

## Conventions & Gotchas

1. **Vite config stays minimal** — the `@lovable.dev/vite-tanstack-config` wrapper already injects TanStack, React, Tailwind, Nitro, tsConfigPaths plugins; adding them again breaks the build.
2. **Auth attacher must stay `functionMiddleware`** — switching to `requestMiddleware` silently stops tokens being sent to serverFns.
3. **Generated files**: never hand-edit `src/routeTree.gen.ts` (run dev/build to regenerate) or anything in `src/integrations/supabase/`.
4. **Routing**: file-based under `src/routes/`; conventions documented in `src/routes/README.md`. Root layout is `__root.tsx` — preserve its `<Outlet />`.
5. **ESLint forbids `server-only` imports** — TanStack Start isn't Next.js; name server modules `*.server.ts` instead.
6. **TS config**: strict mode but `noUnusedLocals`/`noUnusedParameters` off; Prettier enforced through ESLint (100 printWidth, double quotes).
7. **Two lockfiles are tracked** (`bun.lock` + `package-lock.json`) — npm is the active installer; regenerate both consistently if you change dependencies.
8. **bunfig.toml supply-chain guard**: package versions published <24h ago are rejected on install; new excludes require user confirmation.
