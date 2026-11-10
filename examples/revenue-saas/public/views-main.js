// Dashboard, pipeline board and leads.
import { h, api, money, toCents, shortDate, attempt, toast, field, select, form, pageHead, emptyRow } from '/ui.js';

const OPEN_STAGES = ['lead', 'qualified', 'proposal', 'negotiation'];
const STAGE_LABEL = { lead: 'Lead', qualified: 'Qualified', proposal: 'Proposal', negotiation: 'Negotiation', won: 'Won', lost: 'Lost' };
const CONTACT_STATUSES = ['new', 'contacted', 'qualified', 'customer', 'lost'];
const ACTION_META = {
  overdue_invoice: { tag: 'Cash', cls: 'cash', href: '#/invoices', cta: 'Open invoices' },
  uninvoiced_win: { tag: 'Cash', cls: 'cash', href: '#/invoices', cta: 'Create invoice' },
  new_lead: { tag: 'Lead', cls: 'lead', href: '#/leads', cta: 'Open leads' },
  past_close_date: { tag: 'Deal', cls: '', href: '#/pipeline', cta: 'Open pipeline' },
  stale_deal: { tag: 'Deal', cls: '', href: '#/pipeline', cta: 'Open pipeline' },
  overdue_task: { tag: 'Task', cls: '', href: '#/tasks', cta: 'Open tasks' }
};

const capitalize = text => text.charAt(0).toUpperCase() + text.slice(1);
const options = list => list.map(value => [value, capitalize(value)]);

function kpi(label, value, sub, subClass = '') {
  return h('div', { class: 'kpi' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value),
    h('div', { class: `sub ${subClass}` }, sub));
}

function bookedDelta(m) {
  const now = m.booked_this_month_cents;
  const before = m.booked_last_month_cents;
  if (!before) return ['No sales last month to compare', ''];
  const pct = Math.round(((now - before) / before) * 100);
  return [`${pct >= 0 ? '+' : ''}${pct}% vs last month (${money(before)})`, pct >= 0 ? 'up' : 'down'];
}

function revenueBars(rows) {
  const max = Math.max(...rows.map(r => r.booked_cents), 1);
  return h('div', { class: 'bars', role: 'img', 'aria-label': 'Booked revenue for the last six months' }, rows.map(r =>
    h('div', { class: 'bar-col', title: `${r.month}: ${money(r.booked_cents)} booked, ${money(r.collected_cents)} collected` },
      h('div', { class: 'bar-val' }, r.booked_cents ? money(r.booked_cents, { compact: true }) : ''),
      h('div', { class: 'bar', style: `height:${Math.round((r.booked_cents / max) * 78)}%` }),
      h('div', { class: 'bar-month' }, new Date(`${r.month}-15`).toLocaleDateString(undefined, { month: 'short' })))));
}

