-- Session 16 units of measure: optional per-item pack conversion.
-- items.unit stays the base (stocking) unit; pack_size/pack_unit describe a
-- purchasing pack, e.g. pack_unit 'case' with pack_size 24 means 1 case = 24 base units.

ALTER TABLE items
  ADD COLUMN pack_size numeric(10,3) CHECK (pack_size IS NULL OR pack_size > 0),
  ADD COLUMN pack_unit varchar(32);

ALTER TABLE items
  ADD CONSTRAINT items_pack_pair_check
    CHECK ((pack_size IS NULL) = (pack_unit IS NULL));
