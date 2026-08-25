# Upcoming Plan: Barcode Billing (Mobile Camera)

Add the ability to bill items by **scanning a product's barcode using the phone/tablet
camera**, with a fallback to **manually typing the item ID** (the number/code printed
in the barcode). No hardware barcode scanner is used.

---

## Current State (what exists today)

- `src/routes/_authenticated/billing.tsx` — billing page with:
  - Text search over products (matches `name` or `sku`) → click card to add to cart
  - Cart with quantity +/- controls, discount/tax/notes, payment collection
- Every product already has a **unique `sku`** (`src/lib/inventory-types.ts:21`)
- No barcode column exists yet; no camera/scanner logic anywhere

## Key Decisions

1. **What is the "barcode"?**
   Reuse the existing **`sku` field as the item ID / barcode value**.
   The camera decodes the barcode into text → we look up the product whose `sku`
   equals that text. A separate nullable `barcode` column can be added later
   (Phase 4) without changing this flow.

2. **How do we decode?**
   Use a browser-based barcode decoder — `html5-qrcode` or `@zxing/browser`
   (pure JS/WASM, no native deps). It opens `getUserMedia` camera stream and
   decodes 1D barcodes (EAN/UPC/Code128 — typical retail formats).

3. **HTTPS requirement**
   `getUserMedia` only works in secure contexts: production must be served over
   HTTPS (Cloudflare/Nitro target already is), and `localhost` works for dev.

4. **Manual entry stays first-class**
   A text input next to the scan button lets staff type/paste the item ID when
   the label is damaged, lighting is bad, or camera permission is denied.

---

## Phase 1 — Camera Scan-to-Bill on the Billing Page (core)

### Step 1: Product lookup by code
- [ ] Add helper `findProductByCode(code)` in `src/lib/billing.functions.ts`
      that queries `products` by exact case-insensitive `sku` match,
      filtered by `deleted_at is null`.
- [ ] Return `null` when not found so callers can show a clear error.

### Step 2: Scanner component
- [ ] Create `src/components/barcode-scanner.tsx`:
  - Dialog/Sheet containing the camera viewfinder.
  - Dynamically `import()` the decoder library so it never bloats the initial bundle.
  - Configure supported formats to 1D retail codes (EAN-13, EAN-8, UPC-A, Code128).
  - Prefer rear camera (`facingMode: "environment"`); add torch toggle if supported.
- [ ] Handle states: requesting-permission, active, permission-denied,
      no-camera-found, generic error — each with friendly message + retry.

### Step 3: Wire into billing page
- [ ] Add a prominent **"Scan"** button (camera icon) beside the product search box.
- [ ] On successful decode → close dialog → run `findProductByCode(decodedText)`:
  - Found & in stock → add to cart, clear search input, brief success flash/toast.
  - Found but out of stock → error toast (`Only N in stock` / out of stock).
  - Not found → toast: `No product with ID "<code>"`.
- [ ] Debounce/ignore duplicate consecutive decodes of the same code within ~1s
      (scanners fire continuously while aimed).
- [ ] Support **continuous mode**: after adding an item, stay in the viewfinder so
      multiple products can be scanned back-to-back without reopening the camera;
      overlay shows running item count + total.

### Step 4: Manual entry of item ID
- [ ] Text input next to the Scan button: type/paste barcode value → press Enter
      or tap **"＋ Add"** → same `findProductByCode` flow as a scan.
- [ ] Update placeholder: *"Scan barcode or enter item ID / name…"*

### Step 5: Cart behaviour
- [ ] Scanning the same product again increments quantity (reuse `addToCart`).
- [ ] Respect stock limits — block exceeding available quantity.
- [ ] Briefly highlight the newly added row in the cart list.

### Step 6: Verify end-to-end
- [ ] `npm run lint` then `npm run build`.
- [ ] Manual test on real phone (HTTPS): scan EAN-13 / Code128 labels → item added;
      unknown code → error toast; repeat scan increments qty; out-of-stock blocked.
- [ ] Test manual ID entry path and permission-denied path.
- [ ] Verify desktop fallback: camera button hidden or shows graceful message
      when no camera exists.

---

## Phase 2 — Polish & Reliability

- [ ] Auto-restart stream after tab switch/app backgrounding (mobile browsers
      often kill the stream).
- [ ] Show last N decoded attempts inside the scanner dialog for quick correction.
- [ ] Performance: cap resolution/frame rate for low-end devices.
- [ ] Accessibility: labelled controls, focus trap in dialog, ESC closes.

## Phase 3 — Barcode Management on Products Page

- [ ] On `products.tsx`, make it explicit that **SKU = barcode value**
      (helper text under SKU field: *"This is the value encoded in the barcode"*).
- [ ] Optional: "Print label" button rendering a simple SKU + name sticker page.

---

## Phase 4 — Dedicated `barcode` Column (future, only if needed)

Only needed if products must support **both** an internal SKU *and* a different EAN/UPC
printed on manufacturer packaging.

- [ ] Migration: `alter table products add column barcode text unique` (nullable, per-org uniqueness).
- [ ] Update generated types (`src/integrations/supabase/types.ts`) and `inventory-types.ts`.
- [ ] Lookup order in `findProductByCode`: `barcode` first, then `sku`.
- [ ] Products form gets an optional Barcode field; CSV import gains a `barcode` column.

---

## Files Expected to Change

| File | Change |
| --- | --- |
| `src/components/barcode-scanner.tsx` | NEW — camera scanner dialog (lazy-loaded decoder) |
| `src/routes/_authenticated/billing.tsx` | Scan button, manual ID entry, wire decode → cart |
| `src/lib/billing.functions.ts` | `findProductByCode()` helper |
| `package.json` | `html5-qrcode` or `@zxing/browser` dependency |
| `src/routes/_authenticated/products.tsx` | (Phase 3) SKU-as-barcode hint |
| DB migration | (Phase 4 only) `barcode` column |

## Risks / Gotchas

- **Camera needs HTTPS + user permission** — plan the denied/blocked UI early.
- **Decoding speed varies** by device/lighting; prefer libraries with WASM decoding
  (`@zxing/browser`) and restrict formats to 1D codes.
- iOS Safari requires the video element be `playsinline` and muted.

## Out of Scope (for now)

- Receipt printing changes (existing bill HTML/print stays as-is)
- Inventory receiving by barcode (scan-in stock) — candidate for a future plan
- Weighted-barcode / scale-integrated items
