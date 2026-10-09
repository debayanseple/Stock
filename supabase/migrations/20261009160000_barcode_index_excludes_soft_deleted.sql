-- Soft-deleted products must release their barcode, mirroring the SKU fix
-- in 20261008120000_scope_sku_and_category_uniqueness.
--
-- uq_products_barcode_org (20261008000000) had no deleted_at predicate, so
-- soft-deleted rows held their barcodes forever while the importer only ever
-- lists live rows (deleted_at IS NULL). Bulk CSV upload therefore failed with
-- "duplicate key value violates unique constraint uq_products_barcode_org"
-- even though the UI had already confirmed every barcode was free.
--
-- uq_products_sku_live already excludes deleted rows, so this brings barcode
-- and SKU into the same rule: deleting a product releases both its SKU and
-- its Product ID for reuse.
DROP INDEX IF EXISTS uq_products_barcode_org;

CREATE UNIQUE INDEX IF NOT EXISTS uq_products_barcode_live
  ON public.products (org_id, barcode)
  WHERE deleted_at IS NULL
    AND barcode IS NOT NULL
    AND barcode <> '';

-- Keep the scan lookup aligned with the new predicate so billing only
-- matches barcodes of live products.
DROP INDEX IF EXISTS idx_products_barcode;
CREATE INDEX IF NOT EXISTS idx_products_barcode_live
  ON public.products (barcode)
  WHERE deleted_at IS NULL;