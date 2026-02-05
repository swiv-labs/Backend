-- Add pnl and roi columns to predictions
ALTER TABLE predictions
  ADD COLUMN IF NOT EXISTS pnl bigint DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roi double precision DEFAULT 0;
