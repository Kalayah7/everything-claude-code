// Tasks, invoices and settings.
import { state, h, api, money, toCents, today, shortDate, attempt, toast, field, select, form, pageHead, emptyRow } from '/ui.js';

export async function tasks(root, rerender) {
  const [{ items }, { items: contacts }, { items: deals }] = await Promise.all(
    [api('GET', '/api/tasks'), api('GET', '/api/contacts'), api('GET', '/api/deals')]);
  const open = items.filter(k => !k.done_at).sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'));
  const done = items.filter(k => k.done_at).slice(0, 10);
  const about = k => [(contacts.find(c => c.id === k.contact_id) || {}).name, (deals.find(d => d.id === k.deal_id) || {}).title]
    .filter(Boolean).join(' - ');

  const row = k => h('tr', {},
    h('td', { style: 'width:36px' }, h('input', {
      type: 'checkbox', checked: Boolean(k.done_at), 'aria-label': `Mark "${k.title}" done`,
      onchange: event => attempt(() => api('PATCH', `/api/tasks/${k.id}`, { done: event.target.checked })).then(rerender)
    })),
    h('td', { class: k.done_at ? 'task-done' : '' }, k.title, about(k) && h('div', { class: 'muted' }, about(k))),
    h('td', {}, k.due_date
      ? h('span', { class: !k.done_at && k.due_date < today() ? 'badge overdue' : '' }, shortDate(k.due_date)) : '-'),
    h('td', { class: 'num' }, h('button', {
      class: 'small danger', onclick: () => attempt(() => api('DELETE', `/api/tasks/${k.id}`, {})).then(rerender)
    }, 'Delete')));

  root.replaceChildren(
    pageHead('Follow-ups', 'Most sales are lost to silence. Keep a next step on every open deal.'),
    h('section', { class: 'card' },
      form({ class: 'form-grid' }, async (values, el) => {
        const ok = await attempt(() => api('POST', '/api/tasks', {
          title: values.title, due_date: values.due_date || null, contact_id: values.contact_id || null, deal_id: values.deal_id || null
        }), 'Follow-up added');
        if (ok) { el.reset(); rerender(); }
      },
        field('What needs doing?', 'title', { required: true, maxlength: 200 }),
        field('Due', 'due_date', { type: 'date', value: today() }),
        select('Contact', 'contact_id', [['', 'None'], ...contacts.map(c => [c.id, c.name])], ''),
        select('Deal', 'deal_id', [['', 'None'], ...deals.filter(d => !['won', 'lost'].includes(d.stage)).map(d => [d.id, d.title])], ''),
        h('button', { type: 'submit', class: 'primary' }, 'Add follow-up'))),
    h('section', { class: 'card', style: 'margin-top:16px' }, h('h2', {}, `Open (${open.length})`),
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, open.length ? open.map(row) : emptyRow(4, 'All caught up.'))))),
    done.length ? h('section', { class: 'card', style: 'margin-top:16px' }, h('h2', {}, 'Recently done'),
      h('div', { class: 'table-wrap' }, h('table', {}, h('tbody', {}, done.map(row))))) : null);
}

function lineRow(line = {}) {
  const row = h('div', { class: 'form-grid line', style: 'grid-template-columns: 3fr 1fr 1fr auto' },
    field('Description', 'description', { value: line.description || '', required: true, maxlength: 200 }),
    field('Qty', 'quantity', { value: line.quantity || '1', inputmode: 'decimal' }),
    field('Unit price', 'unit', { value: line.unit || '', inputmode: 'decimal', required: true }),
    h('button', { type: 'button', class: 'small', 'aria-label': 'Remove line', onclick: () => {
      if (row.parentElement.querySelectorAll('.line').length > 1) row.remove();
    } }, 'Remove'));
  return row;
}

