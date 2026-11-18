const { HttpError, wrap } = require('./errors');
const { verify } = require('../security/tokens');

// PostgreSQL authentication middleware.
function requireAuth(ctx, ...roles) {
  return wrap(async (req, res, next) => {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';

    const payload = verify(token, ctx.config.tokenSecret);

    if (!payload) {
      throw new HttpError(401, 'unauthorized', 'Please log in');
    }

    const result = await ctx.db.query(
      `SELECT id, username, role, polling_unit_id, active
       FROM users
       WHERE id = $1`,
      [payload.uid]
    );

    const user = result.rows[0];

    if (!user || !user.active) {
      throw new HttpError(401, 'unauthorized', 'Please log in');
    }

    if (roles.length && !roles.includes(user.role)) {
      throw new HttpError(
        403,
        'forbidden',
        'You are not allowed to do this'
      );
    }

    req.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      pollingUnitId: user.polling_unit_id
    };

    next();
  });
}

module.exports = { requireAuth };
