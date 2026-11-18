// Runs an async callback inside a PostgreSQL transaction.
async function transaction(pool, fn) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await fn(client);

    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      // Preserve the original error.
    }

    throw err;
  } finally {
    client.release();
  }
}

module.exports = { transaction };
