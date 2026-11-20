-- Event-only arcade credits and scores. No wagering or cash-out.
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','closed')),
  starting_credits INTEGER NOT NULL DEFAULT 500 CHECK(starting_credits BETWEEN 0 AND 50000),
  max_sessions_per_profile INTEGER NOT NULL DEFAULT 1 CHECK(max_sessions_per_profile BETWEEN 1 AND 100),
  max_award_per_spin INTEGER NOT NULL DEFAULT 5000 CHECK(max_award_per_spin BETWEEN 0 AND 50000),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  command_seq INTEGER NOT NULL DEFAULT 0,
  ack_seq INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_machines_event ON machines(event_id);
CREATE TABLE IF NOT EXISTS machine_nonces (
  machine_id TEXT NOT NULL REFERENCES machines(id),
  nonce TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  PRIMARY KEY(machine_id, nonce)
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  display_name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  pin_salt TEXT NOT NULL,
  pin_digest TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(event_id,name_key)
);
CREATE TABLE IF NOT EXISTS checkin_links (
  token_hash TEXT PRIMARY KEY,
  machine_id TEXT NOT NULL REFERENCES machines(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  expires_at INTEGER NOT NULL,
  claim_id TEXT,
  used_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_links_expiry ON checkin_links(expires_at);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES events(id),
  machine_id TEXT NOT NULL REFERENCES machines(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  credits INTEGER NOT NULL CHECK(credits >= 0),
  total_score INTEGER NOT NULL DEFAULT 0 CHECK(total_score >= 0),
  state TEXT NOT NULL DEFAULT 'active' CHECK(state IN ('active','ended')),
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_machine ON sessions(machine_id) WHERE state='active';
CREATE INDEX IF NOT EXISTS idx_sessions_profile ON sessions(event_id,profile_id);
CREATE TABLE IF NOT EXISTS spin_tokens (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  token_hash TEXT NOT NULL UNIQUE,
  cost INTEGER NOT NULL CHECK(cost IN (50,150)),
  state TEXT NOT NULL DEFAULT 'issued' CHECK(state IN ('issued','consumed','void')),
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_issued_spin ON spin_tokens(session_id) WHERE state='issued';
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  token_id TEXT NOT NULL UNIQUE REFERENCES spin_tokens(id),
  session_id TEXT NOT NULL REFERENCES sessions(id),
  event_id TEXT NOT NULL REFERENCES events(id),
  machine_id TEXT NOT NULL REFERENCES machines(id),
  award INTEGER NOT NULL CHECK(award >= 0),
  client_result_hash TEXT,
  flagged INTEGER NOT NULL DEFAULT 0 CHECK(flagged IN (0,1)),
  played_at INTEGER,
  received_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scores_event ON scores(event_id);