export async function invoices(root, rerender) {
  const [{ items }, { items: contacts }, { items: deals }] = await Promise.all(
    [api('GET', '/api/invoices'), api('GET', '/api/contacts'), api('GET', '/api/deals')]);
  const contactName = id => (contacts.find(c => c.id === id) || {}).name || '-';
  const invoiced = new Set(items.filter(i => i.status !== 'void').map(i => i.deal_id));
  const billable = deals.filter(d => d.stage === 'won' && !invoiced.has(d.id));
  const setStatus = (inv, status, message) => attempt(() => api('PATCH', `/api/invoices/${inv.id}`, { status }), message).then(rerender);
  const publicUrl = inv => `${location.origin}/i/${inv.public_token}`;
  const displayStatus = inv => (inv.status === 'sent' && inv.due_date && inv.due_date < today() ? 'overdue' : inv.status);

  const lines = h('div', { class: 'stack' }, lineRow());
  const due = field('Due date', 'due_date', { type: 'date', value: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10) });
  const dealSelect = select('Won deal to bill (optional)', 'deal_id', [['', 'None'], ...billable.map(d => [d.id, `${d.title} (${money(d.value_cents)})`])], '');
  const contactSelect = select('Bill to', 'contact_id', [['', 'No contact'], ...contacts.map(c => [c.id, c.name])], '');
  dealSelect.querySelector('select').addEventListener('change', event => {
    const deal = billable.find(d => d.id === event.target.value);
    if (!deal) return;
    lines.replaceChildren(lineRow({ description: deal.title, quantity: '1', unit: (deal.value_cents / 100).toFixed(2) }));
    if (deal.contact_id) contactSelect.querySelector('select').value = deal.contact_id;
  });

  const actionsFor = inv => [
    inv.status === 'draft' && h('button', { class: 'small primary', onclick: () => setStatus(inv, 'sent', 'Marked as sent. Copy the link and send it to your customer.') }, 'Mark sent'),
    inv.status === 'sent' && h('button', { class: 'small primary', onclick: () => setStatus(inv, 'paid', `Paid: ${money(inv.total_cents)} collected`) }, 'Mark paid'),
    inv.status !== 'draft' && inv.status !== 'void' && h('button', {
      class: 'small',
      onclick: () => navigator.clipboard.writeText(publicUrl(inv)).then(() => toast('Invoice link copied'), () => prompt('Copy this link:', publicUrl(inv)))
    }, 'Copy link'),
    inv.status !== 'draft' && inv.status !== 'void' && h('a', { class: 'button small', href: publicUrl(inv), target: '_blank', rel: 'noopener' }, 'View'),
    inv.status === 'sent' && h('button', { class: 'small danger', onclick: () => confirm(`Void ${inv.number}?`) && setStatus(inv, 'void', 'Voided') }, 'Void'),
    inv.status === 'draft' && h('button', {
      class: 'small danger', onclick: () => attempt(() => api('DELETE', `/api/invoices/${inv.id}`, {}), 'Deleted').then(rerender)
    }, 'Delete')
  ].filter(Boolean).flatMap(el => [el, ' ']);

  root.replaceChildren(
    pageHead('Invoices', 'Bill won work quickly and see who still owes you.'),
    h('details', { class: 'card', open: items.length === 0 || billable.length > 0 },
      h('summary', {}, billable.length ? `New invoice (${billable.length} won deal${billable.length === 1 ? '' : 's'} not billed yet)` : 'New invoice'),
      form({ class: 'stack' }, async () => {
        const parsed = [...lines.querySelectorAll('.line')].map(row => ({
          description: row.querySelector('[name=description]').value,
          quantity: Number(row.querySelector('[name=quantity]').value),
          unit_cents: toCents(row.querySelector('[name=unit]').value)
        }));
        if (parsed.some(l => l.unit_cents == null || !(l.quantity > 0))) {
          return toast('Each line needs a quantity above 0 and a price like 150 or 150.00.', true);
        }
        const ok = await attempt(() => api('POST', '/api/invoices', {
          items: parsed, contact_id: contactSelect.querySelector('select').value || null,
          deal_id: dealSelect.querySelector('select').value || null, due_date: due.querySelector('input').value || null
        }), 'Draft invoice created');
        if (ok) rerender();
      },
        h('div', { class: 'form-grid' }, dealSelect, contactSelect),
        lines,
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'small', onclick: () => lines.append(lineRow()) }, 'Add line'),
          h('span', { class: 'grow' })),
        h('div', { class: 'form-grid' }, due, h('button', { type: 'submit', class: 'primary' }, 'Create draft')))),
    h('section', { class: 'card', style: 'margin-top:16px' }, h('div', { class: 'table-wrap' }, h('table', {},
      h('thead', {}, h('tr', {}, h('th', {}, 'Number'), h('th', {}, 'Bill to'), h('th', {}, 'Status'), h('th', {}, 'Due'),
        h('th', { class: 'num' }, 'Total'), h('th', {}, ''))),
      h('tbody', {}, items.length ? items.map(inv => h('tr', {},
        h('td', {}, h('strong', {}, inv.number)), h('td', {}, contactName(inv.contact_id)),
        h('td', {}, h('span', { class: `badge ${displayStatus(inv)}` }, displayStatus(inv))),
        h('td', {}, shortDate(inv.due_date) || '-'), h('td', { class: 'num' }, money(inv.total_cents)),
        h('td', { class: 'num' }, actionsFor(inv))))
        : emptyRow(6, 'No invoices yet.'))))));
}

