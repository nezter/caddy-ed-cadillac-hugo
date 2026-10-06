/*
 * admin-content.js -- one editor for articles, specials and testimonials.
 *
 * The three pages load the same file; which content type this is comes from
 * window.CONTENT_ADMIN_DATA.type, and the FIELD LIST comes from the API's own
 * definition (utils/content-types.js) inside the GET reply. Nothing about a
 * type is hardcoded here twice -- a field added to a definition shows up in
 * the editor, the validator and the applier together or not at all.
 *
 * WHAT SAVING MEANS (same for all three): the row queues; "npm run
 * <type>:apply" writes site files; the next deploy publishes. The page says
 * that on every save, using the apply command the server reported.
 */
(function () {
  'use strict';

  var data = window.CONTENT_ADMIN_DATA && typeof window.CONTENT_ADMIN_DATA === 'object' ? window.CONTENT_ADMIN_DATA : {};
  var TYPE = data.type || '';
  // Literal endpoints, spelled out: ci/verify-endpoints.js proves a function
  // is wired by scanning reachable bundles for its name, and the articles/
  // specials/testimonials endpoints are otherwise only referenced as name
  // fragments. The three literals live here, in the entry file the gate can
  // see, and TYPE selects among them.
  var ENDPOINTS = {
    articles: '/.netlify/functions/articles-admin',
    specials: '/.netlify/functions/specials-admin',
    testimonials: '/.netlify/functions/testimonials-admin'
  };
  var ENDPOINT = ENDPOINTS[TYPE] || ENDPOINTS.articles;

  var root = document.getElementById('content-admin');
  var statusEl = document.getElementById('content-admin-status');
  if (!root || !TYPE) return;

  var built = {};
  (Array.isArray(data.built) ? data.built : []).forEach(function (b) { built[b.slug] = b; });
  var targets = Array.isArray(data.targets) ? data.targets : [];

  var state = {
    queue: {}, built: built, selected: null, isNew: false, slugTouched: false,
    canEdit: true, reason: '',
    spec: null   // fields/slug/label/one/listKey/applyCmd -- from the server
  };

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
  function slugify(title) {
    return String(title).toLowerCase()
      .replace(/['\u2019]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, (state.spec && state.spec.slug && state.spec.slug.max) || 80);
  }
  function fieldsOf(slug) {
    var row = state.queue[slug];
    return row && row.fields ? row.fields : null;
  }
  function effective(slug) {
    var f = fieldsOf(slug) || {};
    var b = built[slug] || {};
    var out = {};
    (state.spec ? state.spec.fields : []).forEach(function (spec) {
      if (f[spec.key] !== undefined) { out[spec.key] = f[spec.key]; return; }
      if (spec.key === 'title' && b.title) { out[spec.key] = b.title; return; }
      if (spec.key === 'date' && b.date) { out[spec.key] = b.date; return; }
      if (spec.key === 'description' && b.description) { out[spec.key] = b.description; return; }
      if (spec.kind === 'bool') { out[spec.key] = spec.key === 'published' ? true : false; return; }
      if (spec.kind === 'tags') { out[spec.key] = []; return; }
      if (spec.kind === 'date') { out[spec.key] = new Date().toISOString().slice(0, 10); return; }
      out[spec.key] = '';
    });
    return out;
  }
  function isPending(slug) {
    var row = state.queue[slug];
    return Boolean(row && row.fields && Object.keys(row.fields).length);
  }

  var el = {};
  function buildShell() {
    var one = state.spec ? state.spec.one : 'item';
    root.innerHTML = [
      '<div class="cadmin-bar">',
      '  <button type="button" class="btn btn-primary" id="cadmin-new">New ' + esc(one) + '</button>',
      '  <label class="cadmin-bar__field"><span>Search</span>',
      '    <input class="input" type="search" id="cadmin-q" placeholder="Title or slug" autocomplete="off"></label>',
      '  <label class="cadmin-bar__field"><span>Show</span>',
      '    <select class="input" id="cadmin-filter">',
      '      <option value="all">Everything</option>',
      '      <option value="queued">Queued, not applied</option>',
      '      <option value="applied">Applied</option>',
      '      <option value="built">On the site</option>',
      '      <option value="drafts">Drafts</option>',
      '    </select></label>',
      '</div>',
      '<p class="cadmin-count" id="cadmin-count" role="status"></p>',
      '<div class="cadmin-layout">',
      '  <div class="cadmin-list" id="cadmin-list" aria-label="Items"></div>',
      '  <aside class="cadmin-editor" id="cadmin-editor" hidden></aside>',
      '</div>'
    ].join('\n');
    el.q = document.getElementById('cadmin-q');
    el.filter = document.getElementById('cadmin-filter');
    el.count = document.getElementById('cadmin-count');
    el.list = document.getElementById('cadmin-list');
    el.editor = document.getElementById('cadmin-editor');
    document.getElementById('cadmin-new').addEventListener('click', startNew);
    el.q.addEventListener('input', renderList);
    el.filter.addEventListener('change', renderList);
    el.list.addEventListener('click', onListClick);
    el.editor.addEventListener('click', onEditorClick);
    el.editor.addEventListener('input', onEditorInput);
  }

  function allSlugs() {
    var seen = {};
    var out = [];
    Object.keys(state.queue).forEach(function (s) { if (!seen[s]) { seen[s] = 1; out.push(s); } });
    Object.keys(built).forEach(function (s) { if (!seen[s]) { seen[s] = 1; out.push(s); } });
    return out;
  }

  function matches(slug) {
    var q = (el.q && el.q.value || '').trim().toLowerCase();
    var eff = effective(slug);
    var row = state.queue[slug];
    if (q) {
      var hay = (String(eff.title || '') + ' ' + slug).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    var mode = el.filter ? el.filter.value : 'all';
    if (mode === 'queued') return Boolean(row && row.status === 'pending');
    if (mode === 'applied') return Boolean(row && row.status === 'applied');
    if (mode === 'built') return Boolean(built[slug]);
    if (mode === 'drafts') return eff.published === false;
    return true;
  }

  function rowHtml(slug) {
    var row = state.queue[slug];
    var eff = effective(slug);
    var chips = [];
    if (row && row.status === 'pending') chips.push('<span class="cadmin-chip cadmin-chip--pending">Queued — apply pending</span>');
    if (row && row.status === 'applied') chips.push('<span class="cadmin-chip cadmin-chip--applied">Applied — publishes on deploy</span>');
    if (built[slug]) chips.push('<span class="cadmin-chip cadmin-chip--built">On the site</span>');
    if (eff.published === false) chips.push('<span class="cadmin-chip cadmin-chip--draft">Draft</span>');
    return '<div class="cadmin-row' + (state.selected === slug ? ' is-selected' : '') + '" data-slug="' + esc(slug) + '">' +
      '<button type="button" class="cadmin-row__open" data-open="' + esc(slug) + '">' +
      '  <span class="cadmin-row__title">' + esc(eff.title || slug) + '</span>' +
      '  <span class="cadmin-row__meta">' + esc(slug) + ' · ' + esc(eff.date || '') + '</span>' +
      '  <span class="cadmin-row__chips">' + chips.join('') + '</span>' +
      '</button></div>';
  }

  function renderList() {
    var slugs = allSlugs().filter(matches).sort(function (a, b2) {
      return String(effective(b2).date || '').localeCompare(String(effective(a).date || ''));
    });
    var scrollTop = el.list.scrollTop;
    el.list.innerHTML = slugs.length
      ? slugs.map(rowHtml).join('')
      : '<p class="cadmin-empty">Nothing here yet. "' + esc(state.spec ? state.spec.one : 'new') + '" starts one, or an agent can POST to the API.</p>';
    el.list.scrollTop = scrollTop;
    var queued = Object.keys(state.queue).filter(function (s) { return state.queue[s].status === 'pending'; }).length;
    el.count.textContent = slugs.length + ' shown · ' + Object.keys(built).length + ' on the site · ' + queued + ' queued';
  }

  function onListClick(event) {
    var open = event.target.closest('[data-open]');
    if (open) select(open.getAttribute('data-open'));
  }

  function select(slug) {
    state.selected = slug;
    state.isNew = false;
    state.slugTouched = true;
    renderList();
    renderEditor();
  }
  function startNew() {
    state.selected = null;
    state.isNew = true;
    state.slugTouched = false;
    renderList();
    renderEditor();
  }

  function inputRow(spec, value) {
    var id = 'cadmin-f-' + spec.key;
    var attr = 'data-field="' + esc(spec.key) + '" id="' + id + '"';
    var label = '<label class="form-group__label" for="' + id + '">' + esc(spec.label) + '</label>';
    var control;
    if (spec.kind === 'textarea') {
      control = '<textarea class="input" rows="' + (spec.main ? 16 : 5) + '" ' + attr + '>' + esc(value) + '</textarea>';
    } else if (spec.kind === 'bool') {
      control = '<input type="checkbox" ' + attr + (value ? ' checked' : '') + '>';
    } else if (spec.kind === 'tags') {
      control = '<input class="input" type="text" ' + attr + ' value="' + esc((value || []).join(', ')) + '">';
    } else {
      control = '<input class="input" type="text" ' + attr + ' value="' + esc(value) + '">';
    }
    return '<div class="form-group settings-field">' + label + control +
      (spec.hint ? '<p class="settings-note">' + esc(spec.hint) + '</p>' : '') + '</div>';
  }

  function renderEditor() {
    if (state.selected === null && !state.isNew) { el.editor.hidden = true; return; }
    var slug = state.selected || '';
    var eff = state.isNew && !slug ? null : effective(slug);
    if (!eff) {
      eff = {};
      state.spec.fields.forEach(function (s2) {
        eff[s2.key] = s2.kind === 'bool' ? (s2.key === 'published') : (s2.kind === 'tags' ? [] : (s2.kind === 'date' ? new Date().toISOString().slice(0, 10) : ''));
      });
    }
    el.editor.hidden = false;

    var html = [
      '<div class="cadmin-editor__head"><h2>' + esc(eff.title || ('New ' + state.spec.one)) + '</h2>',
      built[slug] ? '<p class="cadmin-editor__links"><a href="' + esc(built[slug].url) + '" target="_blank" rel="noopener">View the page ↗</a></p>' : '',
      '</div>',
      '<form id="cadmin-form">'
    ];
    html.push('<div class="form-group settings-field"><label class="form-group__label" for="cadmin-f-slug">Slug (URL: /' + esc(state.spec.section || TYPE) + '/<slug>/)</label>' +
      '<input class="input" type="text" data-field="slug" id="cadmin-f-slug" value="' + esc(slug) + '">' +
      '<p class="settings-note">Lower-case letters, digits and single hyphens. Auto-derived from the title until you edit it.</p></div>');
    state.spec.fields.forEach(function (s2) { html.push(inputRow(s2, eff[s2.key])); });
    html.push('<div class="settings-actions">');
    html.push('<button type="submit" class="btn btn-primary" id="cadmin-save"' + (state.canEdit ? '' : ' disabled') + '>Save to queue</button>');
    html.push('<button type="button" class="btn btn-secondary" id="cadmin-discard">Discard changes</button>');
    html.push('<button type="button" class="btn btn-secondary" id="cadmin-clear"' + (state.queue[slug] && state.canEdit ? '' : ' disabled') + '>Remove from queue</button>');
    html.push('</div></form>');

    if (targets.length) {
      html.push('<div class="cadmin-links">');
      html.push('<h3>Insert an internal link</h3>');
      html.push('<p class="settings-note">Link back into the site — inventory, financing, contact. Search, then insert at the cursor.</p>');
      html.push('<input class="input" type="search" id="cadmin-link-q" placeholder="Search pages, articles, vehicles">');
      html.push('<div class="cadmin-links__list" id="cadmin-link-list"></div>');
      html.push('</div>');
    }
    el.editor.innerHTML = html.join('\n');

    var form = document.getElementById('cadmin-form');
    form.addEventListener('submit', function (e) { e.preventDefault(); save(); });
    if (targets.length) {
      var lq = document.getElementById('cadmin-link-q');
      lq.addEventListener('input', renderLinkTargets);
      document.getElementById('cadmin-link-list').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-insert]');
        if (btn) insertLink(btn.getAttribute('data-insert-title'), btn.getAttribute('data-insert'));
      });
      renderLinkTargets();
    }
  }

  function renderLinkTargets() {
    var host = document.getElementById('cadmin-link-list');
    if (!host) return;
    var q = (document.getElementById('cadmin-link-q').value || '').trim().toLowerCase();
    var list = targets.filter(function (t) {
      return !q || String(t.title).toLowerCase().indexOf(q) !== -1 || String(t.url).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 12);
    host.innerHTML = list.length
      ? list.map(function (t) {
          return '<button type="button" class="cadmin-link-target" data-insert="' + esc(t.url) + '" data-insert-title="' + esc(t.title) + '">' +
            '<span>' + esc(t.title) + '</span><code>' + esc(t.url) + '</code></button>';
        }).join('')
      : '<p class="settings-note">No match.</p>';
  }

  function insertLink(title, url) {
    var mainField = null;
    var mainSpec = null;
    state.spec.fields.forEach(function (s2) { if (s2.main) { mainSpec = s2; } });
    if (mainSpec) mainField = document.querySelector('[data-field="' + mainSpec.key + '"]');
    if (!mainField) return;
    var markdown = '[' + String(title).replace(/[\[\]]/g, '') + '](' + url + ')';
    var start = mainField.selectionStart || 0;
    var end = mainField.selectionEnd || 0;
    mainField.value = mainField.value.slice(0, start) + markdown + mainField.value.slice(end);
    mainField.selectionStart = mainField.selectionEnd = start + markdown.length;
    mainField.focus();
  }

  function onEditorClick(event) {
    if (event.target.id === 'cadmin-discard') { renderEditor(); say('Changes discarded.', 'info'); return; }
    if (event.target.id === 'cadmin-clear') { clearRow(); }
  }

  function onEditorInput(event) {
    var field = event.target && event.target.getAttribute('data-field');
    if (field === 'title' && !state.slugTouched) {
      var slugInput = document.querySelector('[data-field="slug"]');
      if (slugInput) slugInput.value = slugify(event.target.value);
    }
    if (field === 'slug') state.slugTouched = true;
  }

  function collect() {
    var form = document.getElementById('cadmin-form');
    var fields = {};
    state.spec.fields.forEach(function (s2) {
      var el2 = form.querySelector('[data-field="' + s2.key + '"]');
      if (!el2) return;
      if (s2.kind === 'bool') fields[s2.key] = el2.checked;
      else if (s2.kind === 'tags') fields[s2.key] = el2.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean);
      else fields[s2.key] = el2.value;
    });
    return { slug: String((form.querySelector('[data-field="slug"]') || {}).value || '').trim().toLowerCase(), fields: fields };
  }

  function save() {
    if (!state.canEdit) { say(state.reason, 'error'); return; }
    var record = collect();
    var slugPattern = new RegExp('^[a-z0-9][a-z0-9-]{0,' + ((state.spec.slug && state.spec.slug.max) || 80) + '}$');
    if (!slugPattern.test(record.slug)) { say('The slug must be lower-case letters, digits and single hyphens.', 'error'); return; }
    var titleSpec = state.spec.fields.filter(function (s2) { return s2.required; })[0];
    if (titleSpec && !String(record.fields[titleSpec.key] || '').trim()) { say(titleSpec.label + ' is required.', 'error'); return; }

    var btn = document.getElementById('cadmin-save');
    if (btn) btn.disabled = true;
    say('Saving…', 'info');
    fetch(ENDPOINT, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'save', slug: record.slug, fields: record.fields }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); })
      .then(function (res) {
        if (btn) btn.disabled = false;
        if (res.status === 200 && res.body.row) {
          state.queue[record.slug] = res.body.row;
          state.selected = record.slug;
          state.isNew = false;
          state.slugTouched = true;
          renderList();
          renderEditor();
          say('Saved to the queue. Run "npm run ' + state.spec.applyCmd + '", then deploy — that is what publishes it.', 'ok');
        } else if (res.status === 422) {
          var why = (res.body.fieldErrors || []).concat(res.body.unknownFields || []).join('; ') || res.body.error;
          say('Not saved — ' + why, 'error');
        } else if (res.status === 401) {
          say('Sign in at /admin/sign-in to write ' + state.spec.label + '.', 'error');
        } else if (res.status === 503) {
          state.canEdit = false;
          state.reason = 'The queue is not configured on this deployment (no database).';
          say(state.reason, 'error');
          renderEditor();
        } else {
          say('Not saved — the queue answered ' + res.status + '.', 'error');
        }
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        say('Not saved — the queue could not be reached.', 'error');
      });
  }

  function clearRow() {
    if (!state.selected || !state.canEdit) return;
    if (!window.confirm('Remove "' + state.selected + '" from the queue? An already-applied file stays on disk; delete it in the repository if that is the intent.')) return;
    fetch(ENDPOINT, { method: 'POST', headers: headers(), body: JSON.stringify({ action: 'clear', slug: state.selected }) })
      .then(function (r) { return r.status; })
      .then(function (status) {
        if (status === 200) {
          delete state.queue[state.selected];
          renderList();
          renderEditor();
          say('Queue row removed.', 'ok');
        } else {
          say('Not removed — the queue answered ' + status + '.', 'error');
        }
      })
      .catch(function () { say('Not removed — the queue could not be reached.', 'error'); });
  }

  window.CONTENT_ADMIN = { state: state, select: select, collect: collect, insertLink: insertLink };

  fetch(ENDPOINT, { headers: headers() })
    .then(function (r) { return r.json().catch(function () { return {}; }).then(function (b) { return { status: r.status, body: b }; }); })
    .then(function (res) {
      if (res.status === 200) {
        state.spec = {
          fields: res.body.fields || [],
          slug: res.body.slug || { max: 80 },
          label: res.body.label || TYPE,
          one: res.body.one || 'item',
          section: TYPE,
          applyCmd: res.body.applyCmd || (TYPE + ':apply'),
          listKey: res.body.listKey || res.body.fields
        };
        state.spec.listKey = state.spec.listKey || 'items';
        (res.body[state.spec.listKey] || res.body.articles || res.body.specials || res.body.testimonials || []).forEach(function (row) {
          state.queue[row.slug] = row;
        });
        buildShell();
        renderList();
        if (!allSlugs().length) startNew();
      } else {
        if (res.status === 401) { state.canEdit = false; state.reason = 'Sign in at /admin/sign-in. The list stays readable once you do.'; }
        else if (res.status === 503) { state.canEdit = false; state.reason = 'The queue is not configured on this deployment (no database).'; }
        else { state.canEdit = false; state.reason = 'The queue answered ' + res.status + '.'; }
        // minimal shell so the failure is visible, not a blank panel
        state.spec = { fields: [], slug: { max: 80 }, label: TYPE, one: 'item', section: TYPE, applyCmd: TYPE + ':apply', listKey: 'items' };
        buildShell();
        renderList();
        say(state.reason, 'warn');
      }
    })
    .catch(function () {
      state.canEdit = false;
      state.spec = { fields: [], slug: { max: 80 }, label: TYPE, one: 'item', section: TYPE, applyCmd: TYPE + ':apply', listKey: 'items' };
      buildShell();
      say('The queue could not be reached.', 'error');
    });
})();
