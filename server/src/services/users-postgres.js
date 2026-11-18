const { hashPassword, verifyPassword, DUMMY_HASH } = require('../security/passwords');

async function createUser(pool, { username, password, role, pollingUnitCode = null }) {
  if (!/^[a-z0-9._-]{3,40}$/.test(username || '')) {
    throw new Error('Username must be 3-40 letters, numbers, dot, dash or underscore (lower case)');
  }

  let pollingUnitId = null;

  if (role === 'agent') {
    const result = await pool.query(
      'SELECT id FROM polling_units WHERE code = $1',
      [pollingUnitCode]
    );

    if (result.rows.length === 0) {
      throw new Error('Unknown polling unit code: ' + pollingUnitCode);
    }

    pollingUnitId = result.rows[0].id;
  }

  const hash = hashPassword(password);

  const result = await pool.query(
    `INSERT INTO users
      (username, password_hash, role, polling_unit_id)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [username, hash, role, pollingUnitId]
  );

  return result.rows[0].id;
}

async function authenticate(pool, username, password) {
  const user = typeof username === 'string'
    ? (
        await pool.query(
          `SELECT id, username, password_hash, role, polling_unit_id, active
           FROM users
           WHERE username = $1`,
          [username.toLowerCase()]
        )
      ).rows[0]
    : null;

  const ok = verifyPassword(
    typeof password === 'string' ? password : '',
    user ? user.password_hash : DUMMY_HASH
  );

  if (!user || !ok || !user.active) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    pollingUnitId: user.polling_unit_id,
  };
}

module.exports = { createUser, authenticate };
