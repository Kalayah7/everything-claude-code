'use strict';
/** Tenant-scoped CRUD for contacts, deals, tasks and invoices. Nothing here runs without an org id. */

const crypto = require('node:crypto');
const { HttpError, v } = require('./http');
const { STAGES } = require('./insights');
const { planFor } = require('./billing');

const CONTACT_STATUSES = ['new', 'contacted', 'qualified', 'customer', 'lost'];
const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'];
const nowIso = () => new Date().toISOString();

function cleanItems(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) {
    throw new HttpError(400, 'An invoice needs between 1 and 50 line items.');
  }
  return value.map((item, i) => {
    const label = `Line ${i + 1}`;
    if (!item || typeof item !== 'object') throw new HttpError(400, `${label} is not valid.`);
    const quantity = item.quantity == null ? 1 : item.quantity;
    if (typeof quantity !== 'number' || !(quantity > 0) || quantity > 1e6) {
      throw new HttpError(400, `${label} quantity must be more than 0.`);
    }
    return {
      description: v.string(200, { required: true })(item.description, `${label} description`),
      quantity,
      unit_cents: v.cents()(item.unit_cents, `${label} price`)
    };
  });
}

const DEFS = {
  contacts: {
    fields: {
      name: v.string(120, { required: true }), email: v.email(), phone: v.string(40), company: v.string(120),
      source: v.string(60), status: v.oneOf(CONTACT_STATUSES), notes: v.string(5000)
    },
    labels: { name: 'Name', email: 'Email', phone: 'Phone', company: 'Company', source: 'Source', status: 'Status', notes: 'Notes' },
    required: ['name']
  },
  deals: {
    fields: {
      title: v.string(160, { required: true }), value_cents: v.cents(), stage: v.oneOf(STAGES),
      expected_close: v.date(), contact_id: v.id()
    },
    labels: { title: 'Title', value_cents: 'Value', stage: 'Stage', expected_close: 'Expected close', contact_id: 'Contact' },
    required: ['title']
  },
  tasks: {
    fields: { title: v.string(200, { required: true }), due_date: v.date(), contact_id: v.id(), deal_id: v.id() },
    labels: { title: 'Title', due_date: 'Due date', contact_id: 'Contact', deal_id: 'Deal' },
    required: ['title']
  },
  invoices: {
    fields: { contact_id: v.id(), deal_id: v.id(), due_date: v.date(), status: v.oneOf(INVOICE_STATUSES) },
    labels: { contact_id: 'Contact', deal_id: 'Deal', due_date: 'Due date', status: 'Status' },
    required: []
  }
};

