const { load } = require('../src/config/env');
const { openDb } = require('../src/db/connection');
const { openPostgres } = require('../src/db/postgres');

function timestamp(value) {
  if (!value) return null;
  return String(value).replace(' ', 'T') + 'Z';
}

async function main() {
  const config = load();
  const sqlite = openDb(config.dbPath);
  const pg = openPostgres(config.databaseUrl);
  const client = await pg.connect();

  try {
    const units = sqlite.prepare(
      'SELECT id, code, name, ward, lga, state, registered FROM polling_units ORDER BY id'
    ).all();

    const users = sqlite.prepare(
      'SELECT id, username, password_hash, role, polling_unit_id, active, created_at FROM users ORDER BY id'
    ).all();

    const audits = sqlite.prepare(
      'SELECT id, user_id, username, action, entity, entity_id, detail, ip, at FROM audit_log ORDER BY id'
    ).all();

    const expected = {
      polling_units: units.length,
      users: users.length,
      audit_log: audits.length
    };

    await client.query('BEGIN');

    for (const table of Object.keys(expected)) {
      const result = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
      if (result.rows[0].total !== 0) {
        throw new Error(`${table} is not empty. Migration stopped.`);
      }
    }

    for (const u of units) {
      await client.query(
        `INSERT INTO polling_units
         (id, code, name, ward, lga, state, registered)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [u.id, u.code, u.name, u.ward, u.lga, u.state, u.registered]
      );
    }

    for (const u of users) {
      await client.query(
        `INSERT INTO users
         (id, username, password_hash, role, polling_unit_id, active, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          u.id,
          u.username,
          u.password_hash,
          u.role,
          u.polling_unit_id,
          Boolean(u.active),
          timestamp(u.created_at)
        ]
      );
    }

    for (const a of audits) {
      await client.query(
        `INSERT INTO audit_log
         (id, user_id, username, action, entity, entity_id, detail, ip, at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          a.id, a.user_id, a.username, a.action,
          a.entity, a.entity_id, a.detail, a.ip,
          timestamp(a.at)
        ]
      );
    }

    for (const table of Object.keys(expected)) {
      await client.query(
        `SELECT setval(
          pg_get_serial_sequence($1, 'id'),
          COALESCE((SELECT MAX(id) FROM ${table}), 1),
          EXISTS(SELECT 1 FROM ${table})
        )`,
        [`public.${table}`]
      );
    }

    for (const table of Object.keys(expected)) {
      const result = await client.query(`SELECT COUNT(*)::int AS total FROM ${table}`);
      if (result.rows[0].total !== expected[table]) {
        throw new Error(`${table} count mismatch after migration.`);
      }
    }

    await client.query('COMMIT');

    console.log('MIGRATION SUCCESS');
    console.log('Polling units:', units.length);
    console.log('Users:', users.length);
    console.log('Audit logs:', audits.length);
    console.log('SQLite source remains unchanged.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pg.end();
    sqlite.close();
  }
}

main().catch(error => {
  console.error('MIGRATION FAILED:', error.message);
  process.exitCode = 1;
});
