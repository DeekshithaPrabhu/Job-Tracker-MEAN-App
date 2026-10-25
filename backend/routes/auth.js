const express = require('express');
const User = require('../models/User');
const Session = require('../models/Session');
const PasswordReset = require('../models/PasswordReset');
const Job = require('../models/Job');
const Event = require('../models/Event');
const SavedFilter = require('../models/SavedFilter');
const crypto = require('crypto');
const { hashPassword, verifyPassword, passwordProblem, MAX_PASSWORD } = require('../lib/passwords');
const { sendMail } = require('../lib/mailer');
const { createLimiter } = require('../lib/rate-limit');
const { requireAuth, startSession, endSession, hashToken } = require('../middleware/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{5,25}$/;
const RESET_MINUTES = 30;

// Attempts are counted per address and per email, and cleared by a successful sign-in.
const loginByIp = createLimiter({ windowMs: 15 * 60 * 1000, max: 30 });
const loginByEmail = createLimiter({ windowMs: 15 * 60 * 1000, max: 8 });
const registerByIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const forgotByIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });
const forgotByEmail = createLimiter({ windowMs: 60 * 60 * 1000, max: 3 });
const resetByIp = createLimiter({ windowMs: 60 * 60 * 1000, max: 20 });
const passwordByUser = createLimiter({ windowMs: 60 * 60 * 1000, max: 10 });

const tooMany = (res, seconds) => {
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ message: `Too many attempts. Try again in ${Math.ceil(seconds / 60)} minute(s).` });
};

// Used so that an unknown email takes as long to reject as a wrong password.
let dummyHash;
const getDummyHash = () => (dummyHash ||= hashPassword('not-a-real-password'));

const fail = (res, errors, message = 'Please fix the highlighted fields') => res.status(400).json({ message, errors });

// Jobs, events and saved filters that existed before accounts were added belong to the first person who registers.
async function adoptExistingData(userId) {
  const orphans = { user: { $exists: false } };
  await Promise.all([Job, Event, SavedFilter].map((Model) => Model.updateMany(orphans, { $set: { user: userId } })));
}

// POST /api/auth/register  { name, email, password }
router.post('/register', wrap(async (req, res) => {
  if (process.env.ALLOW_REGISTRATION === 'false') return res.status(403).json({ message: 'Registration is turned off on this server.' });
  const limit = registerByIp.take(req.ip);
  if (!limit.ok) return tooMany(res, limit.retryAfterSeconds);

  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';

  const errors = {};
  if (!name) errors.name = 'Enter your name.';
  else if (name.length > 80) errors.name = 'Use 80 characters or fewer.';
  if (!EMAIL.test(email) || email.length > 254) errors.email = 'Enter a valid email address.';
  const problem = passwordProblem(password, email);
  if (problem) errors.password = problem;
  if (Object.keys(errors).length) return fail(res, errors);

  if (await User.exists({ email })) return fail(res, { email: 'An account with this email already exists. Sign in instead.' }, 'That email is already registered');

  const isFirst = (await User.estimatedDocumentCount()) === 0;
  let user;
  try {
    user = await User.create({ name, email, passwordHash: await hashPassword(password) });
  } catch (err) {
    if (err.code === 11000) return fail(res, { email: 'An account with this email already exists. Sign in instead.' }, 'That email is already registered');
    throw err;
  }
  if (isFirst) await adoptExistingData(user._id);

  await startSession(req, res, user);
  res.status(201).json(user);
}));

// POST /api/auth/login  { email, password }
router.post('/login', wrap(async (req, res) => {
  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const emailKey = `${req.ip}|${email}`;

  for (const [limiter, key] of [[loginByIp, req.ip], [loginByEmail, emailKey]]) {
    const limit = limiter.take(key);
    if (!limit.ok) return tooMany(res, limit.retryAfterSeconds);
  }

  const user = email && password.length <= MAX_PASSWORD ? await User.findOne({ email }) : null;
  const valid = await verifyPassword(password.slice(0, MAX_PASSWORD), user ? user.passwordHash : await getDummyHash());
  if (!user || !valid) {
    // The same answer whether the email exists or not.
    return res.status(401).json({ message: 'Email or password is not correct.' });
  }

  loginByEmail.reset(emailKey);
  await startSession(req, res, user);
  res.json(user);
}));

router.post('/logout', wrap(async (req, res) => {
  await endSession(req, res);
  res.status(204).end();
}));

// --- Forgot and reset password ---------------------------------------------------------------

const FORGOT_ANSWER = `If an account exists for that email, a link to reset the password has been sent. It works once and expires in ${RESET_MINUTES} minutes.`;

// The reset link is built from APP_URL (or the first allowed browser origin).
const appUrl = () => (process.env.APP_URL || (process.env.CLIENT_ORIGIN || 'http://localhost:4200').split(',')[0]).trim().replace(/\/+$/, '');

