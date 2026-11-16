const { HttpError, wrap } = require('./errors');
const { verify } = require('../security/tokens');

// Use: requireAuth(ctx, 'agent')  or  requireAuth(ctx, 'admin')
// The user is looked up in the database on EVERY request, so a switched-off
// account stops working immediately, even with a valid token.
function requireAuth(ctx, ...roles) {
  return wrap((req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const payload = verify(token, ctx.config.tokenSecret);
    if (!payload) throw new HttpError(401, 'unauthorized', 'Please log in');
    const user = ctx.db.prepare('SELECT id, username, role, polling_unit_id, active FROM users WHERE id = ?').get(payload.uid);
    if (!user || !user.active) throw new HttpError(401, 'unauthorized', 'Please log in');
    if (roles.length && !roles.includes(user.role)) throw new HttpError(403, 'forbidden', 'You are not allowed to do this');
    req.user = { id: user.id, username: user.username, role: user.role, pollingUnitId: user.polling_unit_id };
    next();
  });
}

module.exports = { requireAuth };
