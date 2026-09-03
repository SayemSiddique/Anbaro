ALTER TABLE items
  DROP CONSTRAINT IF EXISTS items_pack_pair_check;

ALTER TABLE items
  DROP COLUMN IF EXISTS pack_size,
  DROP COLUMN IF EXISTS pack_unit;
