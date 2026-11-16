// Reads settings from the environment (and from a ".env" file if there is one).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.join(__dirname, '..', '..');
const envFile = path.join(root, '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function load(overrides = {}) {
  const demoMode = process.env.DEMO_MODE !== 'false';
  let tokenSecret = process.env.TOKEN_SECRET;
  if (!tokenSecret) {
    if (!demoMode) throw new Error('TOKEN_SECRET must be set when DEMO_MODE=false');
    tokenSecret = crypto.randomBytes(32).toString('hex'); // logins stop working after a restart
  }
  return {
    port: num(process.env.PORT, 3001),
    dbPath: process.env.DB_PATH || path.join(root, 'data', 'verifier.db'),
    uploadDir: process.env.UPLOAD_DIR || path.join(root, 'uploads'),
    tokenSecret,
    tokenSecretWasGenerated: !process.env.TOKEN_SECRET,
    tokenHours: num(process.env.TOKEN_HOURS, 8),
    maxImageMb: num(process.env.MAX_IMAGE_MB, 6),
    demoMode,
    corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((s) => s.trim()).filter(Boolean),
    ai: {
      provider: (process.env.AI_PROVIDER || '').toLowerCase(),
      apiKey: process.env.AI_API_KEY || '',
      model: process.env.AI_MODEL || 'claude-sonnet-5-5',
    },
    ...overrides,
  };
}

module.exports = { load };
