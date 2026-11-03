# StockLine

A full-featured **retail inventory and billing management system** — think "Shopify meets Square, in React." Built for shopkeepers who need to track stock, sell products at the counter, and manage their supply chain from one place.

> Built with [TanStack Start](https://tanstack.com/start), [Supabase](https://supabase.com), [Tailwind CSS v4](https://tailwindcss.com), and [Recharts](https://recharts.org).

---

## ✨ Features

### 🏪 Billing & POS (Counter)

- **Barcode scanning** via phone/tablet camera — scan products on the fly with `@zxing/browser` (WASM decoding for EAN-13, EAN-8, UPC-A, Code128). No hardware scanner needed.
- **Manual entry fallback** — type or paste the product ID when labels are damaged or camera is unavailable.
- **Quick add to cart** — scan or type, instantly resolve to a product, then confirm quantity.
- **Continuous mode** — keep the camera open for back-to-back scans; overlay shows running item count + total.
- **Smart cart** — increment/decrement quantities, remove items, respect stock limits.
- **Bill creation & printing** — generate professional HTML bills, print directly, or download as HTML.
- **Payment collection** — cash, UPI (with QR code link), card, and other methods. Change calculator for cash payments.
- **Bill history** — review past invoices with payment status.

### 📦 Products

- **Full CRUD** — add, edit, delete products with validation (unique SKU, unique barcode, positive prices/quantities).
- **SKU & barcode fields** — `sku` is the lookup key; barcode is optional but scannable.
- **CSV import/export** — bulk-add products from CSV with row-level error reporting and template download.
- **Categories & suppliers** — choose existing or create new categories and suppliers per product.
- **Stock levels & reorder thresholds** — automated "low" alerts; auto-suggest reorder quantities.
- **Supplier messaging** — request reorders directly from a product page (email or call links pre-filled).

### 📊 Dashboard

- **Critical metrics** — today's sale amount, money to collect (pending dues), items finished, running low.
- **Health check banner** — green when all clear, amber when attention is needed.
- **Sales trend chart** — area chart over today / 7-day / 30-day range.
- **Top selling items** — real-time ranking by units sold.
- **Recent bills** — latest customer transactions.
- **Low-stock alert sheet** — drill into items needing reorder; tap to jump to products.
- **Pull-to-refresh** with sync pill showing update status.
- **Time-range selector** — Today / Last 7 days / Last 30 days.

### 🏭 Suppliers

- **CRUD** — add, edit, delete supplier records.
- **Contact management** — name, email (mailto link), phone (tel link), address.

### 📋 Transactions (Audit Log)

- Full audit log of every stock-in (`in`) and stock-out (`out`) movement.
- View product name, SKU, quantity, notes, and timestamps.

### 👥 Members

- Team member management with role display.

### 🛡️ Admin Portal

- **Organization lifecycle** — approve, reject, suspend organizations; cascade status changes to all members.
- **User management** — view users across all orgs, see roles and status.
- **Platform-wide stats** — organization counts (total/pending/approved/rejected), user counts, signup trends over 30 days (dual-bar chart).

---

## 🧩 Architecture

| Layer | Technology |
|-------|-----------|
| Framework | TanStack Start (React 19) |
| Router | TanStack Router (file-based) |
| Database | Supabase (Postgres + Auth + RLS) |
| Server State | TanStack Query |
| UI Library | shadcn-style Radix UI primitives + Tailwind CSS v4 |
| Charts | Recharts |
| Barcode Decoder | `@zxing/browser` (lazy-loaded, WASM) |
| Payments | Cash, UPI (QR + clipboard link), Card, Other |

### Auth Model

Three role levels with redirect logic:

| Role | Redirect target |
|------|----------------|
| `super_admin` | → `/admin` portal |
| `admin` | → `/dashboard` |
| `staff` | → `/billing` (POS-first) |

### Key Design Decisions

- **Barcode = SKU reuse**: The `sku` field doubles as the barcode value decoded by the camera. A separate nullable `barcode` column can be added later (Phase 4 migration) without changing the flow.
- **Camera requires HTTPS**: `getUserMedia` only works in secure contexts. Dev runs on localhost; production must be served over HTTPS (Nitro/Cloudflare target handles this).
- **iOS Safari compatibility**: Video element uses `playsinline muted` to prevent fullscreen takeover.
- **Decoder lazy-loaded**: `@zxing/browser` is dynamically imported only when the scanner dialog opens, keeping initial bundle size minimal.
- **Debounced duplicate decodes**: Scanners fire continuously while aimed; same decode within 1 second is ignored.
- **Stock-limit enforcement**: Cart never exceeds available product quantity; out-of-stock items block additions with clear error toasts.
- **Barcode column migration-safe**: The `products.barcode` column is optional. If migration hasn't been applied, writes still succeed without the field and errors are surfaced clearly rather than silently dropped.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 22+
- Bun 1.3+ (recommended, faster install)
- A Supabase project ([create one here](https://supabase.com))

### Setup

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env  # then fill in your Supabase URL + key

# Run dev server
npm run dev
```

The app loads at http://localhost:5173 (or your configured port). Make sure you have a `local` database provisioned in Supabase.

### Build

```bash
npm run build       # Production build catches type errors
npm run preview    # Preview the production build
npm run lint        # ESLint + Prettier formatting checks
```

Verification = `lint` then `build`, in that order.

---

## 🗂️ Project Structure

```
src/
├── components/
│   ├── barcode-scanner.tsx    # Camera scanner dialog (lazy-loaded decoder)
│   ├── pull-to-refresh.tsx   # Mobile refresh gesture wrapper
│   ├── reveal.tsx             # Staggered content reveal animation
│   └── ui/                    # Radix-based shadcn-style UI primitives
├── hooks/
│   └── use-profile.ts         # Current user profile hook
├── integrations/
│   └── supabase/              # Auto-generated client + types (do not edit)
├── lib/
│   ├── inventory-types.ts     # Shared TypeScript domain types
│   ├── billing.functions.ts   # Server-side billing helpers
│   └── csv-import.ts          # CSV parsing & template builder
├── routes/                    # File-based TanStack Router routes
│   ├── __root.tsx            # Root layout
│   ├── index.tsx             # Role-aware landing redirect
│   ├── auth.tsx               # Login page
│   └── _authenticated/       # Authenticated routes
│       ├── dashboard.tsx     # Sales overview
│       ├── billing.tsx       # POS + bill creation
│       ├── products.tsx      # Product CRUD + CSV import
│       ├── suppliers.tsx     # Supplier CRUD
│       ├── transactions.tsx # Stock audit log
│       ├── members.tsx       # Team members
│       ├── admin.tsx         # Super admin portal
│       └── route.tsx         # Auth guard
└── router.tsx                 # Router + QueryClient config
```

---

## 📄 License

MIT
