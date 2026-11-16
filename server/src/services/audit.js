// The audit log: who did what, when. Rows can never be changed or deleted (see the schema).
function record(db, { user, action, entity = null, entityId = null, detail = null, ip = null }) {
  db.prepare('INSERT INTO audit_log (user_id, username, action, entity, entity_id, detail, ip) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
    user ? user.id : null,
    user ? user.username : null,
    action,
    entity,
    entityId,
    detail === null ? null : typeof detail === 'string' ? detail : JSON.stringify(detail),
    ip,
  );
}

function recent(db, limit = 100) {
  return db.prepare('SELECT id, username, action, entity, entity_id, detail, ip, at FROM audit_log ORDER BY id DESC LIMIT ?')
    .all(Math.min(Math.max(Number(limit) || 100, 1), 500)).map((r) => ({ ...r }));
}

module.exports = { record, recent };