export async function dashboard(root) {
  const { metrics: m, actions } = await api('GET', '/api/dashboard');
  const [delta, deltaClass] = bookedDelta(m);
  const pct = value => (value == null ? 'No data yet' : `${Math.round(value * 100)}%`);

  root.replaceChildren(
    pageHead('Dashboard', 'Where your revenue stands and what to do about it today.'),
    h('div', { class: 'kpis' },
      kpi('Booked this month', money(m.booked_this_month_cents), delta, deltaClass),
      kpi('Collected this month', money(m.collected_this_month_cents), 'Invoices marked paid'),
      kpi('Open pipeline', money(m.open_pipeline_cents), `${m.open_deals} open deal${m.open_deals === 1 ? '' : 's'}`),
      kpi('Weighted forecast', money(m.weighted_forecast_cents), 'Pipeline x chance to close'),
      kpi('Win rate', pct(m.win_rate), m.avg_deal_cents == null ? 'Close a deal to see this'
        : `Avg deal ${money(m.avg_deal_cents)}, ${m.avg_cycle_days} days to close`),
      kpi('Unpaid invoices', money(m.outstanding_cents), m.overdue_cents ? `${money(m.overdue_cents)} overdue` : 'Nothing overdue',
        m.overdue_cents ? 'down' : '')),
    h('div', { class: 'two-col' },
      h('section', { class: 'card' },
        h('h2', {}, 'Do these next'),
        actions.length
          ? h('ul', { class: 'actions' }, actions.map(a => {
            const meta = ACTION_META[a.type];
            return h('li', {},
              h('span', { class: `tag ${meta.cls}` }, meta.tag),
              h('div', { class: 'grow' }, h('div', { class: 'title' }, a.title), h('div', { class: 'detail' }, a.detail)),
              a.value_cents ? h('strong', { class: 'num' }, money(a.value_cents)) : null,
              h('a', { class: 'button small', href: meta.href }, meta.cta));
          }))
          : h('p', { class: 'empty' }, 'Nothing urgent. Add leads and deals and this list will tell you where the money is.')),
      h('div', { class: 'cards' },
        h('section', { class: 'card' }, h('h2', {}, 'Booked revenue, last 6 months'), revenueBars(m.revenue_by_month)),
        h('section', { class: 'card' },
          h('h2', {}, 'Where customers come from'),
          h('div', { class: 'table-wrap' }, h('table', {},
            h('thead', {}, h('tr', {}, h('th', {}, 'Source'), h('th', { class: 'num' }, 'Leads'),
              h('th', { class: 'num' }, 'Customers'), h('th', { class: 'num' }, 'Won'))),
            h('tbody', {}, m.lead_sources.length
              ? m.lead_sources.map(s => h('tr', {}, h('td', {}, s.source), h('td', { class: 'num' }, s.leads),
                h('td', { class: 'num' }, s.customers), h('td', { class: 'num' }, money(s.won_cents))))
              : emptyRow(4, 'No leads yet.'))))))));
}

export async function pipeline(root, rerender) {
  const [{ items: deals }, { items: contacts }] = await Promise.all([api('GET', '/api/deals'), api('GET', '/api/contacts')]);
  const contactName = id => (contacts.find(c => c.id === id) || {}).name || '';
  const move = (deal, stage) => attempt(() => api('PATCH', `/api/deals/${deal.id}`, { stage }),
    stage === 'won' ? `Won: ${money(deal.value_cents)} booked` : null).then(rerender);

  const card = deal => h('div', {
    class: 'deal', draggable: 'true',
    ondragstart: event => event.dataTransfer.setData('text/plain', deal.id)
  },
    h('div', { class: 'title' }, deal.title),
    h('div', { class: 'meta' }, [contactName(deal.contact_id), deal.expected_close && `closes ${shortDate(deal.expected_close)}`].filter(Boolean).join(' - ')),
    h('div', { class: 'row between' },
      h('span', { class: 'value' }, money(deal.value_cents)),
      h('select', { 'aria-label': `Move ${deal.title} to stage`, onchange: event => move(deal, event.target.value) },
        Object.entries(STAGE_LABEL).map(([value, label]) => h('option', { value, selected: value === deal.stage }, label)))));

  const column = stage => {
    const rows = deals.filter(d => d.stage === stage);
    const el = h('section', {
      class: 'column',
      ondragover: event => { event.preventDefault(); el.classList.add('over'); },
      ondragleave: () => el.classList.remove('over'),
      ondrop: event => {
        event.preventDefault();
        el.classList.remove('over');
        const deal = deals.find(d => d.id === event.dataTransfer.getData('text/plain'));
        if (deal && deal.stage !== stage) move(deal, stage);
      }
    },
      h('h2', {}, STAGE_LABEL[stage]),
      h('div', { class: 'col-total' }, `${rows.length} - ${money(rows.reduce((sum, d) => sum + d.value_cents, 0))}`),
      rows.map(card));
    return el;
  };

  const closed = deals.filter(d => !OPEN_STAGES.includes(d.stage));
  root.replaceChildren(
    pageHead('Pipeline', 'Drag a deal to its next stage, or use the menu on the card.'),
    h('details', { class: 'card', open: deals.length === 0 }, h('summary', {}, 'Add a deal'),
      form({ class: 'form-grid' }, async (values, el) => {
        const cents = toCents(values.value || '0');
        if (cents == null) return toast('Value must be an amount like 2500 or 2500.50.', true);
        const ok = await attempt(() => api('POST', '/api/deals', {
          title: values.title, value_cents: cents, contact_id: values.contact_id || null, expected_close: values.expected_close || null
        }), 'Deal added');
        if (ok) { el.reset(); rerender(); }
      },
        field('What are you selling?', 'title', { required: true, maxlength: 160 }),
        field('Value', 'value', { inputmode: 'decimal', placeholder: '2500' }),
        select('Contact', 'contact_id', [['', 'No contact'], ...contacts.map(c => [c.id, c.name])], ''),
        field('Expected close', 'expected_close', { type: 'date' }),
        h('button', { type: 'submit', class: 'primary' }, 'Add deal'))),
    h('div', { class: 'board', style: 'margin-top:16px' }, OPEN_STAGES.map(column)),
    h('section', { class: 'card', style: 'margin-top:16px' },
      h('h2', {}, 'Closed deals'),
      h('div', { class: 'table-wrap' }, h('table', {},
        h('thead', {}, h('tr', {}, h('th', {}, 'Deal'), h('th', {}, 'Contact'), h('th', {}, 'Result'), h('th', {}, 'Closed'),
          h('th', { class: 'num' }, 'Value'), h('th', {}, ''))),
        h('tbody', {}, closed.length ? closed.map(d => h('tr', {},
          h('td', {}, d.title), h('td', {}, contactName(d.contact_id)),
          h('td', {}, h('span', { class: `badge ${d.stage}` }, d.stage)), h('td', {}, shortDate(d.closed_at)),
          h('td', { class: 'num' }, money(d.value_cents)),
          h('td', { class: 'num' }, h('button', { class: 'small', onclick: () => move(d, 'negotiation') }, 'Reopen'))))
          : emptyRow(6, 'No closed deals yet.'))))));
}

