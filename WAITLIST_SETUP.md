# Waitlist Feature

## Database Setup

Run the following migration in your Supabase SQL editor to create the waitlist table:

```sql
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
```

Or simply run the migration file:
```bash
# In your Supabase SQL editor, paste the contents of:
backend/migrations/002_create_waitlist_table.sql
```

## API Endpoints

### POST /api/waitlist/join
Join the waitlist

**Request Body:**
```json
{
  "xUsername": "string",
  "email": "string"
}
```

**Response (201):**
```json
{
  "status": "success",
  "message": "Successfully joined the waitlist!",
  "data": {
    "id": "uuid",
    "xUsername": "string",
    "email": "string",
    "createdAt": "timestamp"
  }
}
```

**Error Responses:**
- 409: User already on waitlist
- 400: Validation error

### GET /api/waitlist
Get all waitlist entries (Admin)

**Query Parameters:**
- `limit` (optional): Number of entries per page (default: 50)
- `offset` (optional): Starting index (default: 0)

### GET /api/waitlist/stats
Get waitlist statistics

**Response:**
```json
{
  "status": "success",
  "message": "Waitlist stats retrieved successfully",
  "data": {
    "total": 123
  }
}
```

## Frontend Integration

The waitlist form is integrated in the `/waitlist` app and automatically:
- Validates X username and email
- Shows success/error messages
- Handles duplicate entries
- Disables inputs during submission
- Clears form on success

## Environment Variables

### Backend (.env)
Already configured in your existing backend setup

### Frontend (waitlist/.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:3001
```

For production, update to your production API URL.
