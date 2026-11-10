'use strict';
/** Server-rendered pages that customers of a workspace see: the lead form and the invoice. */

const { escapeHtml: e } = require('./http');

function money(cents, currency) {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

const page = (title, body) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(title)}</title><link rel="stylesheet" href="/styles.css"></head>
<body class="public"><main class="public-card">${body}</main></body></html>`;

function leadFormPage(org, { error = '', values = {} } = {}) {
  const field = (name, label, type = 'text', extra = '') =>
    `<label>${label}<input type="${type}" name="${name}" value="${e(values[name])}" ${extra}></label>`;
  return page(`Contact ${org.name}`, `
    <h1>Contact ${e(org.name)}</h1>
    <p class="muted">Tell us what you need and we will get back to you.</p>
    ${error ? `<p class="error" role="alert">${e(error)}</p>` : ''}
    <form method="post" class="stack">
      ${field('name', 'Name', 'text', 'required maxlength="120" autocomplete="name"')}
      ${field('email', 'Email', 'email', 'maxlength="200" autocomplete="email"')}
      ${field('phone', 'Phone', 'tel', 'maxlength="40" autocomplete="tel"')}
      ${field('company', 'Company (optional)', 'text', 'maxlength="120"')}
      <label>How can we help?<textarea name="message" rows="4" maxlength="2000">${e(values.message)}</textarea></label>
      <label class="hp" aria-hidden="true">Leave this empty<input type="text" name="website" tabindex="-1" autocomplete="off"></label>
      <button type="submit" class="primary">Send</button>
    </form>`);
}

const leadThanksPage = org => page('Thank you', `
    <h1>Thank you</h1>
    <p>${e(org.name)} has your message and will reply soon.</p>`);

function invoicePage(org, invoice, contact) {
  const rows = invoice.items.map(item => `
      <tr><td>${e(item.description)}</td><td class="num">${e(item.quantity)}</td>
      <td class="num">${e(money(item.unit_cents, org.currency))}</td>
      <td class="num">${e(money(Math.round(item.quantity * item.unit_cents), org.currency))}</td></tr>`).join('');
  const payable = invoice.status === 'sent' && org.payment_url;
  return page(`Invoice ${invoice.number}`, `
    <div class="row between">
      <div><h1>Invoice ${e(invoice.number)}</h1><p class="muted">From ${e(org.name)}</p></div>
      <span class="badge ${e(invoice.status)}">${e(invoice.status)}</span>
    </div>
    <p>${contact ? `Billed to <strong>${e(contact.name)}</strong>${contact.company ? `, ${e(contact.company)}` : ''}<br>` : ''}
    ${invoice.issued_at ? `Issued ${e(invoice.issued_at.slice(0, 10))}` : ''}${invoice.due_date ? ` &middot; Due ${e(invoice.due_date)}` : ''}</p>
    <div class="table-wrap"><table>
      <thead><tr><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><th colspan="3">Total</th><th class="num">${e(money(invoice.total_cents, org.currency))}</th></tr></tfoot>
    </table></div>
    ${payable ? `<p><a class="button primary" href="${e(org.payment_url)}" rel="noopener">Pay ${e(money(invoice.total_cents, org.currency))}</a></p>` : ''}
    ${invoice.status === 'paid' ? '<p class="ok">Paid. Thank you.</p>' : ''}`);
}

const notFoundPage = () => page('Not found', '<h1>Not found</h1><p>This link is not valid any more.</p>');

module.exports = { leadFormPage, leadThanksPage, invoicePage, notFoundPage };
