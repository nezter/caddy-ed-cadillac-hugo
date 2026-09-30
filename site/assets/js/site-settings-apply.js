/**
 * site-settings-apply.js -- put database-backed copy on a page that was built
 * with the old copy in it.
 *
 * WHY CLIENT-SIDE
 * ---------------
 * These values are chrome: headings, intro copy, the stock-alert pitch, a
 * banner. A crawler is not looking for them, so fetching and swapping them is
 * cheap and needs no build.
 *
 * This is NOT how page content works here, and must not be copied there.
 * Inventory and specials are the pages search traffic lands on; a value injected
 * by JavaScript is invisible to a crawler, so those stay in the served HTML and
 * need a build. See docs/ADMIN.md.
 *
 * NEVER BREAKS THE PAGE
 * ---------------------
 * Every failure path here is a silent no-op that leaves the built copy in place:
 * no function, no database, a network error, a setting with no matching element.
 * The alternative -- showing an error to a customer browsing cars -- is worse
 * than a day-old heading.
 *
 * THAT TRADE IS WHY THE CMS BANNER MATTERS
 * ----------------------------------------
 * This file is the one place where "the database said no" becomes "the page
 * looks slightly stale" rather than "the page is broken". It is deliberate, and
 * it is also why the settings admin page reports failures loudly while this one
 * does not: the person editing needs to know, the visitor does not.
 *
 * MARKUP CONTRACT
 * ---------------
 *   <h2 data-setting="signage.heading">Stay connected</h2>
 *
 * The built text is the fallback. The attribute names the setting. That is the
 * whole contract, and a template that forgets the attribute simply keeps its
 * built copy rather than losing the ability to be changed.
 */

'use strict';

(function () {
  var ENDPOINT = '/.netlify/functions/site-settings';

  function apply(settings) {
    if (!Array.isArray(settings)) return;
    settings.forEach(function (setting) {
      if (!setting || !setting.key) return;
      // A blank value means "fall back to the built copy", which is what
      // leaving the element alone already does.
      if (setting.isBlank || !String(setting.value || '').trim()) return;

      var nodes = document.querySelectorAll('[data-setting="' + setting.key + '"]');
      Array.prototype.forEach.call(nodes, function (node) {
        // textContent, not innerHTML: a setting is a heading, and innerHTML
        // would make the database a script injection point into every page.
        node.textContent = setting.value;
      });
    });
  }

  function applyBanner(settings) {
    var text = settings.find(function (s) { return s.key === 'banner.text'; });
    var tone = settings.find(function (s) { return s.key === 'banner.tone'; });
    var host = document.getElementById('site-banner');
    if (!host) return;
    if (!text || !String(text.value || '').trim()) {
      host.hidden = true;
      return;
    }
    host.textContent = text.value;
    host.className = 'site-banner site-banner--' + (tone ? tone.value : 'info');
    host.hidden = false;
  }

  function run() {
    fetch(ENDPOINT, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (body) {
        if (!body || !Array.isArray(body.settings)) return;
        apply(body.settings);
        applyBanner(body.settings);
      })
      .catch(function () {
        // Silent on purpose. See the note at the top.
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
})();