// POST /api/auth/forgot  { email }
// Always gives the same answer, so it cannot be used to find out which emails have accounts.
router.post('/forgot', wrap(async (req, res) => {
  const limit = forgotByIp.take(req.ip);
  if (!limit.ok) return tooMany(res, limit.retryAfterSeconds);

  const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (email && EMAIL.test(email) && email.length <= 254 && forgotByEmail.take(email).ok) {
    const user = await User.findOne({ email });
    if (user) {
      const token = crypto.randomBytes(32).toString('base64url');
      await PasswordReset.deleteMany({ user: user._id }); // only the newest link works
      await PasswordReset.create({ user: user._id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60 * 1000) });
      // Sent after the answer, so the response time looks the same either way. The link goes to the account email only.
      sendMail({
        to: user.email,
        subject: 'Reset your Job tracker password',
        text:
          `Hi ${user.name},\n\nSomeone asked to reset the password for your Job tracker account. ` +
          `Open this link to choose a new one (it works once and expires in ${RESET_MINUTES} minutes):\n\n` +
          `${appUrl()}/?reset=${token}\n\nIf this was not you, ignore this email. Your password has not changed.`
      }).catch((err) => console.warn('Could not send the reset email:', err.message));
    }
  }
  res.json({ message: FORGOT_ANSWER });
}));

// POST /api/auth/reset  { token, password }
router.post('/reset', wrap(async (req, res) => {
  const limit = resetByIp.take(req.ip);
  if (!limit.ok) return tooMany(res, limit.retryAfterSeconds);

  const token = typeof req.body.token === 'string' ? req.body.token : '';
  const password = typeof req.body.password === 'string' ? req.body.password : '';
  const invalid = () => res.status(400).json({ message: 'This reset link is not valid or has expired. Request a new one.', code: 'invalid_token' });

  const record = token && token.length < 200 ? await PasswordReset.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }) : null;
  const user = record && (await User.findById(record.user));
  if (!user) return invalid();

  const problem = passwordProblem(password, user.email);
  if (problem) return fail(res, { password: problem }); // the link stays valid so they can try again

  user.passwordHash = await hashPassword(password);
  await user.save();
  await PasswordReset.deleteMany({ user: user._id });
  await Session.deleteMany({ user: user._id }); // anyone who was signed in with the old password is signed out
  res.json({ message: 'Your password has been changed. Sign in with the new password.' });
}));

// --- Profile ---------------------------------------------------------------------------------

// PATCH /api/auth/profile  { name?, phone?, officialEmail?, personalEmail? }  (phone and emails are optional; send "" to clear)
router.patch('/profile', requireAuth, wrap(async (req, res) => {
  const body = req.body || {};
  const errors = {};
  const user = req.user;

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) errors.name = 'Enter your name.';
    else if (name.length > 80) errors.name = 'Use 80 characters or fewer.';
    else user.name = name;
  }

  if ('phone' in body) {
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    if (phone && (!PHONE.test(phone) || (phone.match(/\d/g) || []).length < 5)) errors.phone = 'Use digits, spaces, + - ( ) . only, at least 5 digits.';
    else user.phone = phone || undefined;
  }

  for (const key of ['officialEmail', 'personalEmail']) {
    if (!(key in body)) continue;
    const value = typeof body[key] === 'string' ? body[key].trim().toLowerCase() : '';
    if (value && (!EMAIL.test(value) || value.length > 254)) errors[key] = 'Enter a valid email address.';
    else user[key] = value || undefined;
  }

  if (Object.keys(errors).length) return fail(res, errors);
  await user.save();
  res.json(user);
}));

// POST /api/auth/password  { currentPassword, newPassword }
router.post('/password', requireAuth, wrap(async (req, res) => {
  const limit = passwordByUser.take(String(req.user._id));
  if (!limit.ok) return tooMany(res, limit.retryAfterSeconds);

  const current = typeof req.body.currentPassword === 'string' ? req.body.currentPassword : '';
  const next = typeof req.body.newPassword === 'string' ? req.body.newPassword : '';

  if (!current || current.length > MAX_PASSWORD || !(await verifyPassword(current, req.user.passwordHash))) {
    return fail(res, { currentPassword: 'Current password is not correct.' }, 'Current password is not correct');
  }
  const problem = passwordProblem(next, req.user.email);
  if (problem) return fail(res, { newPassword: problem });
  if (next === current) return fail(res, { newPassword: 'Choose a password you are not already using.' });

  req.user.passwordHash = await hashPassword(next);
  await req.user.save();
  // Other devices must sign in again; this one stays signed in.
  await Session.deleteMany({ user: req.user._id, _id: { $ne: req.session._id } });
  res.json({ message: 'Password changed. Other devices have been signed out.' });
}));

// GET /api/auth/me  -> the signed-in user, or 401
router.get('/me', requireAuth, (req, res) => res.json(req.user));

// POST /api/auth/logout-all  -> signs the user out everywhere
router.post('/logout-all', requireAuth, wrap(async (req, res) => {
  await Session.deleteMany({ user: req.user._id });
  await endSession(req, res);
  res.status(204).end();
}));

module.exports = router;
