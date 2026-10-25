const crypto = require('crypto');
const Session = require('../models/Session');
const User = require('../models/User');
const { parseCookies, serializeCookie } = require('../lib/cookies');

const COOKIE = 'sid';
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 14;
const MAX_SESSIONS = 10; // per user; the oldest are dropped

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const secureCookie = () =>
  process.env.COOKIE_SECURE === 'true' || (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false');

const cookieOptions = (maxAgeSeconds) => ({ maxAgeSeconds, secure: secureCookie(), sameSite: 'Lax' });
const readToken = (req) => parseCookies(req.headers.cookie)[COOKIE];

/** Creates a session and sends its token as an httpOnly cookie (script on the page can never read it). */
async function startSession(req, res, user) {
  const token = crypto.randomBytes(32).toString('base64url');
  await Session.create({
    user: user._id,
    tokenHash: hashToken(token),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 200),
    expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  });
  const extra = await Session.find({ user: user._id }).sort({ createdAt: -1 }).skip(MAX_SESSIONS).select('_id');
  if (extra.length) await Session.deleteMany({ _id: { $in: extra.map((s) => s._id) } });
  res.append('Set-Cookie', serializeCookie(COOKIE, token, cookieOptions(SESSION_DAYS * 24 * 60 * 60)));
}

async function endSession(req, res) {
  const token = readToken(req);
  if (token) await Session.deleteOne({ tokenHash: hashToken(token) });
  res.append('Set-Cookie', serializeCookie(COOKIE, '', cookieOptions(0)));
}

/** Loads req.user from the session cookie, or answers 401. */
async function requireAuth(req, res, next) {
  try {
    const token = readToken(req);
    const session = token && (await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }));
    const user = session && (await User.findById(session.user));
    if (!user) {
      res.append('Set-Cookie', serializeCookie(COOKIE, '', cookieOptions(0)));
      return res.status(401).json({ message: 'Please sign in to continue.' });
    }
    req.user = user;
    req.session = session;
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, startSession, endSession, hashToken };
