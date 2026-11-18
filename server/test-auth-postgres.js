const { load } = require('./src/config/env');
const { openPostgres } = require('./src/db/postgres');
const { createUser } = require('./src/services/users-postgres');
const { sign } = require('./src/security/tokens');
const { requireAuth } = require('./src/middleware/auth-postgres');

(async () => {
  const config = load();
  const pool = openPostgres(config.databaseUrl);
  let userId;

  async function test(name, token, role, expected) {
    const middleware = requireAuth({ db: pool, config }, role);

    const status = await new Promise(resolve => {
      middleware(
        { headers: { authorization: token ? `Bearer ${token}` : '' } },
        {},
        error => resolve(error ? error.status : 200)
      );
    });

    console.log(`${name}: ${status === expected ? 'PASS' : 'FAIL'} (${status})`);

    if (status !== expected) {
      throw new Error(`${name}: expected ${expected}, got ${status}`);
    }
  }

  try {
    const password = require('node:crypto').randomBytes(24).toString('hex');

    userId = await createUser(pool, {
      username: 'auth-test-' + Date.now(),
      password,
      role: 'admin'
    });

    const token = sign({ uid: userId }, config.tokenSecret, 300);

    await test('Valid admin token', token, 'admin', 200);
    await test('Invalid token', 'invalid-token', 'admin', 401);
    await test('Wrong role', token, 'agent', 403);

    await pool.query(
      'UPDATE users SET active = FALSE WHERE id = $1',
      [userId]
    );

    await test('Inactive account', token, 'admin', 401);

    console.log('ALL AUTHENTICATION TESTS PASSED');
  } catch (error) {
    console.error('TEST FAILED:', error.message);
    process.exitCode = 1;
  } finally {
    if (userId) {
      await pool.query('DELETE FROM users WHERE id = $1', [userId]);
      console.log('Temporary test user cleaned up.');
    }
    await pool.end();
  }
})();
