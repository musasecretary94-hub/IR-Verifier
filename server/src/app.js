const { openDb } = require('./db/connection');
const { openPostgres } = require('./db/postgres');
const { createLimiter } = require('./security/rateLimit');
const { createSupabaseStorage } = require('./services/supabase-storage');
const { securityHeaders, cors } = require('./middleware/security');
const { notFound, errorHandler, HttpError } = require('./middleware/errors');

function createContext(config, overrides = {}) {
  const driver = config.dbDriver || 'sqlite';

  if (!['sqlite', 'postgres'].includes(driver)) {
    throw new Error('DB_DRIVER must be either sqlite or postgres');
  }

  if (driver === 'postgres' && !config.databaseUrl && !overrides.db) {
    throw new Error('DATABASE_URL is required when DB_DRIVER=postgres');
  }

  const db = overrides.db || (
    driver === 'postgres'
      ? openPostgres(config.databaseUrl)
      : openDb(config.dbPath)
  );

  return {
    config,
    db,
    databaseType: driver,
    storage: overrides.storage || (
      driver === 'postgres' &&
      config.supabaseUrl &&
      config.supabaseServiceRoleKey
        ? createSupabaseStorage(config)
        : null
    ),
    limiters: overrides.limiters || {
      login: createLimiter({ max: 8, windowMs: 15 * 60 * 1000 }),
      api: createLimiter({ max: 600, windowMs: 60 * 1000 }),
      extract: createLimiter({ max: 20, windowMs: 60 * 60 * 1000 }),
    },
    fetchImpl: overrides.fetchImpl || undefined,
  };
}

function createApp(ctx) {
  const express = require('express');
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors(ctx.config.corsOrigins));

  app.use('/api', (req, res, next) => {
    const gate = ctx.limiters.api.check('ip:' + req.ip);
    if (!gate.allowed) {
      res.set('Retry-After', String(gate.retryAfterSeconds));
      return next(new HttpError(
        429,
        'too_many_requests',
        'Too many requests. Please slow down.'
      ));
    }
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, database: ctx.databaseType });
  });

  const suffix = ctx.databaseType === 'postgres' ? '-postgres' : '';

  app.use('/api/auth', require('./routes/auth' + suffix)(ctx));
  app.use('/api/agent', require('./routes/agent' + suffix)(ctx));
  app.use('/api/admin', require('./routes/admin' + suffix)(ctx));
  app.use('/api/public', require('./routes/public' + suffix)(ctx));

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, createContext };
