/*
 * admin-inventory.js -- the vehicle record editor.
 *
 * THE LIST IS BUILD-TIME DATA. The inventory is compiled into the page by
 * partials/inventory-admin-data.html (window.INVENTORY_VEHICLES) and is not
 * fetched, for the same reason the favourites control does not fetch it:
 * there is deliberately no endpoint that returns "every vehicle", because the
 * detail pages render from front matter and a runtime list would be a second
 * source of truth that could drift from the pages it links to. The only
 * network traffic this file makes is the edit queue itself and the favourite
 * toggles.
 *
 * WHAT SAVING MEANS. An edit cannot touch the site directly: this site
 * deploys prebuilt, and a Function cannot edit the repository. Save writes to
 * the vehicle_edits queue; the inventory sync applies pending rows to the
 * content files; the next deploy publishes them. The page says exactly that
 * on every save -- a control that lies about when it takes effect is worse
 * than no control. The ONE live control is the Ed's pick star: it writes the
 * same vehicle_favourites table the home page reads, so it shows on the next
 * page load, no deploy.
 *
 * EMPTY MEANS REVERT. Blanking a field sends an empty value, which removes
 * your override and lets the feed's own value show again. The one exception
 * is the description: empty there means "restore the generated description".
 * The form says both.
 */
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/inventory-admin';
  var PICKS = '/.netlify/functions/vehicle-features';

  var root = document.getElementById('inventory-admin');
  var statusEl = document.getElementById('inventory-admin-status');
  if (!root) return;

  var vehicles = Array.isArray(window.INVENTORY_VEHICLES) ? window.INVENTORY_VEHICLES.slice() : [];

  var state = {
    edits: {},        // slug -> { fields, updatedAt, status }
    picks: {},        // slug -> true
    canEdit: true,    // false when the queue is unreachable
    editReason: '',
    reasonCode: '',
    selected: null,
    sort: 'title',
    q: '',
    make: 'all',
    condition: 'all',
    avail: 'all',
    pendingOnly: false
  };

  /* ------------------------------------------------------------- helpers -- */

  function token() {
    try { return window.localStorage.getItem('caddyed_admin_token') || ''; } catch (e) { return ''; }
  }

  function authHeaders() {
    var h = { 'Content-Type': 'application/json' };
    var t = token();
    if (t) h.Authorization = 'Bearer ' + t;
    return h;
  }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function money(n) {
    var v = parseInt(n, 10);
    if (!v || v < 1000) return v ? '$' + v : '—';
    return '$' + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function miles(n) {
    var v = parseInt(n, 10);
    if (!v) return '—';
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' mi';
  }

  function say(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'settings-status' + (kind ? ' settings-status--' + kind : '');
    statusEl.hidden = !message;
  }

  function editRow(v) { return state.edits[v.slug] || null; }

  function hasOverride(v, key) {
    var row = editRow(v);
    return Boolean(row && row.fields && Object.prototype.hasOwnProperty.call(row.fields, key));
  }

  function eff(v, key) {
    if (hasOverride(v, key)) return editRow(v).fields[key];
    // The page body is the vehicle's 'description' in this form's terms; the
    // data partial carries it as `body` because that is what it is.
    var val = key === 'description' ? v.body : v[key];
    return val === undefined || val === null ? '' : val;
  }

  function effAvailable(v) {
    if (hasOverride(v, 'available')) return editRow(v).fields.available !== false;
    return v.available !== false;
  }

  function isPending(v) {
    var row = editRow(v);
    return Boolean(row && row.fields && Object.keys(row.fields).length);
  }

  /* ---------------------------------------------------------- the fields -- */

  var SPECS = [
    { group: 'Pricing', key: 'price', label: 'Price ($)', kind: 'number' },
    { group: 'Pricing', key: 'price_note', label: 'Price note', kind: 'text' },
    { group: 'Specification', key: 'mileage', label: 'Mileage', kind: 'number' },
    { group: 'Specification', key: 'subtitle', label: 'Tagline (subtitle)', kind: 'text' },
    { group: 'Specification', key: 'status', label: 'Condition', kind: 'select',
      options: ['New', 'Certified Pre-Owned', 'Pre-Owned'] },
    { group: 'Specification', key: 'exterior_color', label: 'Exterior colour', kind: 'text' },
    { group: 'Specification', key: 'interior_color', label: 'Interior colour', kind: 'text' },
    { group: 'Specification', key: 'body_style', label: 'Body style', kind: 'text' },
    { group: 'Specification', key: 'drivetrain', label: 'Drivetrain', kind: 'text' },
    { group: 'Specification', key: 'transmission', label: 'Transmission', kind: 'text' },
    { group: 'Specification', key: 'engine', label: 'Engine', kind: 'text' },
    { group: 'Specification', key: 'mpg', label: 'MPG', kind: 'number' },
    { group: 'Description', key: 'description', label: 'Description shown on the vehicle page', kind: 'textarea' }
  ];

  /* ---------------------------------------------------------------- shell -- */

  var el = {};

  function buildShell() {
    var makes = {};
    vehicles.forEach(function (v) { if (v.make) makes[v.make] = true; });
    var makeOpts = Object.keys(makes).sort().map(function (m) {
      return '<option value="' + esc(m) + '">' + esc(m) + '</option>';
    }).join('');

    root.innerHTML = [
      '<div class="inv-bar" role="search">',
      '  <label class="inv-bar__field"><span>Search</span>',
      '    <input class="input" type="search" id="inv-q" placeholder="Model, trim, stock or VIN" autocomplete="off"></label>',
      '  <label class="inv-bar__field"><span>Make</span>',
      '    <select class="input" id="inv-make"><option value="all">All makes</option>' + makeOpts + '</select></label>',
      '  <label class="inv-bar__field"><span>Condition</span>',
      '    <select class="input" id="inv-condition">',
      '      <option value="all">All conditions</option>',
      '      <option value="New">New</option>',
      '      <option value="Certified Pre-Owned">Certified Pre-Owned</option>',
      '      <option value="Pre-Owned">Pre-Owned</option>',
      '    </select></label>',
      '  <label class="inv-bar__field"><span>Availability</span>',
      '    <select class="input" id="inv-avail">',
      '      <option value="all">On and off the site</option>',
      '      <option value="on">On the site</option>',
      '      <option value="off">Held off</option>',
      '    </select></label>',
      '  <label class="inv-bar__field"><span>Sort</span>',
      '    <select class="input" id="inv-sort">',
      '      <option value="title">Title A-Z</option>',
      '      <option value="price-desc">Price, high to low</option>',
      '      <option value="price-asc">Price, low to high</option>',
      '      <option value="mileage-asc">Mileage, low to high</option>',
      '      <option value="synced-desc">Recently synced</option>',
      '    </select></label>',
      '  <label class="inv-bar__check"><input type="checkbox" id="inv-pending"> <span>Pending edits only</span></label>',
      '</div>',
      '<p class="inv-count" id="inv-count" role="status"></p>',
      '<div class="inv-layout">',
      '  <div class="inv-list" id="inv-list" aria-label="Vehicles"></div>',
      '  <aside class="inv-editor" id="inv-editor" hidden></aside>',
      '</div>'
    ].join('\n');

    el.q = document.getElementById('inv-q');
    el.make = document.getElementById('inv-make');
    el.condition = document.getElementById('inv-condition');
    el.avail = document.getElementById('inv-avail');
    el.sort = document.getElementById('inv-sort');
    el.pending = document.getElementById('inv-pending');
    el.count = document.getElementById('inv-count');
    el.list = document.getElementById('inv-list');
    el.editor = document.getElementById('inv-editor');

    el.q.addEventListener('input', function () { state.q = el.q.value.trim().toLowerCase(); renderList(); });
    el.make.addEventListener('change', function () { state.make = el.make.value; renderList(); });
    el.condition.addEventListener('change', function () { state.condition = el.condition.value; renderList(); });
    el.avail.addEventListener('change', function () { state.avail = el.avail.value; renderList(); });
    el.sort.addEventListener('change', function () { state.sort = el.sort.value; renderList(); });
    el.pending.addEventListener('change', function () { state.pendingOnly = el.pending.checked; renderList(); });
    el.list.addEventListener('click', onListClick);
    el.editor.addEventListener('click', onEditorClick);
  }

  /* ----------------------------------------------------------------- list -- */

  function matches(v) {
    if (state.q) {
      var hay = (v.title + ' ' + (v.stock || '') + ' ' + (v.vin || '') + ' ' + (v.trim || '')).toLowerCase();
      if (hay.indexOf(state.q) === -1) return false;
    }
    if (state.make !== 'all' && v.make !== state.make) return false;
    if (state.condition !== 'all' && String(eff(v, 'status')) !== state.condition) return false;
    if (state.avail === 'on' && !effAvailable(v)) return false;
    if (state.avail === 'off' && effAvailable(v)) return false;
    if (state.pendingOnly && !isPending(v)) return false;
    return true;
  }

  function sorted(list) {
    var out = list.slice();
    if (state.sort === 'price-desc') out.sort(function (a, b) { return (Number(eff(b, 'price')) || 0) - (Number(eff(a, 'price')) || 0); });
    else if (state.sort === 'price-asc') out.sort(function (a, b) { return (Number(eff(a, 'price')) || 0) - (Number(eff(b, 'price')) || 0); });
    else if (state.sort === 'mileage-asc') out.sort(function (a, b) { return (Number(eff(a, 'mileage')) || 0) - (Number(eff(b, 'mileage')) || 0); });
    else if (state.sort === 'synced-desc') out.sort(function (a, b) { return String(b.synced).localeCompare(String(a.synced)); });
    else out.sort(function (a, b) { return String(a.title).localeCompare(String(b.title)); });
    return out;
  }

  function rowHtml(v) {
    var chips = [];
    var status = String(eff(v, 'status'));
    if (status) chips.push('<span class="inv-chip">' + esc(status) + '</span>');
    if (!effAvailable(v)) chips.push('<span class="inv-chip inv-chip--hold">Held off</span>');
    if (isPending(v)) chips.push('<span class="inv-chip inv-chip--pending">Pending edits</span>');
    if (state.picks[v.slug]) chips.push('<span class="inv-chip inv-chip--pick">Ed&#39;s pick</span>');

    var img = v.thumb
      ? '<img class="inv-row__img" src="' + esc(v.thumb) + '" alt="" loading="lazy" width="64" height="48">'
      : '<span class="inv-row__img inv-row__img--blank" aria-hidden="true"></span>';

    return [
      '<div class="inv-row' + (state.selected === v.slug ? ' is-selected' : '') + '" data-slug="' + esc(v.slug) + '">',
      '  <button type="button" class="inv-row__open" data-open="' + esc(v.slug) + '">',
      '    ' + img,
      '    <span class="inv-row__body">',
      '      <span class="inv-row__title">' + esc(v.title) + '</span>',
      '      <span class="inv-row__meta">' + esc([v.stock, v.vin].filter(Boolean).join(' · ')) + '</span>',
      '      <span class="inv-row__chips">' + chips.join('') + '</span>',
      '    </span>',
      '    <span class="inv-row__nums">',
      '      <span class="inv-row__price">' + esc(money(eff(v, 'price'))) + '</span>',
      '      <span class="inv-row__mi">' + esc(miles(eff(v, 'mileage'))) + '</span>',
      '    </span>',
      '  </button>',
      '  <button type="button" class="inv-star' + (state.picks[v.slug] ? ' is-on' : '') + '" data-pick="' + esc(v.slug) + '" aria-pressed="' + (state.picks[v.slug] ? 'true' : 'false') + '" title="Promote as one of Ed&#39;s picks">&#9733;</button>',
      '</div>'
    ].join('');
  }

  function renderList() {
    var shown = sorted(vehicles.filter(matches));
    var scrollTop = el.list.scrollTop;
    el.list.innerHTML = shown.length
      ? shown.map(rowHtml).join('')
      : '<p class="inv-empty">No vehicles match. Widen the filters, or clear the search.</p>';
    el.list.scrollTop = scrollTop;

    var onSite = vehicles.filter(function (v) { return effAvailable(v); }).length;
    var pending = vehicles.filter(isPending).length;
    el.count.textContent = vehicles.length + ' vehicles · ' + onSite + ' on the site · ' +
      (vehicles.length - onSite) + ' held off · ' + pending + ' with pending edits' +
      (shown.length !== vehicles.length ? ' · showing ' + shown.length : '');
  }

  function onListClick(event) {
    var star = event.target.closest('[data-pick]');
    if (star) { togglePick(star.getAttribute('data-pick')); return; }
    var open = event.target.closest('[data-open]');
    if (open) { select(open.getAttribute('data-open')); }
  }

  /* --------------------------------------------------------------- editor -- */

  function select(slug) {
    state.selected = slug;
    renderList();
    renderEditor();
  }

  function inputHtml(spec, v) {
    var value = eff(v, spec.key);
    var attr = 'data-field="' + esc(spec.key) + '" id="inv-f-' + esc(spec.key) + '"';
    var label = '<label class="form-group__label" for="inv-f-' + esc(spec.key) + '">' + esc(spec.label) + '</label>';
    var control;
    if (spec.kind === 'textarea') {
      control = '<textarea class="input" rows="8" ' + attr + '>' + esc(value) + '</textarea>';
    } else if (spec.kind === 'select') {
      control = '<select class="input" ' + attr + '>' +
        spec.options.map(function (o) {
          return '<option value="' + esc(o) + '"' + (String(value) === o ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('') + '</select>';
    } else {
      var type = spec.kind === 'number' ? 'text' : 'text';
      control = '<input class="input" type="' + type + '" inputmode="' + (spec.kind === 'number' ? 'numeric' : 'text') + '" ' + attr + ' value="' + esc(value) + '">';
    }
    return '<div class="form-group settings-field">' + label + control + '</div>';
  }

  function renderEditor() {
    var v = vehicles.filter(function (x) { return x.slug === state.selected; })[0];
    if (!v) { el.editor.hidden = true; return; }
    el.editor.hidden = false;

    var groups = {};
    SPECS.forEach(function (s) { (groups[s.group] = groups[s.group] || []).push(s); });

    var identity = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') +
      (v.stock ? ' · Stock ' + v.stock : '') + (v.vin ? ' · VIN ' + v.vin : '') +
      (v.synced ? ' · Synced ' + v.synced : '');

    var avail = effAvailable(v);
    var reason = hasOverride(v, 'unavailable_reason') ? editRow(v).fields.unavailable_reason : (v.unavailable_reason || '');

    var html = [
      '<div class="inv-editor__head">',
      '  <h2 id="inv-editor-title">' + esc(v.title) + '</h2>',
      '  <p class="inv-editor__id">' + esc(identity) + '</p>',
      '  <p class="inv-editor__links"><a href="' + esc(v.page) + '" target="_blank" rel="noopener">View the page ↗</a></p>',
      '</div>',
      '<p class="inv-editor__note" id="inv-editor-note">' + (isPending(v)
        ? 'This vehicle has queued edits. They apply at the next inventory sync + deploy.'
        : 'No queued edits. Saves are queued and apply at the next inventory sync + deploy.') + '</p>',
      '<form id="inv-form">'
    ];

    Object.keys(groups).forEach(function (g) {
      html.push('<fieldset class="inv-group"><legend>' + esc(g) + '</legend>');
      groups[g].forEach(function (s) { html.push(inputHtml(s, v)); });
      if (g === 'Description') {
        html.push('<p class="settings-note">Supports paragraphs. Empty = restore the generated description.</p>');
      }
      html.push('</fieldset>');
    });

    html.push('<fieldset class="inv-group"><legend>Availability</legend>');
    html.push('<label class="inv-radio"><input type="radio" name="inv-avail" value="on"' + (avail ? ' checked' : '') + '> <span>On the site</span></label>');
    html.push('<label class="inv-radio"><input type="radio" name="inv-avail" value="hold"' + (avail ? '' : ' checked') + '> <span>Held off the site</span></label>');
    html.push('<div class="form-group settings-field" id="inv-hold-reason-wrap"' + (avail ? ' hidden' : '') + '>');
    html.push('<label class="form-group__label" for="inv-f-unavailable_reason">Reason shown internally</label>');
    html.push('<input class="input" id="inv-f-unavailable_reason" data-field="unavailable_reason" value="' + esc(reason) + '">');
    html.push('</div>');
    html.push('</fieldset>');

    html.push('<p class="settings-note">On the fields above: empty = revert to the feed&#39;s value.</p>');
    html.push('<div class="settings-actions">');
    html.push('<button type="submit" class="btn btn-primary" id="inv-save"' + (state.canEdit ? '' : ' disabled') + '>Save changes</button>');
    html.push('<button type="button" class="btn btn-secondary" id="inv-discard">Discard changes</button>');
    html.push('<button type="button" class="btn btn-secondary" id="inv-clear"' + (isPending(v) && state.canEdit ? '' : ' disabled') + '>Remove queued edits</button>');
    html.push('<button type="button" class="btn btn-secondary inv-editor__pick" data-pick="' + esc(v.slug) + '" aria-pressed="' + (state.picks[v.slug] ? 'true' : 'false') + '">' +
      (state.picks[v.slug] ? '★ Remove Ed&#39;s pick' : '☆ Make it an Ed&#39;s pick') + '</button>');
    html.push('</div>');
    html.push('</form>');

    el.editor.innerHTML = html.join('\n');

    var form = document.getElementById('inv-form');
    form.addEventListener('submit', function (e) { e.preventDefault(); save(v); });
    form.querySelectorAll('input[name="inv-avail"]').forEach(function (radio) {
      radio.addEventListener('change', function () {
        var wrap = document.getElementById('inv-hold-reason-wrap');
        if (wrap) wrap.hidden = !form.querySelector('input[name="inv-avail"][value="hold"]').checked;
      });
    });
  }

  function onEditorClick(event) {
    var pick = event.target.closest('[data-pick]');
    if (pick) { togglePick(pick.getAttribute('data-pick')); return; }
    if (event.target.id === 'inv-discard') {
      var v = vehicles.filter(function (x) { return x.slug === state.selected; })[0];
      if (v) { renderEditor(); say('Changes discarded. Nothing was saved.', 'info'); }
      return;
    }
    if (event.target.id === 'inv-clear') { clearEdits(); }
  }

  /* ------------------------------------------------------------ mutations -- */

  function collectPatch(v) {
    var patch = {};
    var form = document.getElementById('inv-form');
    if (!form) return patch;

    SPECS.forEach(function (spec) {
      var input = form.querySelector('[data-field="' + spec.key + '"]');
      if (!input) return;
      var val = String(input.value || '').trim();
      var cur = String(eff(v, spec.key) == null ? '' : eff(v, spec.key)).trim();
      if (spec.kind === 'number') {
        val = val.replace(/[$,]/g, '');
        cur = cur.replace(/[$,]/g, '');
      }
      if (val !== cur) patch[spec.key] = val;
    });

    var holdRadio = form.querySelector('input[name="inv-avail"][value="hold"]');
    var held = holdRadio ? holdRadio.checked : false;
    if (held !== !effAvailable(v)) {
      patch.available = held ? false : true;
      if (held) {
        var reasonInput = form.querySelector('[data-field="unavailable_reason"]');
        patch.unavailable_reason = (reasonInput && reasonInput.value.trim()) || 'held off the site';
      }
    }
    return patch;
  }

  function save(v) {
    if (!state.canEdit) { say(state.editReason, 'error'); return; }
    var patch = collectPatch(v);
    if (!Object.keys(patch).length) { say('No changes to save.', 'info'); return; }

    var saveBtn = document.getElementById('inv-save');
    if (saveBtn) saveBtn.disabled = true;
    say('Saving…', 'info');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'save', slug: v.slug, fields: patch })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, body: body }; });
    }).then(function (res) {
      if (saveBtn) saveBtn.disabled = false;
      if (res.status === 200) {
        if (res.body.row) state.edits[v.slug] = res.body.row;
        else delete state.edits[v.slug];
        renderList();
        renderEditor();
        say('Saved. Applies to the site at the next inventory sync + deploy.', 'ok');
      } else if (res.status === 401) {
        say('Sign in at /admin/sign-in to save vehicle edits.', 'error');
      } else if (res.status === 503) {
        state.canEdit = false;
        state.editReason = 'The edit queue is not configured on this deployment (no database). Changes cannot be saved from here yet.';
        say(state.editReason, 'error');
        renderEditor();
      } else if (res.status === 422) {
        var why = (res.body.fieldErrors || []).concat(res.body.unknownFields || []).join('; ') || res.body.error || 'Validation failed';
        say('Not saved — ' + why, 'error');
      } else {
        say('Not saved — the edit queue answered ' + res.status + '.', 'error');
      }
    }).catch(function () {
      if (saveBtn) saveBtn.disabled = false;
      say('Not saved — the edit queue could not be reached.', 'error');
    });
  }

  function clearEdits() {
    var v = vehicles.filter(function (x) { return x.slug === state.selected; })[0];
    if (!v || !state.canEdit) return;
    var ok = window.confirm('Remove all queued edits for "' + v.title + '"? The feed\u2019s own data returns at the next sync.');
    if (!ok) return;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ action: 'clear', slug: v.slug })
    }).then(function (r) { return r.status; }).then(function (status) {
      if (status === 200) {
        delete state.edits[v.slug];
        renderList();
        renderEditor();
        say('Queued edits removed. The feed\u2019s values apply at the next sync.', 'ok');
      } else if (status === 401) {
        say('Sign in to change vehicle edits.', 'error');
      } else {
        say('Not cleared — the edit queue answered ' + status + '.', 'error');
      }
    }).catch(function () { say('Not cleared — the edit queue could not be reached.', 'error'); });
  }

  function togglePick(slug) {
    var on = !state.picks[slug];
    fetch(PICKS, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ slug: slug, featured: on })
    }).then(function (r) { return r.status; }).then(function (status) {
      if (status === 200) {
        if (on) state.picks[slug] = true; else delete state.picks[slug];
        renderList();
        if (state.selected === slug) renderEditor();
        say('Ed\u2019s pick updated — live on the site on the next page load.', 'ok');
      } else if (status === 401) {
        say('Sign in to change Ed\u2019s picks.', 'error');
      } else {
        say('Ed\u2019s pick not changed — the site answered ' + status + '.', 'error');
      }
    }).catch(function () { say('Ed\u2019s pick not changed — the site could not be reached.', 'error'); });
  }

  /* ----------------------------------------------------------------- load -- */

  function loadEdits() {
    return fetch(ENDPOINT, { headers: authHeaders() }).then(function (r) {
      if (r.status === 200) {
        return r.json().then(function (body) {
          (body.edits || []).forEach(function (row) { state.edits[row.slug] = row; });
        });
      }
      state.canEdit = false;
      if (r.status === 401) { state.editReason = 'Sign in at /admin/sign-in to edit vehicle records. The list stays readable.'; state.reasonCode = 'signin'; }
      else if (r.status === 503) { state.editReason = 'The edit queue is not configured on this deployment (no database). You can browse the list; changes cannot be saved yet.'; state.reasonCode = 'db'; }
      else { state.editReason = 'The edit queue answered ' + r.status + '. Changes cannot be saved right now.'; state.reasonCode = 'other'; }
    }).catch(function () {
      state.canEdit = false;
      state.editReason = 'The edit queue could not be reached. You can browse the list; changes cannot be saved right now.';
      state.reasonCode = 'network';
    });
  }

  function loadPicks() {
    return fetch(PICKS, { headers: { Accept: 'application/json' } }).then(function (r) {
      return r.ok ? r.json() : null;
    }).then(function (body) {
      (body && body.favourites ? body.favourites : []).forEach(function (slug) { state.picks[slug] = true; });
    }).catch(function () { /* picks are decoration; a failure just shows none lit */ });
  }

  function boot() {
    buildShell();
    if (!vehicles.length) {
      el.list.innerHTML = '<p class="inv-empty">No vehicles were compiled into this page. Run the inventory sync and rebuild.</p>';
      renderCountsOnly();
      return;
    }
    Promise.all([loadEdits(), loadPicks()]).then(function () {
      if (!state.canEdit && state.editReason) say(state.editReason, 'warn');
      renderList();
      renderEditor();
    });
    renderCountsOnly();
  }

  function renderCountsOnly() {
    if (!el.count) return;
    var onSite = vehicles.filter(function (v) { return effAvailable(v); }).length;
    el.count.textContent = vehicles.length + ' vehicles · ' + onSite + ' on the site · ' +
      (vehicles.length - onSite) + ' held off';
  }

  // Test hook. Not a public API: the jsdom harness reads state and drives the
  // same DOM a person would; nothing here does work the UI cannot do.
  window.INVENTORY_ADMIN = {
    state: state,
    select: select,
    collectPatch: function (slug) {
      var v = vehicles.filter(function (x) { return x.slug === slug; })[0];
      return v ? collectPatch(v) : {};
    }
  };

  boot();
})();
