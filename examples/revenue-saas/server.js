#!/usr/bin/env node
'use strict';
/**
 * RevPilot server. No dependencies; needs Node 22.5 or newer (built-in SQLite).
 *
 *   node server.js            start on http://localhost:3000
 *   node server.js --seed     also create a demo workspace (demo@example.com / demo-password)
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('./src/db');
const { createApp } = require('./src/app');

const env = process.env;
const config = {
  port: Number(env.PORT) || 3000,
  dbFile: env.DATABASE_FILE || path.join(__dirname, 'data', 'revpilot.db'),
  secureCookies: env.COOKIE_SECURE === '1', // set when serving over HTTPS
  trustProxy: env.TRUST_PROXY === '1', // set when behind a reverse proxy that sets X-Forwarded-For
  stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET || '',
  stripeLinkGrowth: env.STRIPE_LINK_GROWTH || '',
  stripeLinkScale: env.STRIPE_LINK_SCALE || ''
};

async function main() {
  if (config.dbFile !== ':memory:') fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
  const db = openDb(config.dbFile);
  if (process.argv.includes('--seed')) {
    const result = await require('./src/seed').seedDemo(db);
    process.stdout.write(result.created
      ? `Demo workspace created. Log in with ${result.email} / ${result.password}\n`
      : `Demo workspace already exists (${result.email}).\n`);
  }
  const server = http.createServer(createApp({ db, config }));
  server.listen(config.port, () => process.stdout.write(`RevPilot is running at http://localhost:${config.port}\n`));
  const stop = () => server.close(() => { db.close(); process.exit(0); });
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
}

main().catch(err => {
  process.stderr.write(`${err.stack || err}\n`);
  process.exit(1);
});