export async function settings(root, rerender) {
  const billing = await api('GET', '/api/billing');
  const { org } = state.me;
  const formUrl = `${location.origin}/f/${org.form_key}`;
  const embed = `<iframe src="${formUrl}" title="Contact ${org.name}" width="100%" height="640" style="border:0"></iframe>`;
  const current = billing.plans.find(p => p.id === billing.current);
  const limitText = n => (n >= 1000000 ? 'Unlimited' : n.toLocaleString());
  const meter = (label, used, limit) => h('div', {},
    h('div', { class: 'row between' }, h('span', {}, label), h('span', { class: 'muted' }, `${used.toLocaleString()} of ${limitText(limit)}`)),
    h('div', { class: 'meter' }, h('div', { style: `width:${Math.min(100, Math.round((used / limit) * 100))}%` })));
  const copy = text => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => prompt('Copy this:', text));

  root.replaceChildren(
    pageHead('Settings'),
    h('div', { class: 'cards' },
      h('section', { class: 'card' }, h('h2', {}, 'Lead capture form'),
        h('p', { class: 'muted' }, 'Share this link or embed it on your website. Every submission becomes a lead with a same-day reply task.'),
        h('div', { class: 'row' }, h('a', { href: formUrl, target: '_blank', rel: 'noopener' }, formUrl),
          h('button', { class: 'small', onclick: () => copy(formUrl) }, 'Copy link')),
        h('p', { class: 'muted', style: 'margin-top:12px' }, 'Embed code:'),
        h('code', { class: 'snippet' }, embed),
        h('p', { style: 'margin-top:8px' }, h('button', { class: 'small', onclick: () => copy(embed) }, 'Copy embed code'))),
      h('section', { class: 'card' }, h('h2', {}, 'Workspace'),
        form({ class: 'form-grid' }, async values => {
          const ok = await attempt(async () => { state.me.org = (await api('PATCH', '/api/org', values)).org; }, 'Saved');
          if (ok) rerender();
        },
          field('Business name', 'name', { value: org.name, required: true }),
          select('Currency', 'currency', ['USD', 'EUR', 'GBP', 'CAD', 'AUD'].map(c => [c, c]), org.currency),
          field('Payment link shown on invoices (https://)', 'payment_url', { value: org.payment_url, placeholder: 'https://buy.stripe.com/...' }),
          h('button', { type: 'submit', class: 'primary' }, 'Save'))),
      h('section', { class: 'card' }, h('h2', {}, `Plan: ${current.name}`),
        h('div', { class: 'stack', style: 'max-width:420px;margin-bottom:16px' },
          meter('Contacts', billing.usage.contacts, current.contacts),
          meter('Invoices this month', billing.usage.invoices_this_month, current.invoices_per_month)),
        h('div', { class: 'plans' }, billing.plans.map(p => h('div', { class: `card plan${p.id === billing.current ? ' current' : ''}` },
          h('h2', {}, p.name),
          h('div', { class: 'kpi' }, h('div', { class: 'value' }, p.price_cents ? `$${p.price_cents / 100}` : '$0'), h('div', { class: 'sub' }, 'per month')),
          h('p', { class: 'muted', style: 'margin-top:10px' }, `${limitText(p.contacts)} contacts`, h('br'), `${limitText(p.invoices_per_month)} invoices a month`),
          p.id === billing.current ? h('span', { class: 'badge paid' }, 'Current plan')
            : p.upgrade_url ? h('a', { class: 'button primary', href: p.upgrade_url }, `Upgrade to ${p.name}`)
              : p.price_cents ? h('span', { class: 'muted' }, 'Checkout is not set up on this server yet.') : null))))));
}
