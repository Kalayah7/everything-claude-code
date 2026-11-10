'use strict';
/** SQLite storage (built into Node 22.5+). Every business row carries org_id; every query filters on it. */

// node:sqlite prints an ExperimentalWarning on Node 22. Hide only that one.
const emitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  if (String(warning && warning.message ? warning.message : warning).includes('SQLite')) return;
  return emitWarning.call(process, warning, ...rest);
};
const { DatabaseSync } = require('node:sqlite');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS orgs (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'free',
  form_key TEXT NOT NULL UNIQUE, currency TEXT NOT NULL DEFAULT 'USD', payment_url TEXT NOT NULL DEFAULT '',
  stripe_customer TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'owner',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', company TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new', notes TEXT NOT NULL DEFAULT '',
  last_contacted_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS deals (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL, value_cents INTEGER NOT NULL DEFAULT 0, stage TEXT NOT NULL DEFAULT 'lead',
  expected_close TEXT, stage_changed_at TEXT NOT NULL, closed_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL, deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
  title TEXT NOT NULL, due_date TEXT, done_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  contact_id TEXT REFERENCES contacts(id) ON DELETE SET NULL, deal_id TEXT REFERENCES deals(id) ON DELETE SET NULL,
  number TEXT NOT NULL, items TEXT NOT NULL DEFAULT '[]', total_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft', due_date TEXT, issued_at TEXT, paid_at TEXT,
  public_token TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(org_id);
CREATE INDEX IF NOT EXISTS idx_deals_org ON deals(org_id);
CREATE INDEX IF NOT EXISTS idx_tasks_org ON tasks(org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_org ON invoices(org_id);
`;

function openDb(file = ':memory:') {
  const db = new DatabaseSync(file);
  if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

module.exports = { openDb };