export async function leads(root, rerender) {
  const { items: contacts } = await api('GET', '/api/contacts');
  const patch = (id, body, message) => attempt(() => api('PATCH', `/api/contacts/${id}`, body), message).then(rerender);

  root.replaceChildren(
    pageHead('Leads and contacts', 'Everyone who might buy, has bought, or filled in your lead form.'),
    h('details', { class: 'card', open: contacts.length === 0 }, h('summary', {}, 'Add a contact'),
      form({ class: 'form-grid' }, async (values, el) => {
        const ok = await attempt(() => api('POST', '/api/contacts', values), 'Contact added');
        if (ok) { el.reset(); rerender(); }
      },
        field('Name', 'name', { required: true, maxlength: 120 }),
        field('Email', 'email', { type: 'email' }),
        field('Phone', 'phone', { type: 'tel' }),
        field('Company', 'company'),
        field('Source', 'source', { placeholder: 'referral, ad, event...' }),
        h('button', { type: 'submit', class: 'primary' }, 'Add contact'))),
    h('section', { class: 'card', style: 'margin-top:16px' }, h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Name'), h('th', {}, 'Reach them'), h('th', {}, 'Source'), h('th', {}, 'Status'),
        h('th', {}, 'Last contact'), h('th', {}, ''))),
      h('tbody', {}, contacts.length ? contacts.map(c => h('tr', {},
        h('td', {}, h('strong', {}, c.name), c.company && h('div', { class: 'muted' }, c.company),
          c.notes && h('div', { class: 'muted' }, c.notes.length > 90 ? `${c.notes.slice(0, 90)}...` : c.notes)),
        h('td', {}, c.email && h('div', {}, h('a', { href: `mailto:${c.email}` }, c.email)), c.phone && h('div', {}, c.phone)),
        h('td', {}, c.source || '-'),
        h('td', {}, h('select', { 'aria-label': `Status for ${c.name}`, onchange: event => patch(c.id, { status: event.target.value }) },
          options(CONTACT_STATUSES).map(([value, label]) => h('option', { value, selected: value === c.status }, label)))),
        h('td', {}, c.last_contacted_at ? shortDate(c.last_contacted_at) : h('span', { class: 'badge new' }, 'Never')),
        h('td', { class: 'num' },
          h('button', { class: 'small', onclick: () => patch(c.id, { contacted: true }, 'Logged') }, 'Log contact'), ' ',
          h('button', {
            class: 'small danger',
            onclick: () => confirm(`Delete ${c.name}? Their deals and invoices stay, without a contact.`)
              && attempt(() => api('DELETE', `/api/contacts/${c.id}`, {}), 'Deleted').then(rerender)
          }, 'Delete'))))
        : emptyRow(6, 'No contacts yet. Add one above, or share your lead form from Settings.'))))));
}
