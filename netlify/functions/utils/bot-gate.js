/**
 * bot-gate.js -- one spam gate for every public form endpoint.
 *
 * WHAT IT ENFORCES
 * ----------------
 *   1. Honeypot. Every public form carries a "website" field that is hidden
 *      from people (off-screen, aria-hidden, tabindex=-1) and left blank. A
 *      filled one is a bot. The field name and the refusal are the same on
 *      every form on purpose: a bot learns nothing from which form said no.
 *   2. Minimum fill time. Forms stamp a hidden `_t` with the moment they were
 *      served (leadCapture also sends startedAt). A submission that arrives in
 *      under MIN_FILL_MS did not come from a person reading the form. A
 *      MISSING stamp is not refused -- the no-JS fallback posts cannot stamp,
 *      and refusing them would trade real enquiries for a weaker gate.
 *   3. reCAPTCHA, when configured. Set RECAPTCHA_SECRET_KEY to switch it on;
 *      callers send the token as `g-recaptcha-response` (the stock-alerts form
 *      does this through Netlify's own data-netlify-recaptcha handling, which
 *      does not need this file at all). With no secret set the step is
 *      skipped and logged as unconfigured -- the option is wired, it just
 *      needs the keys.
 *
 * WHAT IT IS NOT
 * --------------
 * Not a guarantee, and it does not pretend to be. It is the layered gate this
 * site can run with the information it actually has, and every rejection logs
 * which layer fired so a real complaint can be told apart from spam.
 */

'use strict';

const MIN_FILL_MS = 2000;

async function verifyRecaptcha(token) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return { state: 'unconfigured' };
  if (!token) return { state: 'missing' };
  try {
    const res = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'secret=' + encodeURIComponent(secret) + '&response=' + encodeURIComponent(token),
    });
    const data = await res.json().catch(() => ({}));
    return data && data.success
      ? { state: 'passed' }
      : { state: 'failed', errors: (data && data['error-codes']) || [] };
  } catch (err) {
    // Fail OPEN on transport failure -- Google being unreachable must not eat
    // real enquiries -- but say so, so nobody mistakes it for a pass.
    console.warn('[bot-gate] recaptcha verify could not reach Google:', err.message);
    return { state: 'unreachable' };
  }
}

async function check(data) {
  if (!data || typeof data !== 'object') return { pass: true, layer: 'no-data' };

  const trap = data.website;
  if (trap && String(trap).trim() !== '') {
    console.log('[bot-gate] rejected: honeypot');
    return { pass: false, reason: 'honeypot' };
  }

  let servedAt = Number(data._t);
  if (!Number.isFinite(servedAt) && data.startedAt) servedAt = Date.parse(data.startedAt);
  if (Number.isFinite(servedAt) && servedAt > 0) {
    const elapsed = Date.now() - servedAt;
    if (elapsed < MIN_FILL_MS) {
      console.log('[bot-gate] rejected: submitted in ' + elapsed + 'ms');
      return { pass: false, reason: 'too-fast' };
    }
  }

  const token = data['g-recaptcha-response'] || data.recaptchaToken || '';
  const captcha = await verifyRecaptcha(token);
  if (captcha.state === 'missing' || captcha.state === 'failed') {
    console.log('[bot-gate] rejected: recaptcha ' + captcha.state, captcha.errors || '');
    return { pass: false, reason: 'captcha-' + captcha.state };
  }
  if (captcha.state === 'unconfigured') {
    console.log('[bot-gate] recaptcha not configured; honeypot + timing only');
  }

  return { pass: true, captcha: captcha.state };
}

module.exports = { check, MIN_FILL_MS };
