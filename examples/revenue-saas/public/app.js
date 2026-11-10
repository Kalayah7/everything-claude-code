// Entry point: session check, login/signup screen, navigation shell and hash routing.
import { state, h, api, attempt, field, form, toast } from '/ui.js';
import { dashboard, pipeline, leads } from '/views-main.js';
import { tasks, invoices, settings } from '/views-more.js';

const ROUTES = [
  ['dashboard', 'Dashboard', dashboard], ['pipeline', 'Pipeline', pipeline], ['leads', 'Leads', leads],
  ['tasks', 'Follow-ups', tasks], ['invoices', 'Invoices', invoices], ['settings', 'Settings', settings]
];
const app = document.getElementById('app');

function authScreen(mode = 'signup') {
  const signup = mode === 'signup';
  app.replaceChildren(h('div', { class: 'auth' },
    h('section', { class: 'pitch' },
      h('div', { class: 'brand' }, 'RevPilot'),
      h('h1', {}, 'Know where your next dollar is coming from.'),
      h('p', {}, 'One place for leads, deals and invoices, with a daily list of the actions most likely to bring in money.'),
      h('ul', {},
        h('li', {}, 'Capture leads from your website and reply the same day'),
        h('li', {}, 'Track every deal and forecast the month'),
        h('li', {}, 'Invoice won work and chase what is overdue'))),
    h('section', { class: 'panel' },
      h('h1', {}, signup ? 'Create your workspace' : 'Log in'),
      h('p', { class: 'muted' }, signup ? 'Free for up to 50 contacts. No card needed.' : 'Welcome back.'),
      form({ class: 'stack' }, async values => {
        const ok = await attempt(() => api('POST', signup ? '/api/signup' : '/api/login', values));
        if (ok) boot();
      },
        signup && field('Business name', 'org_name', { required: true, maxlength: 120, autocomplete: 'organization' }),
        signup && field('Your name', 'name', { required: true, maxlength: 120, autocomplete: 'name' }),
        field('Email', 'email', { type: 'email', required: true, autocomplete: 'email' }),
        field(signup ? 'Password (8 characters or more)' : 'Password', 'password',
          { type: 'password', required: true, minlength: signup ? 8 : 1, autocomplete: signup ? 'new-password' : 'current-password' }),
        h('button', { type: 'submit', class: 'primary' }, signup ? 'Create workspace' : 'Log in')),
      h('p', { style: 'margin-top:16px' }, signup ? 'Already have an account? ' : 'New here? ',
        h('button', { class: 'link', onclick: () => authScreen(signup ? 'login' : 'signup') }, signup ? 'Log in' : 'Create a workspace')))));
}

async function render() {
  const name = location.hash.replace(/^#\//, '') || 'dashboard';
  const route = ROUTES.find(r => r[0] === name) || ROUTES[0];
  const main = h('main', { class: 'main' }, h('p', { class: 'muted' }, 'Loading...'));
  app.replaceChildren(h('div', { class: 'shell' },
    h('aside', { class: 'side' },
      h('div', { class: 'brand' }, 'Rev', h('span', {}, 'Pilot')),
      h('div', { class: 'org-name' }, state.me.org.name),
      h('nav', { class: 'nav', 'aria-label': 'Main' }, ROUTES.map(([id, label]) =>
        h('a', { href: `#/${id}`, 'aria-current': id === route[0] ? 'page' : null }, label))),
      h('div', { class: 'spacer' }),
      h('button', { class: 'small', onclick: async () => { await attempt(() => api('POST', '/api/logout', {})); state.me = null; authScreen('login'); } }, 'Log out')),
    main));
  document.title = `${route[1]} - RevPilot`;
  try {
    // Views re-render themselves in place after a change, without rebuilding the shell.
    const rerender = () => route[2](main, rerender).catch(err => toast(err.message, true));
    await route[2](main, rerender);
  } catch (err) {
    main.replaceChildren(h('p', { class: 'error' }, err.message), h('button', { onclick: render }, 'Try again'));
  }
}

async function boot() {
  try {
    state.me = await api('GET', '/api/me');
  } catch (err) {
    if (err.status !== 401) toast(err.message, true);
    return authScreen(err.status === 401 && localStorage.getItem('rp_seen') ? 'login' : 'signup');
  }
  try { localStorage.setItem('rp_seen', '1'); } catch { /* private mode */ }
  render();
}

window.addEventListener('hashchange', () => state.me && render());
boot();
