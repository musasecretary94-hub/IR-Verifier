const express = require('express');
const { HttpError, wrap } = require('../middleware/errors');
const { requireAuth } = require('../middleware/auth-postgres');
const { authenticate } = require('../services/users-postgres');
const { sign } = require('../security/tokens');
const audit = require('../services/audit-postgres');

module.exports = function authRoutes(ctx) {
  const router = express.Router();

  router.use(express.json({ limit: '16kb' }));

  router.post('/login', wrap(async (req, res) => {
    const { username, password } = req.body || {};

    const key = req.ip + '|' +
      String(username || '').toLowerCase().slice(0, 60);

    const gate = ctx.limiters.login.check(key);

    if (!gate.allowed) {
      res.set('Retry-After', String(gate.retryAfterSeconds));
      throw new HttpError(
        429,
        'too_many_attempts',
        'Too many attempts. Please try again later.'
      );
    }

    const user = await authenticate(ctx.db, username, password);

    if (!user) {
      await audit.record(ctx.db, {
        user: null,
        action: 'login.failed',
        detail: String(username || '').slice(0, 60),
        ip: req.ip
      });

      throw new HttpError(
        401,
        'bad_login',
        'Wrong username or password'
      );
    }

    ctx.limiters.login.reset(key);

    await audit.record(ctx.db, {
      user,
      action: 'login.success',
      ip: req.ip
    });

    const token = sign(
      { uid: user.id, role: user.role },
      ctx.config.tokenSecret,
      ctx.config.tokenHours * 3600
    );

    res.json({
      token,
      user: {
        username: user.username,
        role: user.role
      }
    });
  }));

  router.get('/me', requireAuth(ctx), wrap(async (req, res) => {
    res.json({
      user: {
        username: req.user.username,
        role: req.user.role
      }
    });
  }));

  return router;
};
