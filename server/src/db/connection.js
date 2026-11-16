// Opens the SQLite database and makes sure the tables exist.
// Uses "node:sqlite", which is built into Node 22 (nothing to install).
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = path.join(__dirname, 'schema-app.sql');

function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec(fs.readFileSync(SCHEMA, 'utf8'));
  return db;
}

// Runs fn inside a transaction: everything is saved, or nothing is.
function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
    throw err;
  }
}

// Rows from node:sqlite have no prototype; copy them into plain objects.
const plain = (row) => (row ? { ...row } : row);
const plainAll = (rows) => rows.map((r) => ({ ...r }));

module.exports = { openDb, transaction, plain, plainAll };
