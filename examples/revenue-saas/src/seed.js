'use strict';
/** Demo workspace with made-up data, so the dashboard has something to show. For local trials only. */

const { createAuth } = require('./auth');
const { createEntities } = require('./entities');

const DEMO = { email: 'demo@example.com', password: 'demo-password' };
const DAY_MS = 86400000;
const daysAgo = n => new Date(Date.now() - n * DAY_MS).toISOString();
const dateIn = n => new Date(Date.now() + n * DAY_MS).toISOString().slice(0, 10);

async function seedDemo(db) {
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(DEMO.email)) return { created: false, ...DEMO };
  await createAuth(db).signup({ org_name: 'Demo Studio', name: 'Demo Owner', email: DEMO.email, password: DEMO.password }, 'seed');
  const org = db.prepare('SELECT o.* FROM orgs o JOIN users u ON u.org_id = o.id WHERE u.email = ?').get(DEMO.email);
  const entities = createEntities(db);
  const backdate = (table, id, cols) => {
    const keys = Object.keys(cols);
    db.prepare(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(k => cols[k]), id);
  };

  const people = [
    ['Avery Stone', 'Stone Dental', 'referral'], ['Jordan Lee', 'Lee & Co Roofing', 'web-form'],
    ['Sam Rivera', 'Rivera Fitness', 'web-form'], ['Morgan Patel', 'Patel Law', 'referral'],
    ['Casey Kim', 'Kim Bakery', 'cold-email'], ['Riley Brooks', 'Brooks Auto', 'cold-email'],
    ['Taylor Reed', 'Reed Landscaping', 'web-form']
  ].map(([name, company, source], i) => {
    const contact = entities.create(org, 'contacts', {
      name, company, source, email: `${name.split(' ')[0].toLowerCase()}@example.com`, status: i < 6 ? 'contacted' : 'new'
    });
    backdate('contacts', contact.id, { created_at: daysAgo(100 - i * 14), last_contacted_at: i < 6 ? daysAgo(20) : null });
    return contact;
  });

  // [contact index, title, dollars, stage, days since created, days since closed or last stage change]
  const deals = [
    [0, 'Website rebuild', 6400, 'won', 130, 100], [3, 'Monthly retainer setup', 3200, 'won', 95, 70],
    [0, 'SEO package', 4800, 'won', 70, 40], [1, 'Booking system', 5200, 'won', 40, 6],
    [4, 'Brand refresh', 2100, 'lost', 60, 30], [2, 'Member portal', 9000, 'negotiation', 30, 3],
    [3, 'Intake automation', 4500, 'proposal', 35, 21], [5, 'Service page redesign', 2800, 'qualified', 12, 5],
    [1, 'Review campaign', 1500, 'lead', 4, 4]
  ].map(([c, title, dollars, stage, created, changed]) => {
    const deal = entities.create(org, 'deals', { contact_id: people[c].id, title, value_cents: dollars * 100, stage: 'lead' });
    const item = stage === 'lead' ? deal : entities.update(org, 'deals', deal.id, { stage });
    backdate('deals', deal.id, {
      created_at: daysAgo(created), stage_changed_at: daysAgo(changed), closed_at: item.closed_at ? daysAgo(changed) : null
    });
    return { ...item, title };
  });
  entities.update(org, 'deals', deals[5].id, { expected_close: dateIn(10) });
  entities.update(org, 'deals', deals[7].id, { expected_close: dateIn(-2) });

  // Invoice the first three wins: two paid, one overdue. The fourth win is left un-invoiced on purpose.
  [[0, 'paid', 95], [1, 'paid', 60], [2, 'sent', 38]].forEach(([d, status, issued]) => {
    const deal = deals[d];
    const invoice = entities.create(org, 'invoices', {
      contact_id: deal.contact_id, deal_id: deal.id, status,
      items: [{ description: deal.title, quantity: 1, unit_cents: deal.value_cents }], due_date: dateIn(14 - issued)
    });
    backdate('invoices', invoice.id, { issued_at: daysAgo(issued), paid_at: status === 'paid' ? daysAgo(issued - 10) : null });
  });

  entities.create(org, 'tasks', { title: 'Send revised quote to Sam', deal_id: deals[5].id, contact_id: people[2].id, due_date: dateIn(1) });
  entities.create(org, 'tasks', { title: 'Call Riley about scope', contact_id: people[5].id, due_date: dateIn(-3) });
  return { created: true, ...DEMO };
}

module.exports = { seedDemo, DEMO };
