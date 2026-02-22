-- Create waitlist table
CREATE TABLE IF NOT EXISTS waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  x_username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);
CREATE INDEX IF NOT EXISTS idx_waitlist_x_username ON waitlist(x_username);
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON waitlist(created_at DESC);

-- Add comments
COMMENT ON TABLE waitlist IS 'Stores waitlist signups for early access';
COMMENT ON COLUMN waitlist.x_username IS 'Twitter/X username without @ symbol';
COMMENT ON COLUMN waitlist.email IS 'User email address';
