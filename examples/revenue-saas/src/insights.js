'use strict';
/**
 * Revenue math. Pure functions over plain rows so they can be tested without a database.
 *
 * Two different money numbers are kept apart on purpose:
 *   booked    = value of deals marked won (by closed_at)
 *   collected = total of invoices marked paid (by paid_at)
 */

const STAGES = ['lead', 'qualified', 'proposal', 'negotiation', 'won', 'lost'];
const OPEN_STAGES = ['lead', 'qualified', 'proposal', 'negotiation'];
// Default chance of closing per stage, used for the weighted forecast.
const STAGE_PROBABILITY = { lead: 0.1, qualified: 0.25, proposal: 0.5, negotiation: 0.75, won: 1, lost: 0 };

const DAY_MS = 86400000;
const STALE_DEAL_DAYS = 14;

const monthKey = iso => (iso ? String(iso).slice(0, 7) : '');
const sum = (rows, pick) => rows.reduce((total, row) => total + (pick(row) || 0), 0);

function shiftMonth(key, delta) {
  const [y, m] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function computeMetrics({ contacts = [], deals = [], invoices = [] }, now = new Date()) {
  const thisMonth = now.toISOString().slice(0, 7);
  const lastMonth = shiftMonth(thisMonth, -1);
  const today = now.toISOString().slice(0, 10);

  const won = deals.filter(d => d.stage === 'won');
  const lost = deals.filter(d => d.stage === 'lost');
  const open = deals.filter(d => OPEN_STAGES.includes(d.stage));
  const paid = invoices.filter(i => i.status === 'paid');
  const unpaid = invoices.filter(i => i.status === 'sent');

  const cycles = won
    .filter(d => d.closed_at && d.created_at)
    .map(d => (Date.parse(d.closed_at) - Date.parse(d.created_at)) / DAY_MS);

  const revenueByMonth = [];
  for (let i = 5; i >= 0; i--) {
    const key = shiftMonth(thisMonth, -i);
    revenueByMonth.push({
      month: key,
      booked_cents: sum(won.filter(d => monthKey(d.closed_at) === key), d => d.value_cents),
      collected_cents: sum(paid.filter(inv => monthKey(inv.paid_at) === key), inv => inv.total_cents)
    });
  }

  const sources = new Map();
  for (const c of contacts) {
    const key = c.source || 'unknown';
    const row = sources.get(key) || { source: key, leads: 0, customers: 0, won_cents: 0 };
    row.leads += 1;
    if (c.status === 'customer') row.customers += 1;
    row.won_cents += sum(won.filter(d => d.contact_id === c.id), d => d.value_cents);
    sources.set(key, row);
  }

  const byStage = OPEN_STAGES.map(stage => {
    const rows = open.filter(d => d.stage === stage);
    return { stage, count: rows.length, value_cents: sum(rows, d => d.value_cents) };
  });

  const closed = won.length + lost.length;
  return {
    booked_this_month_cents: sum(won.filter(d => monthKey(d.closed_at) === thisMonth), d => d.value_cents),
    booked_last_month_cents: sum(won.filter(d => monthKey(d.closed_at) === lastMonth), d => d.value_cents),
    collected_this_month_cents: sum(paid.filter(i => monthKey(i.paid_at) === thisMonth), i => i.total_cents),
    open_pipeline_cents: sum(open, d => d.value_cents),
    weighted_forecast_cents: Math.round(sum(open, d => d.value_cents * STAGE_PROBABILITY[d.stage])),
    open_deals: open.length,
    // null (not 0) when there is nothing to measure yet, so the UI can say "no data".
    win_rate: closed ? won.length / closed : null,
    avg_deal_cents: won.length ? Math.round(sum(won, d => d.value_cents) / won.length) : null,
    avg_cycle_days: cycles.length ? Math.round((sum(cycles, x => x) / cycles.length) * 10) / 10 : null,
    outstanding_cents: sum(unpaid, i => i.total_cents),
    overdue_cents: sum(unpaid.filter(i => i.due_date && i.due_date < today), i => i.total_cents),
    revenue_by_month: revenueByMonth,
    by_stage: byStage,
    lead_sources: [...sources.values()].sort((a, b) => b.won_cents - a.won_cents || b.leads - a.leads)
  };
}

/**
 * The "do these next" list: concrete actions ranked by how close they are to cash
 * and how much money is attached.
 */
function nextActions({ contacts = [], deals = [], tasks = [], invoices = [] }, now = new Date(), limit = 12) {
  const today = now.toISOString().slice(0, 10);
  const t = now.getTime();
  const contactName = id => (contacts.find(c => c.id === id) || {}).name || 'Unknown contact';
  const daysSince = iso => Math.floor((t - Date.parse(iso)) / DAY_MS);
  const out = [];
  const add = (type, base, valueCents, title, detail, ref) => {
    const score = base + Math.min(9, Math.log10(1 + (valueCents || 0) / 100));
    out.push({ type, score: Math.round(score * 100) / 100, value_cents: valueCents || 0, title, detail, ref });
  };

  for (const inv of invoices) {
    if (inv.status === 'sent' && inv.due_date && inv.due_date < today) {
      const days = Math.floor((Date.parse(today) - Date.parse(inv.due_date)) / DAY_MS);
      add('overdue_invoice', 90, inv.total_cents, `Chase invoice ${inv.number}`,
        `${contactName(inv.contact_id)} is ${days} day${days === 1 ? '' : 's'} past due.`, { invoice_id: inv.id });
    }
  }

  const invoicedDeals = new Set(invoices.filter(i => i.status !== 'void' && i.deal_id).map(i => i.deal_id));
  const dealsWithOpenTask = new Set(tasks.filter(k => !k.done_at && k.deal_id).map(k => k.deal_id));
  for (const d of deals) {
    if (d.stage === 'won' && !invoicedDeals.has(d.id) && d.value_cents > 0) {
      add('uninvoiced_win', 80, d.value_cents, `Invoice "${d.title}"`,
        'This deal is won but has no invoice yet.', { deal_id: d.id });
    }
    if (!OPEN_STAGES.includes(d.stage)) continue;
    if (d.expected_close && d.expected_close < today) {
      add('past_close_date', 60, d.value_cents, `Close or re-date "${d.title}"`,
        `Expected to close on ${d.expected_close}. Ask for a decision or set a new date.`, { deal_id: d.id });
    } else if (daysSince(d.stage_changed_at || d.created_at) >= STALE_DEAL_DAYS && !dealsWithOpenTask.has(d.id)) {
      add('stale_deal', 50, d.value_cents, `Follow up on "${d.title}"`,
        `No movement for ${daysSince(d.stage_changed_at || d.created_at)} days and no follow-up scheduled.`,
        { deal_id: d.id });
    }
  }

  for (const c of contacts) {
    if (c.status === 'new' && !c.last_contacted_at) {
      const days = daysSince(c.created_at);
      add('new_lead', 70, 0, `Contact new lead ${c.name}`,
        days < 1 ? 'Came in today. Fast replies win more deals.' : `Waiting ${days} day${days === 1 ? '' : 's'} for a first reply.`,
        { contact_id: c.id });
    }
  }

  for (const k of tasks) {
    if (!k.done_at && k.due_date && k.due_date < today) {
      add('overdue_task', 40, 0, k.title, `Was due ${k.due_date}.`, { task_id: k.id });
    }
  }

  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}

module.exports = { STAGES, OPEN_STAGES, STAGE_PROBABILITY, STALE_DEAL_DAYS, computeMetrics, nextActions, shiftMonth };
