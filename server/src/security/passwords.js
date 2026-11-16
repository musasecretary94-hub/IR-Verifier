// Passwords are never stored. We store a salted scrypt hash.
const crypto = require('node:crypto');

const KEY_LEN = 64;
const MIN_LENGTH = 10;

function hashPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    throw new Error('Password must be at least ' + MIN_LENGTH + ' characters');
  }
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, KEY_LEN);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Used so that a wrong username takes as long as a wrong password.
const DUMMY_HASH = hashPassword('dummy-password-for-timing-only');

function generatePassword() {
  return crypto.randomBytes(9).toString('base64url'); // 12 characters
}

module.exports = { hashPassword, verifyPassword, generatePassword, DUMMY_HASH, MIN_LENGTH };
