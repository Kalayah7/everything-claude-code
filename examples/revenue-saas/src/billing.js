'use strict';
/**
 * Plans, limits and the Stripe webhook that upgrades a workspace after checkout.
 *
 * Setup (see README): create one Stripe Payment Link per paid plan, put metadata `plan=growth` (or `scale`)
 * on the link, and set STRIPE_LINK_GROWTH / STRIPE_LINK_SCALE / STRIPE_WEBHOOK_SECRET. The app appends
 * `client_reference_id=<workspace id>` to the link so the webhook knows which workspace paid.
 */

const crypto = require('node:crypto');
const { HttpError } = require('./http');

const PLANS = {
  free: { id: 'free', name: 'Free', price_cents: 0, contacts: 50, invoices_per_month: 5 },
  growth: { id: 'growth', name: 'Growth', price_cents: 4900, contacts: 2500, invoices_per_month: 200 },
  scale: { id: 'scale', name: 'Scale', price_cents: 14900, contacts: 1000000, invoices_per_month: 1000000 }
};
const SIGNATURE_TOLERANCE_SECONDS = 300;

const planFor = org => PLANS[org.plan] || PLANS.free;

/** Verifies a `Stripe-Signature` header (t=timestamp,v1=hex HMAC-SHA256 of "t.payload"). */
function verifyStripeSignature(payload, header, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!secret || !header) return false;
  const parts = String(header).split(',').map(part => part.split('='));
  const timestamp = (parts.find(([k]) => k === 't') || [])[1];
  const signatures = parts.filter(([k]) => k === 'v1').map(([, value]) => value);
  if (!timestamp || !signatures.length) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(payload).digest();
  return signatures.some(sig => {
    const given = Buffer.from(sig, 'hex');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}

function createBilling(db, config) {
  function summary(org, usage) {
    const links = { growth: config.stripeLinkGrowth, scale: config.stripeLinkScale };
    return {
      current: planFor(org).id,
      usage,
      plans: Object.values(PLANS).map(plan => {
        let upgradeUrl = null;
        if (links[plan.id]) {
          const url = new URL(links[plan.id]);
          url.searchParams.set('client_reference_id', org.id);
          upgradeUrl = url.toString();
        }
        return { ...plan, upgrade_url: upgradeUrl };
      })
    };
  }

  function handleWebhook(rawBody, signatureHeader) {
    if (!config.stripeWebhookSecret) throw new HttpError(503, 'Billing is not configured.');
    if (!verifyStripeSignature(rawBody, signatureHeader, config.stripeWebhookSecret)) {
      throw new HttpError(400, 'Invalid signature.');
    }
    let event;
    try { event = JSON.parse(rawBody.toString('utf8')); } catch { throw new HttpError(400, 'Invalid payload.'); }
    const object = (event.data && event.data.object) || {};

    if (event.type === 'checkout.session.completed') {
      const plan = object.metadata && object.metadata.plan;
      if (PLANS[plan] && plan !== 'free' && object.client_reference_id && object.payment_status !== 'unpaid') {
        db.prepare('UPDATE orgs SET plan = ?, stripe_customer = ? WHERE id = ?')
          .run(plan, object.customer || null, object.client_reference_id);
      }
    } else if (event.type === 'customer.subscription.deleted' && object.customer) {
      db.prepare("UPDATE orgs SET plan = 'free' WHERE stripe_customer = ?").run(object.customer);
    }
    return { received: true };
  }

  return { summary, handleWebhook };
}

module.exports = { PLANS, planFor, verifyStripeSignature, createBilling };
