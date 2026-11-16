const { hashPassword, verifyPassword, DUMMY_HASH } = require('../security/passwords');

function createUser(db, { username, password, role, pollingUnitCode = null }) {
  if (!/^[a-z0-9._-]{3,40}$/.test(username || '')) throw new Error('Username must be 3-40 letters, numbers, dot, dash or underscore (lower case)');
  let puId = null;
  if (role === 'agent') {
    const pu = db.prepare('SELECT id FROM polling_units WHERE code = ?').get(pollingUnitCode);
    if (!pu) throw new Error('Unknown polling unit code: ' + pollingUnitCode);
    puId = pu.id;
  }
  const hash = hashPassword(password);
  const r = db.prepare('INSERT INTO users (username, password_hash, role, polling_unit_id) VALUES (?, ?, ?, ?)').run(username, hash, role, puId);
  return Number(r.lastInsertRowid);
}

// Returns the user row, or null. Takes the same time whether or not the username exists.
function authenticate(db, username, password) {
  const user = typeof username === 'string'
    ? db.prepare('SELECT id, username, password_hash, role, polling_unit_id, active FROM users WHERE username = ?').get(username.toLowerCase())
    : null;
  const ok = verifyPassword(typeof password === 'string' ? password : '', user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok || !user.active) return null;
  return { id: user.id, username: user.username, role: user.role, pollingUnitId: user.polling_unit_id };
}

module.exports = { createUser, authenticate };
