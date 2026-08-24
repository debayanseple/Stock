<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

## Project Overview

- **Framework**: TanStack Start (React 19) with SSR
- **Router**: TanStack Router (file-based, `src/routes/`)
- **Auth/DB**: Supabase (JWT auth + Postgres)
- **Styling**: Tailwind CSS v4 + Radix UI primitives
- **State**: TanStack Query (server state), React context (router context)
- **Build**: Vite with `@lovable.dev/vite-tanstack-config` (wraps TanStack Start, Nitro, React, Tailwind, tsConfigPaths)
- **Target**: Cloudflare (via Nitro) by default

## Key Commands

```bash
npm run dev        # Start dev server (Vite)
npm run build      # Production build (Vite + Nitro)
npm run build:dev  # Dev-mode build
npm run preview    # Preview production build
npm run lint       # ESLint (includes Prettier via plugin)
npm run format     # Prettier write
```

**Order matters**: `lint -> build` (lint catches type errors Prettier won't)

## Architecture Notes

### Entry Points

- `src/start.ts` — TanStack Start config: registers `attachSupabaseAuth` (client functionMiddleware) and `errorMiddleware` (server requestMiddleware). **This is the real app entrypoint.**
- `src/server.ts` — Nitro/SSR entry (wraps TanStack Start's server entry). Handles catastrophic SSR errors (h3-swallowed 500s) and renders `error-page.tsx`.
- `src/router.tsx` — Creates router with `routeTree.gen.ts`, configures QueryClient with background refetch for `products`, `categories`, `transactions` (5min interval).

### Auth Flow

- **Client**: `attachSupabaseAuth` (src/integrations/supabase/auth-attacher.ts) attaches bearer token to all `serverFn` calls.
- **Server**: `requireSupabaseAuth` (auth-middleware.ts) validates JWT, creates scoped Supabase client, injects `{ supabase, userId, claims }` into function context.
- **Route guard**: `_authenticated/route.tsx` `beforeLoad` checks session, profile status (`approved`), org status (not `suspended`/`rejected`), and role (`super_admin` → `/admin`).

### Supabase Integration

- Generated clients in `src/integrations/supabase/` — **do not edit directly** (marked auto-generated).
- `client.ts` — browser client (anon key)
- `client.server.ts` — server client (service role)
- `types.ts` — generated DB types
- Env vars required: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (validated in `requireSupabaseAuth`)

### Routing

- File-based under `src/routes/`
- `_authenticated/` — protected layout with sidebar nav
- `auth.tsx` — login/signup
- `pending.tsx` — waiting-for-approval screen
- Route tree generated to `src/routeTree.gen.ts` (do not edit)

### Path Aliases

- `@/*` → `src/*` (configured in tsconfig.json and Vite)

### Error Handling

- `src/lib/error-capture.ts` — captures last thrown error for SSR error pages
- `src/lib/error-page.tsx` — HTML error page renderer
- Both `server.ts` and `start.ts` middleware render this on 500

## Conventions

- **TypeScript**: strict mode, no unused vars/params errors (disabled in eslint), verbatimModuleSyntax off
- **ESLint**: TS recommended + react-hooks + react-refresh + prettier; forbids `server-only` import
- **Prettier**: 100 printWidth, semi, double quotes, trailing commas
- **Components**: Radix UI primitives in `src/components/ui/`, shadcn-style
- **Server functions**: Use `createServerFn` with `requireSupabaseAuth` middleware for protected endpoints

## Gotchas

1. **Vite config is minimal** — `@lovable.dev/vite-tanstack-config` injects most plugins. Don't manually add TanStack, React, Tailwind, Nitro, etc.
2. **SSR entry is `src/server.ts`** (not `src/entry-server.tsx`) — configured in `vite.config.ts` `tanstackStart.server.entry: "server"`
3. **Supabase auth attacher must be `functionMiddleware`** (not `requestMiddleware`) or browser won't send tokens to serverFns
4. **Route tree is generated** — run `npm run dev` or build to regenerate after adding routes
5. **No test framework configured** — add Vitest/Playwright if needed
6. **Nitro uses Cloudflare target by default** — check `.output/` or `.vinxi/` for build artifacts
7. **Background sync keys** in `router.tsx` — update if adding new globally-fresh queries
