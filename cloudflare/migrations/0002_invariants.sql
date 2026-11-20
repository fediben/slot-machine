-- Stronger invariants for multi-kiosk contests and editable event settings.
CREATE TABLE IF NOT EXISTS event_settings (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  key TEXT NOT NULL CHECK(key IN ('leaderboard_title','theme_slug','privacy_notice')),
  value TEXT NOT NULL,
  PRIMARY KEY (event_id,key)
);
CREATE TRIGGER IF NOT EXISTS session_event_and_limit BEFORE INSERT ON sessions BEGIN
  SELECT CASE WHEN NOT EXISTS(
    SELECT 1 FROM profiles p JOIN events e ON p.event_id=e.id
    JOIN machines m ON m.event_id=e.id
    WHERE p.id=NEW.profile_id AND e.id=NEW.event_id AND m.id=NEW.machine_id
      AND e.state='active' AND m.enabled=1
  ) THEN RAISE(ABORT,'SESSION_EVENT_MISMATCH') END;
  SELECT CASE WHEN (
    SELECT COUNT(*) FROM sessions WHERE event_id=NEW.event_id AND profile_id=NEW.profile_id
  ) >= (
    SELECT max_sessions_per_profile FROM events WHERE id=NEW.event_id
  ) THEN RAISE(ABORT,'SESSION_LIMIT_REACHED') END;
END;
CREATE TRIGGER IF NOT EXISTS score_origin_guard BEFORE INSERT ON scores BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM spin_tokens t JOIN sessions s ON s.id=t.session_id
      JOIN events e ON e.id=s.event_id
    WHERE t.id=NEW.token_id AND t.state='consumed' AND s.id=NEW.session_id
      AND s.event_id=NEW.event_id AND s.machine_id=NEW.machine_id AND s.state='active'
      AND NEW.award BETWEEN 0 AND e.max_award_per_spin
      AND s.credits >= t.cost
  ) THEN RAISE(ABORT,'SCORE_ORIGIN_INVALID') END;
END;
CREATE INDEX IF NOT EXISTS idx_spin_expiry ON spin_tokens(state,expires_at);
