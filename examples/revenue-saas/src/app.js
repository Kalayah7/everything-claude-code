'use strict';
/** Request router. createApp() returns a plain (req, res) handler for http.createServer. */

const fs = require('node:fs');
const path = require('node:path');
const { HttpError, readBody, parseJson, sendJson, sendHtml, v, createRateLimiter } = require('./http');
const { createAuth } = require('./auth');
const { createEntities } = require('./entities');
const { createBilling } = require('./billing');
const { computeMetrics, nextActions } = require('./insights');
const pages = require('./public-pages');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const CSP = "default-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'";
const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

function createApp({ db, config = {} }) {
  const auth = createAuth(db, { secureCookies: Boolean(config.secureCookies) });
  const entities = createEntities(db);
  const billing = createBilling(db, config);
  const formLimit = createRateLimiter(20, 10 * 60 * 1000);

  // Static files are read once into an allow-list, so request paths never touch the filesystem.
  const staticFiles = new Map(fs.readdirSync(PUBLIC_DIR).map(name => [`/${name}`, fs.readFileSync(path.join(PUBLIC_DIR, name))]));

  const clientIp = req => (config.trustProxy && String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())
    || req.socket.remoteAddress || 'unknown';

  const publicOrg = org => ({ id: org.id, name: org.name, plan: org.plan, currency: org.currency, payment_url: org.payment_url, form_key: org.form_key });

  function loadOrgData(org) {
    return Object.fromEntries(entities.tables.map(table => [table, entities.list(org, table)]));
  }

  async function handleApi(req, res, url) {
    const route = `${req.method} ${url.pathname}`;

    // Stripe signs the raw bytes, so this runs before any JSON parsing or session checks.
    if (route === 'POST /api/billing/webhook') {
      return sendJson(res, 200, billing.handleWebhook(await readBody(req), req.headers['stripe-signature']));
    }

    let body = {};
    if (req.method !== 'GET') {
      // CSRF defence on top of SameSite cookies: browsers cannot send cross-site JSON without a CORS preflight.
      if (!String(req.headers['content-type'] || '').startsWith('application/json')) {
        throw new HttpError(415, 'Send JSON with Content-Type: application/json.');
      }
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Cross-site request blocked.');
      body = parseJson(await readBody(req));
    }

    if (route === 'POST /api/signup') return sendJson(res, 201, { ok: true }, { 'Set-Cookie': await auth.signup(body, clientIp(req)) });
    if (route === 'POST /api/login') return sendJson(res, 200, { ok: true }, { 'Set-Cookie': await auth.login(body, clientIp(req)) });
    if (route === 'POST /api/logout') return sendJson(res, 200, { ok: true }, { 'Set-Cookie': auth.logout(req) });

    const session = auth.authenticate(req);
    if (!session) throw new HttpError(401, 'Please log in.');
    const { user, org } = session;

    if (route === 'GET /api/me') return sendJson(res, 200, { user: { name: user.name, email: user.email, role: user.role }, org: publicOrg(org) });

    if (route === 'GET /api/dashboard') {
      const data = loadOrgData(org);
      return sendJson(res, 200, { metrics: computeMetrics(data), actions: nextActions(data) });
    }

    if (route === 'GET /api/billing') return sendJson(res, 200, billing.summary(org, entities.usage(org)));

    if (route === 'PATCH /api/org') {
      const cols = {};
      if (body.name !== undefined) cols.name = v.string(120, { required: true })(body.name, 'Business name');
      if (body.currency !== undefined) cols.currency = v.oneOf(CURRENCIES)(body.currency, 'Currency');
      if (body.payment_url !== undefined) cols.payment_url = v.httpsUrl()(body.payment_url, 'Payment link');
      const keys = Object.keys(cols);
      if (keys.length) {
        db.prepare(`UPDATE orgs SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => cols[k]), org.id);
      }
      return sendJson(res, 200, { org: publicOrg({ ...org, ...cols }) });
    }

    const match = url.pathname.match(/^\/api\/(contacts|deals|tasks|invoices)(?:\/([\w-]{1,64}))?$/);
    if (match) {
      const [, table, id] = match;
      if (!id && req.method === 'GET') return sendJson(res, 200, { items: entities.list(org, table) });
      if (!id && req.method === 'POST') return sendJson(res, 201, { item: entities.create(org, table, body) });
      if (id && req.method === 'PATCH') return sendJson(res, 200, { item: entities.update(org, table, id, body) });
      if (id && req.method === 'DELETE') { entities.remove(org, table, id); return sendJson(res, 200, { ok: true }); }
    }
    throw new HttpError(404, 'Not found.');
  }

  /** /f/<form_key>: hosted lead form. Accepts browser form posts and cross-site JSON (for embedding). */
  async function handleLeadForm(req, res, key) {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    const org = db.prepare('SELECT * FROM orgs WHERE form_key = ?').get(key);
    if (!org) return sendHtml(res, 404, pages.notFoundPage());
    if (req.method === 'GET') return sendHtml(res, 200, pages.leadFormPage(org));
    if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed.');

    const wantsJson = String(req.headers['content-type'] || '').startsWith('application/json');
    const raw = await readBody(req);
    const values = wantsJson ? parseJson(raw) : Object.fromEntries(new URLSearchParams(raw.toString('utf8')));
    try {
      formLimit(`form:${clientIp(req)}`);
      // Honeypot: real people never see the "website" field. Pretend success so bots learn nothing.
      if (!values.website) entities.captureLead(org, values);
    } catch (err) {
      if (!(err instanceof HttpError)) throw err;
      if (wantsJson) return sendJson(res, err.status, { error: err.message }, cors);
      return sendHtml(res, err.status, pages.leadFormPage(org, { error: err.message, values }));
    }
    if (wantsJson) return sendJson(res, 201, { ok: true }, cors);
    return sendHtml(res, 201, pages.leadThanksPage(org));
  }

  function handleInvoicePage(res, token) {
    const invoice = db.prepare("SELECT * FROM invoices WHERE public_token = ? AND status != 'draft'").get(token);
    if (!invoice) return sendHtml(res, 404, pages.notFoundPage());
    const org = db.prepare('SELECT * FROM orgs WHERE id = ?').get(invoice.org_id);
    const contact = invoice.contact_id ? db.prepare('SELECT * FROM contacts WHERE id = ?').get(invoice.contact_id) : null;
    return sendHtml(res, 200, pages.invoicePage(org, { ...invoice, items: JSON.parse(invoice.items) }, contact));
  }

  return async function handler(req, res) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', CSP);
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
      const form = url.pathname.match(/^\/f\/([a-f0-9]{8,64})$/);
      if (form) return await handleLeadForm(req, res, form[1]);
      res.setHeader('X-Frame-Options', 'DENY'); // everything except the embeddable lead form

      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
      if (url.pathname === '/healthz') return sendJson(res, 200, { ok: true });
      const inv = url.pathname.match(/^\/i\/([a-f0-9]{32})$/);
      if (inv) return handleInvoicePage(res, inv[1]);

      const file = url.pathname === '/' ? '/index.html' : url.pathname;
      if (staticFiles.has(file)) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : staticFiles.get(file));
      }
      return sendHtml(res, 404, pages.notFoundPage());
    } catch (err) {
      if (res.headersSent) return res.end();
      if (err instanceof HttpError) return sendJson(res, err.status, { error: err.message });
      if (config.logErrors !== false) process.stderr.write(`[revenue-saas] ${req.method} ${req.url} failed: ${err.stack || err}\n`);
      return sendJson(res, 500, { error: 'Something went wrong on our side. Please try again.' });
    }
  };
}

module.exports = { createApp };
