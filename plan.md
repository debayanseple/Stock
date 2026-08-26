# Plan — Barcode Billing (Mobile Camera)

Small, independently shippable features broken down from `upcoming-plan.md`.
Execute features in order; each one ends in a working app (`npm run lint` → `npm run build`,
plus the manual check listed). Check off `[x]` when a feature is merged.

---

## Feature 0 — Dependency & scaffold

- [ ] **F0.1 Add decoder library**
      - `npm install @zxing/browser` (WASM decoding, better low-light speed than html5-qrcode)
      - Note: bunfig 24h supply-chain guard may reject brand-new versions — pin a released
        version if needed.
      - Verify: `npm run build` passes, bundle size roughly unchanged (nothing imported yet).

## Feature 1 — Product lookup by code

- [ ] **F1.1 `findProductByCode(code)` helper**
      - File: `src/lib/billing.functions.ts`
      - Query `products` where `lower(sku) = lower(code)`, `deleted_at is null`, scoped to
        caller's org (same pattern as existing queries in this file).
      - Return `Product | null` — `null` means "not found" (caller shows error toast).
      - Verify: unit-callable from billing page; lint + build pass.

## Feature 2 — Scanner component

- [ ] **F2.1 Static shell of scanner dialog**
      - New file: `src/components/barcode-scanner.tsx`
      - Dialog with video viewfinder area, status line, Cancel button.
      - Props: `open`, `onClose`, `onDetected(text)`, optional `continuous`.
      - Not wired anywhere yet. Verify: renders when mounted in isolation.
- [ ] **F2.2 Lazy-load decoder + camera stream**
      - Dynamic `import("@zxing/browser")` only when dialog opens (keep initial bundle slim).
      - `navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } })`.
      - `<video playsInline muted>` (required by iOS Safari).
      - Restrict decode formats to EAN-13, EAN-8, UPC-A, Code128.
- [ ] **F2.3 State handling**
      - States: idle → requesting-permission → active | permission-denied | no-camera |
        error. Each non-active state shows a friendly message + Retry button.
      - Stop all tracks on close/unmount (no leaked camera).
- [ ] **F2.4 Debounce duplicate decodes**
      - Ignore same decoded text within 1s of the last accepted decode.

## Feature 3 — Wire scan → cart on billing page

- [ ] **F3.1 Scan button**
      - File: `src/routes/_authenticated/billing.tsx` (~line 580, beside search input).
      - Camera icon button opens the scanner dialog. Hidden on desktop-without-camera:
        feature-detect `navigator.mediaDevices`; fallback to graceful message.
- [ ] **F3.2 Decode handler**
      - `onDetected(text)` → `findProductByCode(text)`:
        - found & stock > 0 → `addToCart(product)` (existing helper, line 475)
        - found & stock 0 → error toast `Out of stock`
        - not found → toast `No product with ID "<code>"`
- [ ] **F3.3 Continuous mode**
      - After a successful add, keep the viewfinder open; overlay shows running item count
        + cart total so staff can scan back-to-back. Close via Cancel only.
- [ ] **F3.4 Stock-limit guard**
      - Re-scan of an already-in-cart product increments qty but never above available
        stock (extend `addToCart`, respect `product.quantity`).

## Feature 4 — Manual item-ID entry

- [ ] **F4.1 ID entry input**
      - Text input beside Scan button: Enter or "＋ Add" button runs the same decode
        handler as F3.2. Clear input after add.
      - Update search placeholder to: `Scan barcode or enter item ID / name…`

## Feature 5 — Cart feedback

- [ ] **F5.1 Highlight newly added row**
      - After add-to-cart, flash-highlight that row for ~800ms (CSS class + timeout).
      - Verify visually on phone.

## Feature 6 — End-to-end verification gate

- [ ] **F6.1 Manual test matrix** (real phone over HTTPS):
      - EAN-13 / Code128 label scans → added; unknown code → toast; repeat scan → qty+1;
        out-of-stock blocked; permission-denied path shows friendly UI; manual ID entry works;
        backgrounding the tab then returning recovers the stream (see F7.1).
- [ ] **F6.2 Desktop fallback check** — no camera present → scanner shows clear message,
      page still fully usable via search/manual entry.

---

## Phase 2 polish (after core ships)

- [ ] **F7.1 Stream auto-restart** on visibilitychange/focus (mobile browsers kill streams
      in background).
- [ ] **F7.2 Recent decodes list** — last N attempts inside scanner dialog for quick correction.
- [ ] **F7.3 Perf caps** — limit resolution/frame rate for low-end devices.
- [ ] **F7.4 A11y** — labelled controls, focus trap, ESC closes dialog.

## Phase 3 — Products page barcode awareness

- [ ] **F8.1 SKU hint text** — under SKU field in products form: "This is the value encoded
      in the barcode".
- [ ] **F8.2 Optional: Print label** — simple sticker page rendering SKU + product name.

## Phase 4 — Dedicated `barcode` column (only if needed later)

- [ ] **F9.1 Migration** — `alter table products add column barcode text unique` (nullable,
      per-org uniqueness); regenerate Supabase types.
- [ ] **F9.2 Lookup order** — `findProductByCode`: match `barcode` first, then `sku`.
- [ ] **F9.3 UI/import** — optional Barcode field in product form; `barcode` column in CSV import.

---

## Risks to keep in mind while executing

- Camera requires HTTPS + user permission — denied/blocked UI lands in F2.3, do not defer.
- iOS Safari: video must be `playsinline` + muted (F2.2), else fullscreen takeover.
- Keep decoder lazy-loaded (F2.2) — it is WASM-heavy.

## Out of scope (unchanged from upcoming-plan.md)

Receipt printing changes · scan-in stock receiving · weighted/scale barcodes.
