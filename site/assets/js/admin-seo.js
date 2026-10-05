/*
 * admin-seo.js -- the SEO audit page.
 *
 * The page list comes from /sitemap.xml (fetched, parsed, admin/404/offline
 * and pagination filtered out). Scoring calls /.netlify/functions/seo-score
 * one page at a time with a small delay -- there is no reason to hammer the
 * same origin with 60 parallel fetches to score sixty pages, and the delay
 * keeps the audit safe to run mid-day.
 *
 * The scorer is deterministic and lives in ONE place
 * (netlify/functions/utils/seo-score.js), so the number here and the number
 * an agent gets from the API are the same number.
 */
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/seo-score';
  var MAX_BATCH = 60;
  var DELAY_MS = 150;

  var root = document.getElementById('seo-admin');
  var statusEl = document.getElementById('seo-admin-status');
  if (!root) return;

  var state = { paths: [], results: {}, selected: null, running: false };
  var el = {};

  function token() {
    try { return window.localStorage.getItem('caddyed_admin_token') || ''; } catch (e) { return ''; }
  }
  function headers() {
    var h = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function say(m, kind) {
    if (!statusEl) return;
    statusEl.textContent = m;
    statusEl.className = 'settings-status' + (kind ? ' settings-status--' + kind : '');
    statusEl.hidden = !m;
  }
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function buildShell() {
    root.innerHTML = [
      '<div class="seo-bar">',
      '  <label class="seo-bar__field"><span>Score one page</span>',
      '    <input class="input" type="search" id="seo-path" placeholder="/articles/... or /inventory/..." autocomplete="off"></label>',
      '  <button type="button" class="btn btn-primary" id="seo-one">Score it</button>',
      '  <button type="button" class="btn btn-secondary" id="seo-all" disabled>Score all pages</button>',
      '</div>',
      '<p class="seo-summary" id="seo-summary" role="status">Loading the page list from the sitemap...</p>',
      '<div class="seo-layout">',
      '  <div class="seo-list" id="seo-list" aria-label="Pages"></div>',
      '  <aside class="seo-detail" id="seo-detail" hidden></aside>',
      '</div>'
    ].join('\n');
    el.path = document.getElementById('seo-path');
    el.one = document.getElementById('seo-one');
    el.all = document.getElementById('seo-all');
    el.summary = document.getElementById('seo-summary');
    el.list = document.getElementById('seo-list');
    el.detail = document.getElementById('seo-detail');

    el.one.addEventListener('click', function () {
      var p = (el.path.value || '').trim();
      if (!p) { say('Give a path like / or /inventory/.', 'warn'); return; }
      if (p.indexOf('http') === 0) { try { p = new URL(p).pathname; } catch (e) { /* keep as typed */ } }
      scorePath(p, true);
    });
    el.all.addEventListener('click', scoreAll);
    el.list.addEventListener('click', function (e) {
      var row = e.target.closest('[data-path]');
      if (row) select(row.getAttribute('data-path'));
    });
  }

  function loadSitemap() {
    return fetch('/sitemap.xml', { headers: { Accept: 'application/xml' } })
      .then(function (r) { return r.ok ? r.text() : ''; })
      .then(function (xml) {
        var paths = [];
        var re = /<loc>([^<]+)<\/loc>/g;
        var m;
        while ((m = re.exec(xml))) {
          var p;
          try { p = new URL(m[1]).pathname; } catch (e) { continue; }
          if (p.indexOf('/admin') === 0 || p === '/cms.html' || p === '/404.html' || p === '/offline/') continue;
          if (/\/page\/\d+\//.test(p)) continue;
          if (paths.indexOf(p) === -1) paths.push(p);
        }
        paths.sort(function (a, b) {
          if (a === '/') return -1;
          if (b === '/') return 1;
          return a.localeCompare(b);
        });
        state.paths = paths;
      });
  }

  function chipClass(score) {
    if (score === null || score === undefined) return 'seo-chip--na';
    if (score >= 85) return 'seo-chip--good';
    if (score >= 70) return 'seo-chip--mid';
    return 'seo-chip--bad';
  }

  function renderList() {
    el.list.innerHTML = state.paths.map(function (p) {
      var r = state.results[p];
      var score = r && r.ok ? r.score : null;
      var label = r && r.ok ? String(score) : (r && r.error ? 'n/a' : '--');
      var section = r && r.section ? r.section : '';
      return '<div class="seo-row' + (state.selected === p ? ' is-selected' : '') + '" data-path="' + esc(p) + '">' +
        '<span class="seo-row__path">' + esc(p) + '<br><span class="seo-row__section">' + esc(section) + '</span></span>' +
        '<span class="seo-chip ' + chipClass(score) + '">' + esc(label) + '</span>' +
        '<span class="seo-row__section">' + (r && r.ok ? r.stats.internalLinks + ' links' : '') + '</span>' +
        '</div>';
    }).join('');
    var scored = Object.keys(state.results).filter(function (k) { return state.results[k] && state.results[k].ok; });
    if (scored.length) {
      var sum = scored.reduce(function (n, k) { return n + state.results[k].score; }, 0);
      el.summary.textContent = state.paths.length + ' pages in the sitemap · ' + scored.length +
        ' scored · average ' + Math.round(sum / scored.length) + ' · scoring runs live against each page';
    } else {
      el.summary.textContent = state.paths.length + ' pages in the sitemap · nothing scored yet';
    }
  }

  function renderDetail() {
    var p = state.selected;
    var r = p ? state.results[p] : null;
    if (!p || !r) { el.detail.hidden = true; return; }
    el.detail.hidden = false;
    if (!r.ok) {
      el.detail.innerHTML = '<h2>' + esc(p) + '</h2><p>' + esc(r.error || 'Could not score this page.') + '</p>';
      return;
    }
    var stats = [
      ['Title', r.stats.titleLength + ' chars'],
      ['Description', r.stats.descriptionLength + ' chars'],
      ['H1 / H2', r.stats.h1Count + ' / ' + r.stats.h2Count],
      ['Words (main)', String(r.stats.words)],
      ['Internal links', String(r.stats.internalLinks)],
      ['Images with alt', r.stats.imagesWithAlt + ' of ' + r.stats.images],
      ['Schema', (r.stats.schemaTypes || []).join(', ') || 'none'],
      ['Area mentions', String(r.stats.cityMentions)]
    ].map(function (kv) { return '<div><span>' + esc(kv[0]) + '</span> ' + esc(kv[1]) + '</div>'; }).join('');

    var checks = r.checks.map(function (c) {
      return '<div class="seo-check' + (c.pass ? '' : ' seo-check--fail') + '">' +
        '<span>' + (c.pass ? '&#10003;' : '&#10007;') + ' ' + esc(c.label) + '</span>' +
        (!c.pass && c.advice ? '<span class="seo-check__advice">' + esc(c.advice) + '</span>' : '') +
        '</div>';
    }).join('');

    el.detail.innerHTML = '<h2>' + esc(p) + '</h2>' +
      '<p><span class="seo-chip ' + chipClass(r.score) + '">' + r.score + '</span></p>' +
      '<div class="seo-stats">' + stats + '</div>' +
      '<div class="seo-checks">' + checks + '</div>' +
      '<p class="settings-note"><a href="' + esc(p) + '" target="_blank" rel="noopener">Open the page ↗</a></p>';
  }

  function select(p) { state.selected = p; renderList(); renderDetail(); }

  function scorePath(p, single) {
    say('Scoring ' + p + '...', 'info');
    return fetch(ENDPOINT, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ path: p })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, body: body }; });
    }).then(function (res) {
      if (res.status === 200 && res.body.ok) {
        state.results[p] = res.body;
        renderList();
        if (state.selected === p || single) { state.selected = p; renderDetail(); }
        say('Scored ' + p + ': ' + res.body.score + '.', 'ok');
      } else if (res.status === 200 && res.body && !res.body.ok) {
        state.results[p] = { ok: false, error: res.body.error, section: '', path: p };
        renderList();
        if (single) { state.selected = p; renderDetail(); }
        say(res.body.error || 'Nothing to score.', 'warn');
      } else if (res.status === 401) {
        say('Sign in at /admin/sign-in to score pages.', 'error');
        state.running = false;
      } else {
        state.results[p] = { ok: false, error: 'Endpoint answered ' + res.status, section: '', path: p };
        renderList();
        say('Scoring failed (' + res.status + ').', 'error');
      }
    }).catch(function () {
      say('Could not reach the scorer.', 'error');
    });
  }

  function scoreAll() {
    if (state.running) return;
    state.running = true;
    el.all.disabled = true;
    var list = state.paths.slice(0, MAX_BATCH);
    var i = 0;
    (function step() {
      if (i >= list.length) {
        el.all.disabled = false;
        state.running = false;
        say('Scored ' + list.length + ' pages.', 'ok');
        return;
      }
      var p = list[i];
      i += 1;
      el.all.textContent = 'Scoring ' + i + ' / ' + list.length + '...';
      scorePath(p, false).then(function () {
        if (state.running) setTimeout(step, DELAY_MS);
      });
    })();
  }

  window.SEO_ADMIN = { state: state, scorePath: scorePath, select: select };

  buildShell();
  loadSitemap().then(function () {
    renderList();
    if (!state.paths.length) say('The sitemap came back empty — build and deploy first.', 'warn');
  }).catch(function () {
    el.list.innerHTML = '<p class="art-empty">Could not load /sitemap.xml.</p>';
  });
})();
