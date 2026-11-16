const { openDb } = require('./db/connection');
const { createLimiter } = require('./security/rateLimit');
const { securityHeaders, cors } = require('./middleware/security');
const { notFound, errorHandler, HttpError } = require('./middleware/errors');

// The "context" is everything the routes need: settings, database, limiters.
function createContext(config, overrides = {}) {
  return {
    config,
    db: overrides.db || openDb(config.dbPath),
    limiters: overrides.limiters || {
      login: createLimiter({ max: 8, windowMs: 15 * 60 * 1000 }),
      api: createLimiter({ max: 600, windowMs: 60 * 1000 }),
      extract: createLimiter({ max: 20, windowMs: 60 * 60 * 1000 }),
    },
    fetchImpl: overrides.fetchImpl || undefined,
  };
}

function createApp(ctx) {
  const express = require('express'); // only needed when the web server is created
  const app = express();
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors(ctx.config.corsOrigins));

  app.use('/api', (req, res, next) => {
    const gate = ctx.limiters.api.check('ip:' + req.ip);
    if (!gate.allowed) {
      res.set('Retry-After', String(gate.retryAfterSeconds));
      return next(new HttpError(429, 'too_many_requests', 'Too many requests. Please slow down.'));
    }
    next();
  });

  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.use('/api/auth', require('./routes/auth')(ctx));
  app.use('/api/agent', require('./routes/agent')(ctx));
  app.use('/api/admin', require('./routes/admin')(ctx));
  app.use('/api/public', require('./routes/public')(ctx));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp, createContext };
