'use strict';

const { randomBytes, scrypt, timingSafeEqual } = require('crypto');
const { promisify } = require('util');

const scryptAsync = promisify(scrypt);

// scrypt is memory-hard and ships with Node, so there is nothing extra to install.
const PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

/** Returns "scrypt$N$r$p$salt$hash". The parameters are stored so they can be raised later. */
async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LENGTH, { ...PARAMS, maxmem: MAX_MEMORY });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

async function verifyPassword(password, stored) {
  try {
    const [scheme, n, r, p, salt, hash] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const params = { N: Number(n), r: Number(r), p: Number(p) };
    if (!(params.N >= 2 && params.N <= 1 << 20) || !(params.r >= 1 && params.r <= 32) || !(params.p >= 1 && params.p <= 16)) return false;
    const expected = Buffer.from(hash, 'base64');
    const actual = await scryptAsync(password, Buffer.from(salt, 'base64'), expected.length, { ...params, maxmem: MAX_MEMORY });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128; // long enough for passphrases, short enough to keep hashing cheap

/** Returns a message when the password is not acceptable, or '' when it is. */
function passwordProblem(password, email = '') {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) return `Use at least ${MIN_PASSWORD} characters.`;
  if (password.length > MAX_PASSWORD) return `Use ${MAX_PASSWORD} characters or fewer.`;
  if (email && password.toLowerCase() === String(email).toLowerCase()) return 'Choose a password that is different from your email.';
  return '';
}

module.exports = { hashPassword, verifyPassword, passwordProblem, MIN_PASSWORD, MAX_PASSWORD };
