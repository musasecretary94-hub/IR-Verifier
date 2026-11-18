// PostgreSQL audit log service.
// Audit records are immutable at database level.

async function record(pool, {
  user,
  action,
  entity = null,
  entityId = null,
  detail = null,
  ip = null
}) {
  const result = await pool.query(
    `INSERT INTO audit_log
      (user_id, username, action, entity, entity_id, detail, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id`,
    [
      user ? user.id : null,
      user ? user.username : null,
      action,
      entity,
      entityId,
      detail === null
        ? null
        : typeof detail === 'string'
          ? detail
          : JSON.stringify(detail),
      ip
    ]
  );

  return result.rows[0];
}

async function recent(pool, limit = 100) {
  const safeLimit = Math.min(
    Math.max(Number(limit) || 100, 1),
    500
  );

  const result = await pool.query(
    `SELECT id, username, action, entity, entity_id, detail, ip, at
     FROM audit_log
     ORDER BY id DESC
     LIMIT $1`,
    [safeLimit]
  );

  return result.rows;
}

module.exports = { record, recent };
