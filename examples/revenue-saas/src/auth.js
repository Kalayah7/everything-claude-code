'use strict';
/** Accounts and sessions: scrypt password hashes, random session tokens stored only as SHA-256. */

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { HttpError, v, createRateLimiter } = require('./http');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'rp_session';
const SESSION_DAYS = 30;
const nowIso = () => new Date().toISOString();
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function createAuth(db, { secureCookies = false } = {}) {
  const loginLimit = createRateLimiter(10, 15 * 60 * 1000);
  const signupLimit = createRateLimiter(10, 60 * 60 * 1000);

  const cookie = (token, maxAge) =>
    `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;

  function startSession(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(nowIso());
    db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256(token), userId, expires);
    return cookie(token, SESSION_DAYS * 86400);
  }

  /** Returns { user, org } for a valid session cookie, otherwise null. */
  function authenticate(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return null;
    const row = db.prepare(
      `SELECT u.id, u.org_id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`
    ).get(sha256(token), nowIso());
    if (!row) return null;
    const org = db.prepare('SELECT * FROM orgs WHERE id = ?').get(row.org_id);
    return { user: { ...row }, org: { ...org } };
  }

  async function signup(body, ip) {
    signupLimit(`signup:${ip}`);
    const orgName = v.string(120, { required: true })(body.org_name, 'Business name');
    const name = v.string(120, { required: true })(body.name, 'Your name');
    const email = v.email({ required: true })(body.email, 'Email');
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) {
      throw new HttpError(400, 'Password must be at least 8 characters.');
    }
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) {
      throw new HttpError(409, 'An account with that email already exists. Try logging in.');
    }
    const passHash = await hashPassword(body.password);
    const orgId = crypto.randomUUID();
    const userId = crypto.randomUUID();
    db.exec('BEGIN');
    try {
      db.prepare('INSERT INTO orgs (id, name, form_key, created_at) VALUES (?, ?, ?, ?)')
        .run(orgId, orgName, crypto.randomBytes(12).toString('hex'), nowIso());
      db.prepare('INSERT INTO users (id, org_id, email, name, pass_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, orgId, email, name, passHash, nowIso());
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    return startSession(userId);
  }

  async function login(body, ip) {
    const email = v.email({ required: true })(body.email, 'Email');
    loginLimit(`login:${ip}:${email}`);
    const user = db.prepare('SELECT id, pass_hash FROM users WHERE email = ?').get(email);
    const ok = user && typeof body.password === 'string' && await verifyPassword(body.password, user.pass_hash);
    if (!ok) throw new HttpError(401, 'Email or password is incorrect.');
    return startSession(user.id);
  }

  function logout(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    return cookie('', 0);
  }

  return { authenticate, signup, login, logout };
}

module.exports = { createAuth, hashPassword, verifyPassword, parseCookies };
