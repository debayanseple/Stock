## Goal

Convert StockLine into a multi-tenant SaaS. Each customer is an **organization** with isolated inventory data. New signups (user + org) are held in a **pending** state until the **super admin** (`zerotheorys@gmail.com`) approves them from an admin portal.

## Database changes (single migration)

1. **`organizations`** table: `name`, `status` (`pending` | `approved` | `rejected`), `created_by`, `approved_at`, `approved_by`.
2. **`profiles`** table (1:1 with `auth.users`): `org_id`, `full_name`, `email`, `status` (`pending` | `approved` | `rejected`).
3. **`app_role`** enum: add `super_admin` value (alongside existing `admin`, `staff`).
4. **`org_id`** column on: `products`, `categories`, `suppliers`, `transactions`, `supplier_messages`.
5. **Backfill**: seed the super admin's org from `zerotheorys@gmail.com` (if account exists) and assign all existing rows to that org. Grant `super_admin` role. Sign-up bootstrap trigger promotes the account to super_admin + approved on first login even if not yet registered.
6. **Signup trigger** on `auth.users` INSERT:
   - Creates `profiles` row with `status='pending'` and the org name from `user_metadata.org_name`.
   - Creates `organizations` row with `status='pending'`, links `profile.org_id`.
   - Assigns default `admin` role scoped to that org (so the first user of a new org can manage their own team later).
7. **RLS rewrite** for `products`, `categories`, `suppliers`, `transactions`, `supplier_messages`:
   - SELECT/INSERT/UPDATE/DELETE: only rows where `org_id = current_user_org()` AND caller's profile is `approved`.
   - `super_admin` bypasses org filter (can view all data).
8. **`organizations` / `profiles` RLS**:
   - Users can read their own profile + their own org.
   - Super admin can read/update all.
9. Helper security-definer fns: `current_user_org()`, `is_approved(user)`, keep existing `has_role()`.

## Approval gate

- Modify `_authenticated/route.tsx` `beforeLoad`: after `getUser()`, fetch profile status.
  - `approved` → continue to app.
  - `pending` → redirect to `/pending` (new public route showing "Awaiting approval" + sign-out button).
  - `rejected` → redirect to `/pending?rejected=1`.

## Super admin portal

New route `/admin` (under `_authenticated`, gated by `super_admin` role):

- **Pending approvals**: list of orgs with pending status, each showing org name + owner email/name. Approve / Reject buttons.
- **All organizations**: list with status, member count, created date. Actions: suspend/reactivate.
- Uses server functions with `requireSupabaseAuth` + super_admin check.

Sidebar shows an "Admin" nav item only for super admin.

## Signup UI

`auth.tsx` sign-up form adds a required **Organization name** field. Success message becomes: "Account created — an administrator will approve your access shortly."

## Data isolation in the app

All existing CRUD in `products.tsx`, `categories.tsx`, `suppliers.tsx`, `transactions.tsx`, dashboard queries: RLS handles reads automatically. Inserts get `org_id` from a small `useOrgId()` hook that reads the current user's profile once (React Query cached).

## Notifications (light-touch)

For the "email super admin on new signup" part of the answer, I'll defer full email templating and instead:

- Show a toast + red dot on the Admin nav when pending approvals exist (polled every 60s).
- Note in the plan: full email notification can be added later via Lovable Emails (requires domain setup).

## Technical details

- Files created: `src/routes/pending.tsx`, `src/routes/_authenticated/admin.tsx`, `src/lib/org.functions.ts` (server fns for approve/reject/list), `src/hooks/use-profile.ts`.
- Files modified: `src/routes/_authenticated/route.tsx` (gate + admin nav), `src/routes/auth.tsx` (org field), `src/routes/_authenticated/products.tsx` / `categories.tsx` / `suppliers.tsx` / `transactions.tsx` (attach `org_id` on insert), `src/routes/_authenticated/dashboard.tsx` (unchanged, RLS scopes it).
- One migration with schema + backfill + RLS.
- `types.ts` regenerates after migration approval.

## Out of scope

- Email notifications to super admin on new signup (mentioned but deferred).
- Org-level user invitation / team management inside a customer org.
- Billing / plans.
