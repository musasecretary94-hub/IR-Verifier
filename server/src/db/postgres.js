const { Pool } = require('pg');

function openPostgres(connectionString) {
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for PostgreSQL');
  }

  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false },
  });

  pool.on('error', (err) => {
    console.error('Unexpected PostgreSQL pool error:', err.message);
  });

  return pool;
}

async function testPostgres(pool) {
  const result = await pool.query('SELECT NOW() AS connected_at');
  return result.rows[0];
}

module.exports = { openPostgres, testPostgres };
