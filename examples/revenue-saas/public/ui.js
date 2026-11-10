// Shared browser helpers. All DOM is built with h() and text nodes, never innerHTML, so user data cannot inject markup.

export const state = { me: null };

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
    else if (key === 'class') el.className = value;
    else if (key === 'value') el.value = value;
    else if (key === 'style') el.style.cssText = value; // CSSOM, so it works under a strict Content-Security-Policy
    else if (key === 'checked' || key === 'selected' || key === 'disabled' || key === 'required' || key === 'open') el[key] = Boolean(value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function api(method, path, body) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && state.me) {
    location.reload(); // session ended; show the login screen
  }
  if (!res.ok) throw new ApiError(res.status, data.error || 'Something went wrong.');
  return data;
}

export function money(cents, { compact = false } = {}) {
  const currency = (state.me && state.me.org.currency) || 'USD';
  const options = compact
    ? { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 }
    : { style: 'currency', currency, maximumFractionDigits: cents % 100 === 0 ? 0 : 2 };
  return new Intl.NumberFormat(undefined, options).format(cents / 100);
}

/** "1,250.50" -> 125050. Returns null for anything that is not a non-negative amount. */
export function toCents(text) {
  const clean = String(text).replace(/[,\s$]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  return Math.round(Number(clean) * 100);
}

export const today = () => new Date().toISOString().slice(0, 10);
export const shortDate = iso => (iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  .toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '');

let toastTimer;
export function toast(message, bad = false) {
  document.querySelectorAll('.toast').forEach(el => el.remove());
  document.body.append(h('div', { class: `toast${bad ? ' bad' : ''}`, role: 'status' }, message));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => document.querySelectorAll('.toast').forEach(el => el.remove()), bad ? 6000 : 2500);
}

/** Runs an action, shows any error as a toast, and reports whether it worked. */
export async function attempt(fn, successMessage) {
  try {
    await fn();
    if (successMessage) toast(successMessage);
    return true;
  } catch (err) {
    toast(err.message, true);
    return false;
  }
}

export function field(label, name, attrs = {}) {
  return h('label', {}, label, h('input', { name, ...attrs }));
}

export function select(label, name, options, value) {
  const el = h('select', { name }, options.map(([val, text]) => h('option', { value: val, selected: val === value }, text)));
  return label ? h('label', {}, label, el) : el;
}

/** Builds a form whose submit handler receives a plain object of its values. Disables the button while saving. */
export function form(attrs, onSubmit, ...children) {
  const el = h('form', {
    ...attrs,
    onsubmit: async event => {
      event.preventDefault();
      const button = el.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        await onSubmit(Object.fromEntries(new FormData(el)), el);
      } finally {
        if (button) button.disabled = false;
      }
    }
  }, ...children);
  return el;
}

export const pageHead = (title, subtitle) => h('div', { class: 'page-head' }, h('h1', {}, title), subtitle && h('p', { class: 'muted' }, subtitle));
export const emptyRow = (cols, text) => h('tr', {}, h('td', { colspan: cols, class: 'empty' }, text));
