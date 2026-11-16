-- Independent Result Verifier: database schema (SQLite)
-- Run once to create the tables. Safe to run again (IF NOT EXISTS).

PRAGMA foreign_keys = ON;

-- The registry: every polling unit we know about (synthetic for the prototype).
CREATE TABLE IF NOT EXISTS polling_units (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  code        TEXT NOT NULL UNIQUE,      -- e.g. '29-20-02-003' (state-lga-ra-pu)
  name        TEXT NOT NULL,
  ward        TEXT NOT NULL,
  lga         TEXT NOT NULL,
  state       TEXT NOT NULL,
  registered  INTEGER                    -- registered voters, from the registry
);

-- One row per uploaded result sheet photo.
CREATE TABLE IF NOT EXISTS sheets (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  polling_unit_id  INTEGER REFERENCES polling_units(id),
  image_path       TEXT NOT NULL,
  image_hash       TEXT NOT NULL,        -- to spot the same photo uploaded twice
  serial_no        TEXT,
  election         TEXT NOT NULL,        -- key into config/elections.js (party list)
  status           TEXT NOT NULL DEFAULT 'received'
                   CHECK (status IN ('received','needs_review','clean','validated')),
  uploaded_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sheets_pu   ON sheets(polling_unit_id);
CREATE INDEX IF NOT EXISTS idx_sheets_hash ON sheets(image_hash);

-- The count boxes #1 to #8 for each sheet.
-- A NULL value means "could not be read", not zero.
-- 'source' says whether the number came from the AI or was fixed by a person.
CREATE TABLE IF NOT EXISTS results (
  sheet_id          INTEGER PRIMARY KEY REFERENCES sheets(id) ON DELETE CASCADE,
  registered        INTEGER,   -- #1
  accredited        INTEGER,   -- #2
  issued            INTEGER,   -- #3
  unused            INTEGER,   -- #4
  spoiled           INTEGER,   -- #5
  rejected          INTEGER,   -- #6
  valid_total       INTEGER,   -- #7
  used_total        INTEGER,   -- #8
  valid_total_row   INTEGER,   -- "Total valid votes" line at the bottom
  readability       TEXT,      -- JSON: how readable each field was
  image_quality     TEXT,      -- ok | poor | blank
  source            TEXT NOT NULL DEFAULT 'ai' CHECK (source IN ('ai','human'))
);

-- One row per party per sheet.
CREATE TABLE IF NOT EXISTS party_votes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id     INTEGER NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
  party        TEXT NOT NULL,
  figures      INTEGER,        -- votes written in figures (NULL = unreadable)
  words        TEXT,           -- votes written in words, as read
  readability  TEXT,           -- clear | unclear | illegible
  UNIQUE (sheet_id, party)
);

-- What the checks found. A finding is a prompt for a human, not an accusation.
CREATE TABLE IF NOT EXISTS findings (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id       INTEGER REFERENCES sheets(id) ON DELETE CASCADE,  -- NULL for area-level findings
  area_level     TEXT CHECK (area_level IN ('ward','lga','state','country')),
  area_name      TEXT,
  code           TEXT NOT NULL,          -- 'A1', 'B1', 'E2' ...
  severity       TEXT NOT NULL CHECK (severity IN ('error','warning','info')),
  details        TEXT,                   -- JSON with the numbers involved
  status         TEXT NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','confirmed','dismissed','needs_info')),
  reviewer_note  TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_findings_sheet ON findings(sheet_id);

-- Announced totals that the admin types in, to compare with our own totals.
CREATE TABLE IF NOT EXISTS announced_totals (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level       TEXT NOT NULL CHECK (level IN ('ward','lga','state','country')),
  area_name   TEXT NOT NULL,
  party       TEXT NOT NULL,
  votes       INTEGER NOT NULL,
  UNIQUE (level, area_name, party)
);

-- Who changed what, and when. Every human correction goes here.
CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sheet_id    INTEGER REFERENCES sheets(id) ON DELETE SET NULL,
  field       TEXT NOT NULL,
  old_value   TEXT,
  new_value   TEXT,
  changed_by  TEXT NOT NULL,
  changed_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