function createEntities(db) {
  const one = (table, orgId, id) => db.prepare(`SELECT * FROM ${table} WHERE org_id = ? AND id = ?`).get(orgId, id);
  const count = (sql, ...args) => db.prepare(sql).get(...args).n;

  function present(table, row) {
    if (!row) return row;
    const out = { ...row };
    if (table === 'invoices') out.items = JSON.parse(out.items);
    return out;
  }

  function clean(table, body, partial) {
    const def = DEFS[table];
    const out = {};
    for (const [field, validate] of Object.entries(def.fields)) {
      if (body[field] === undefined) {
        if (!partial && def.required.includes(field)) throw new HttpError(400, `${def.labels[field]} is required.`);
        continue;
      }
      out[field] = validate(body[field], def.labels[field]);
    }
    return out;
  }

  function checkRefs(orgId, cols) {
    if (cols.contact_id && !one('contacts', orgId, cols.contact_id)) throw new HttpError(400, 'That contact does not exist.');
    if (cols.deal_id && !one('deals', orgId, cols.deal_id)) throw new HttpError(400, 'That deal does not exist.');
  }

  function insert(table, orgId, cols) {
    const row = { id: crypto.randomUUID(), org_id: orgId, created_at: nowIso(), ...cols };
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
      .run(...keys.map(k => row[k]));
    return present(table, one(table, orgId, row.id));
  }

  function list(org, table) {
    return db.prepare(`SELECT * FROM ${table} WHERE org_id = ? ORDER BY created_at DESC`).all(org.id)
      .map(row => present(table, row));
  }

  function create(org, table, body) {
    const cols = clean(table, body, false);
    checkRefs(org.id, cols);
    const plan = planFor(org);
    const now = nowIso();

    if (table === 'contacts') {
      const used = count('SELECT COUNT(*) AS n FROM contacts WHERE org_id = ?', org.id);
      if (used >= plan.contacts) {
        throw new HttpError(402, `Your ${plan.name} plan holds ${plan.contacts} contacts. Upgrade in Settings to add more.`);
      }
    }
    if (table === 'deals') {
      const stage = cols.stage || 'lead';
      Object.assign(cols, { stage, stage_changed_at: now, closed_at: ['won', 'lost'].includes(stage) ? now : null });
    }
    if (table === 'invoices') {
      const used = count('SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND created_at >= ?', org.id, `${now.slice(0, 7)}-01`);
      if (used >= plan.invoices_per_month) {
        throw new HttpError(402, `Your ${plan.name} plan includes ${plan.invoices_per_month} invoices a month. Upgrade in Settings to send more.`);
      }
      const items = cleanItems(body.items);
      // Highest number so far, not a row count, so deleting an invoice never causes a repeat.
      const next = count('SELECT COALESCE(MAX(CAST(substr(number, 5) AS INTEGER)), 0) AS n FROM invoices WHERE org_id = ?', org.id) + 1;
      const status = cols.status || 'draft';
      Object.assign(cols, {
        items: JSON.stringify(items),
        total_cents: Math.round(items.reduce((sum, item) => sum + item.quantity * item.unit_cents, 0)),
        number: `INV-${String(next).padStart(4, '0')}`,
        status,
        issued_at: status === 'draft' ? null : now,
        paid_at: status === 'paid' ? now : null,
        public_token: crypto.randomBytes(16).toString('hex')
      });
    }
    return insert(table, org.id, cols);
  }

  function update(org, table, id, body) {
    const existing = one(table, org.id, id);
    if (!existing) throw new HttpError(404, 'Not found.');
    const cols = clean(table, body, true);
    checkRefs(org.id, cols);
    const now = nowIso();

    if (table === 'contacts' && body.contacted === true) {
      cols.last_contacted_at = now;
      if (existing.status === 'new' && !cols.status) cols.status = 'contacted';
    }
    if (table === 'deals' && cols.stage && cols.stage !== existing.stage) {
      cols.stage_changed_at = now;
      cols.closed_at = ['won', 'lost'].includes(cols.stage) ? now : null;
      const contactId = cols.contact_id || existing.contact_id;
      if (cols.stage === 'won' && contactId) {
        db.prepare("UPDATE contacts SET status = 'customer' WHERE org_id = ? AND id = ?").run(org.id, contactId);
      }
    }
    if (table === 'tasks' && typeof body.done === 'boolean') cols.done_at = body.done ? now : null;
    if (table === 'invoices') {
      if (body.items !== undefined) {
        if (existing.status !== 'draft') throw new HttpError(409, 'Only draft invoices can have their lines changed.');
        const items = cleanItems(body.items);
        cols.items = JSON.stringify(items);
        cols.total_cents = Math.round(items.reduce((sum, item) => sum + item.quantity * item.unit_cents, 0));
      }
      if (cols.status && cols.status !== existing.status) {
        if (cols.status !== 'draft' && !existing.issued_at) cols.issued_at = now;
        cols.paid_at = cols.status === 'paid' ? now : null;
      }
    }

    const keys = Object.keys(cols);
    if (keys.length) {
      db.prepare(`UPDATE ${table} SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE org_id = ? AND id = ?`)
        .run(...keys.map(k => cols[k]), org.id, id);
    }
    return present(table, one(table, org.id, id));
  }

  function remove(org, table, id) {
    const result = db.prepare(`DELETE FROM ${table} WHERE org_id = ? AND id = ?`).run(org.id, id);
    if (!result.changes) throw new HttpError(404, 'Not found.');
  }

  /** Lead from the public form. Never blocked by plan limits: dropping a paying customer's lead is worse. */
  function captureLead(org, body) {
    const cols = {
      name: v.string(120, { required: true })(body.name, 'Name'),
      email: v.email()(body.email, 'Email'),
      phone: v.string(40)(body.phone, 'Phone'),
      company: v.string(120)(body.company, 'Company'),
      notes: v.string(2000)(body.message, 'Message'),
      source: v.string(60)(body.source, 'Source') || 'web-form',
      status: 'new'
    };
    if (!cols.email && !cols.phone) throw new HttpError(400, 'Please give an email or a phone number so we can reply.');
    const contact = insert('contacts', org.id, cols);
    insert('tasks', org.id, {
      contact_id: contact.id, title: `Reply to new lead ${contact.name}`, due_date: nowIso().slice(0, 10)
    });
    return contact;
  }

  function usage(org) {
    return {
      contacts: count('SELECT COUNT(*) AS n FROM contacts WHERE org_id = ?', org.id),
      invoices_this_month: count('SELECT COUNT(*) AS n FROM invoices WHERE org_id = ? AND created_at >= ?', org.id, `${nowIso().slice(0, 7)}-01`)
    };
  }

  return { list, create, update, remove, captureLead, usage, tables: Object.keys(DEFS) };
}

module.exports = { createEntities, CONTACT_STATUSES, INVOICE_STATUSES };
