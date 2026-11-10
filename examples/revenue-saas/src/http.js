'use strict';
/** Small HTTP helpers: errors, body parsing, validators, rate limiting, HTML escaping. */

const MAX_BODY_BYTES = 100 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'Request body is too large.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseJson(buffer) {
  try {
    const value = JSON.parse(buffer.toString('utf8') || '{}');
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('not an object');
    return value;
  } catch {
    throw new HttpError(400, 'Body must be a JSON object.');
  }
}

function sendJson(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(data));
}

function sendHtml(res, status, html, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(html);
}

const escapeHtml = value => String(value == null ? '' : value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// --- Validators: each returns the cleaned value or throws a 400 naming the field. ---

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const v = {
  string: (max, { required = false } = {}) => (value, field) => {
    if (value == null) value = '';
    if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
    const clean = value.trim();
    if (required && !clean) throw new HttpError(400, `${field} is required.`);
    if (clean.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer.`);
    return clean;
  },
  email: ({ required = false } = {}) => (value, field) => {
    const clean = v.string(200, { required })(value, field).toLowerCase();
    if (clean && !EMAIL_RE.test(clean)) throw new HttpError(400, `${field} is not a valid email address.`);
    return clean;
  },
  oneOf: options => (value, field) => {
    if (!options.includes(value)) throw new HttpError(400, `${field} must be one of: ${options.join(', ')}.`);
    return value;
  },
  cents: () => (value, field) => {
    if (!Number.isInteger(value) || value < 0 || value > 1e12) {
      throw new HttpError(400, `${field} must be a whole number of cents, 0 or more.`);
    }
    return value;
  },
  date: () => (value, field) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(value))) {
      throw new HttpError(400, `${field} must be a date like 2026-01-31.`);
    }
    return value;
  },
  id: () => (value, field) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > 64) throw new HttpError(400, `${field} is not a valid id.`);
    return value;
  },
  httpsUrl: () => (value, field) => {
    const clean = v.string(500)(value, field);
    if (!clean) return '';
    let url;
    try { url = new URL(clean); } catch { throw new HttpError(400, `${field} must be a full https:// link.`); }
    if (url.protocol !== 'https:') throw new HttpError(400, `${field} must start with https://.`);
    return url.toString();
  }
};

/** Fixed-window in-memory limiter. Fine for one process; swap for Redis when you run several. */
function createRateLimiter(max, windowMs) {
  const hits = new Map();
  return function check(key) {
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.reset < now) {
      if (hits.size > 10000) hits.clear();
      hits.set(key, { count: 1, reset: now + windowMs });
      return;
    }
    entry.count += 1;
    if (entry.count > max) throw new HttpError(429, 'Too many attempts. Please wait a few minutes and try again.');
  };
}

module.exports = { HttpError, readBody, parseJson, sendJson, sendHtml, escapeHtml, v, createRateLimiter };
