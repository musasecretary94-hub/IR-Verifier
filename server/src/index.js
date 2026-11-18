const fs = require('node:fs');
const { load } = require('./config/env');
const { createApp, createContext } = require('./app');
const { testPostgres } = require('./db/postgres');

async function start() {
  const config = load();

  fs.mkdirSync(config.uploadDir, { recursive: true });

  const ctx = createContext(config);

  if (
    ctx.databaseType === 'postgres' &&
    (!config.supabaseUrl || !config.supabaseServiceRoleKey)
  ) {
    throw new Error(
      'PostgreSQL requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for persistent photo storage.'
    );
  }

  if (ctx.databaseType === 'postgres') {
    const result = await testPostgres(ctx.db);
    console.log('SUCCESS: PostgreSQL connected!');
    console.log('Database time:', result.connected_at);
  }

  const app = createApp(ctx);

  const server = app.listen(config.port, () => {
    console.log(`IR Verifier server running on http://localhost:${config.port}`);

    if (config.demoMode) {
      console.log('DEMO MODE: synthetic data only. Every page shows the UNOFFICIAL banner.');
    }

    if (config.tokenSecretWasGenerated) {
      console.log('Note: TOKEN_SECRET is not set, so logins stop working when the server restarts. Set it in .env.');
    }

    if (!config.ai.provider) {
      console.log('AI reading is off (agents type the numbers). Set AI_PROVIDER and AI_API_KEY in .env to turn it on.');
    }
  });

  return { server, ctx };
}

start().catch((err) => {
  console.error('SERVER STARTUP FAILED:', err.message);
  process.exitCode = 1;
});
