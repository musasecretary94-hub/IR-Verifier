-- IR Verifier: database schema (SQLite). Safe to run again (IF NOT EXISTS).
-- Rules that protect the data are written HERE, in the database itself,
-- so even a bug in the server cannot break them.

PRAGMA foreign_keys = ON;

-- The registry of polling units (synthetic in the demo).
CREATE TABLE IF NOT EXISTS polling_units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  ward        TEXT NOT NULL,
  lga         TEXT NOT NULL,
  state       TEXT NOT NULL,
  registered  INTEGER NOT NULL CHECK (registered >= 0)
);
CREATE INDEX IF NOT EXISTS idx_pu_state ON polling_units(state);
CREATE INDEX IF NOT EXISTS idx_pu_lga   ON polling_units(state, lga);
CREATE INDEX IF NOT EXISTS idx_pu_ward  ON polling_units(state, lga, ward);

-- Agents (one polling unit each) and admins (reviewers).
CREATE TABLE IF NOT EXISTS users (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  username         TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  role             TEXT NOT NULL CHECK (role IN ('agent', 'admin')),
  polling_unit_id  INTEGER REFERENCES polling_units(id),
  active           INTEGER NOT NULL DEFAULT 1,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK ((role = 'agent' AND polling_unit_id IS NOT NULL) OR (role = 'admin' AND polling_unit_id IS NULL))
);

-- One row for every attempt an agent makes. Values never change after insert.
CREATE TABLE IF NOT EXISTS submissions (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  polling_unit_id  INTEGER NOT NULL REFERENCES polling_units(id),
  version          INTEGER NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  agent_id         INTEGER NOT NULL REFERENCES users(id),
  serial_no        TEXT,
  registered       INTEGER,
  accredited       INTEGER,
  issued           INTEGER,
  unused           INTEGER,
  spoiled          INTEGER,
  rejected         INTEGER,
  valid_total      INTEGER,
  used_total       INTEGER,
  total_valid_row  INTEGER,
  image_file       TEXT NOT NULL,
  image_hash       TEXT NOT NULL,
  image_type       TEXT NOT NULL,
  agent_note       TEXT,
  sheet_json       TEXT NOT NULL,
  review_reason    TEXT,
  reviewer_id      INTEGER REFERENCES users(id),
  reviewed_at      TEXT,
  submitted_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (polling_unit_id, version)
);
-- Only ONE approved result per polling unit, and only ONE waiting for review.
CREATE UNIQUE INDEX IF NOT EXISTS one_approved_per_pu ON submissions(polling_unit_id) WHERE status = 'approved';
CREATE UNIQUE INDEX IF NOT EXISTS one_pending_per_pu  ON submissions(polling_unit_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sub_hash   ON submissions(image_hash);
CREATE INDEX IF NOT EXISTS idx_sub_serial ON submissions(serial_no);
CREATE INDEX IF NOT EXISTS idx_sub_status ON submissions(status);

CREATE TABLE IF NOT EXISTS party_votes (
  submission_id  INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  party          TEXT NOT NULL,
  votes          INTEGER NOT NULL CHECK (votes >= 0),
  words          TEXT,
  PRIMARY KEY (submission_id, party)
);
CREATE INDEX IF NOT EXISTS idx_pv_party ON party_votes(party);

-- What the checks found. A finding is a prompt for a human, never an accusation.
CREATE TABLE IF NOT EXISTS findings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id  INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  code           TEXT NOT NULL,
  severity       TEXT NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
  details        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_findings_sub ON findings(submission_id);

-- Who did what, and when. Cannot be edited or deleted.
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,
  username   TEXT,
  action     TEXT NOT NULL,
  entity     TEXT,
  entity_id  INTEGER,
  detail     TEXT,
  ip         TEXT,
  at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---- Protection rules (triggers) ----
-- 1. The numbers, the photo and the agent of a submission can never be changed.
CREATE TRIGGER IF NOT EXISTS submissions_values_locked
BEFORE UPDATE OF polling_unit_id, version, agent_id, serial_no, registered, accredited, issued, unused,
  spoiled, rejected, valid_total, used_total, total_valid_row, image_file, image_hash, image_type,
  agent_note, sheet_json, submitted_at ON submissions
BEGIN
  SELECT RAISE(ABORT, 'submitted values cannot be changed');
END;

-- 2. Once approved or rejected, the decision is final.
CREATE TRIGGER IF NOT EXISTS submissions_decision_final
BEFORE UPDATE ON submissions
WHEN OLD.status IN ('approved', 'rejected')
BEGIN
  SELECT RAISE(ABORT, 'a decision is final');
END;

-- 3. Votes cannot be edited or deleted one by one.
CREATE TRIGGER IF NOT EXISTS party_votes_locked
BEFORE UPDATE ON party_votes
BEGIN
  SELECT RAISE(ABORT, 'votes cannot be changed');
END;

CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log
BEGIN SELECT RAISE(ABORT, 'the audit log cannot be changed'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log
BEGIN SELECT RAISE(ABORT, 'the audit log cannot be changed'); END;
