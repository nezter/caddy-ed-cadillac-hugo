/*
 * admin-articles.js -- the article editor.
 *
 * WHAT SAVING MEANS. Articles queue in the article_drafts table; the files are
 * written by scripts/articles/apply.js (npm run articles:apply) and published
 * by the next deploy. Every save says exactly that -- a publishing button that
 * pretends it already published is the failure mode this site already
 * documents once (docs/ADMIN.md, the CMS). The queue is also the documented
 * door for LLM agents (docs/CONTENT-API.md); the editor and an agent write the
 * same rows through the same rules.
 *
 * THE LINK PANEL. The targets list is compiled into this page at build time
 * (window.ARTICLE_ADMIN_DATA.targets): the fixed pages, every article, and the
 * newest vehicles. Insert Link drops a markdown link at the cursor. Internal
 * links are the point -- an article that never links back into inventory is
 * a dead end for a reader and for search.
 *
 * SLUGS: lower-case, digits and single hyphens; auto-derived from the title
 * until it is edited by hand, then left alone.
 */
(function () {
  'use strict';

  var ENDPOINT = '/.netlify/functions/articles-admin';

  var root = document.getElementById('articles-admin');
  var statusEl = document.getElementById('articles-admin-status');
  if (!root) return;

  var data = window.ARTICLE_ADMIN_DATA && typeof window.ARTICLE_ADMIN_DATA === 'object' ? window.ARTICLE_ADMIN_DATA : {};
  var built = Array.isArray(data.built) ? data.built : [];
  var targets = Array.isArray(data.targets) ? data.targets : [];

  var state = {
    queue: {},        // slug -> row
    built: {},        // slug -> built article
    selected: null,   // slug
    isNew: false,
    slugTouched: false,
    canEdit: true,
    reason: ''
  };
  built.forEach(function (b) { state.built[b.slug] = b; });

  /* ----------------------------------------------------------- helpers -- */

  function token() {
    try { return window.localStorage.getItem('caddyed_admin_token') || ''; } catch (e) { return ''; }
  }

  function headers() {
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

  function say(message, kind) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'settings-status' + (kind ? ' settings-status--' + kind : '');
    statusEl.hidden = !message;
  }

  function slugify(title) {
    return String(title).toLowerCase()
      .replace(/['\u2019]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  function effective(slug) {
    var row = state.queue[slug];
    var fields = row && row.fields ? row.fields : {};
    var b = state.built[slug] || {};
    return {
      title: fields.title !== undefined ? fields.title : (b.title || ''),
      description: fields.description !== undefined ? fields.description : (b.description || ''),
      date: fields.date !== undefined ? fields.date : (b.date || new Date().toISOString().slice(0, 10)),
      author: fields.author !== undefined ? fields.author : 'Ed Portello',
      tags: fields.tags !== undefined ? fields.tags : [],
      image: fields.image !== undefined ? fields.image : '',
      body: fields.body !== undefined ? fields.body : '',
      published: fields.published !== undefined ? fields.published !== false : true
    };
  }

  /* -------------------------------------------------------------- shell -- */

  var el = {};

  function buildShell() {
    root.innerHTML = [
      '<div class="art-bar">',
      '  <button type="button" class="btn btn-primary" id="art-new">New article</button>',
      '  <label class="art-bar__field"><span>Search</span>',
      '    <input class="input" type="search" id="art-q" placeholder="Title or slug" autocomplete="off"></label>',
      '  <label class="art-bar__field"><span>Show</span>',
      '    <select class="input" id="art-filter">',
      '      <option value="all">Everything</option>',
      '      <option value="queued">Queued, not applied</option>',
      '      <option value="applied">Applied</option>',
      '      <option value="built">On the site</option>',
      '      <option value="drafts">Drafts</option>',
      '    </select></label>',
      '</div>',
      '<p class="art-count" id="art-count" role="status"></p>',
      '<div class="art-layout">',
      '  <div class="art-list" id="art-list" aria-label="Articles"></div>',
      '  <aside class="art-editor" id="art-editor" hidden></aside>',
      '</div>'
    ].join('\n');

    el.q = document.getElementById('art-q');
    el.filter = document.getElementById('art-filter');
    el.count = document.getElementById('art-count');
    el.list = document.getElementById('art-list');
    el.editor = document.getElementById('art-editor');

    document.getElementById('art-new').addEventListener('click', function () { startNew(); });
    el.q.addEventListener('input', renderList);
    el.filter.addEventListener('change', renderList);
    el.list.addEventListener('click', onListClick);
    el.editor.addEventListener('click', onEditorClick);
    el.editor.addEventListener('input', onEditorInput);
  }

  /* --------------------------------------------------------------- list -- */

  function allSlugs() {
    var seen = {};
    var out = [];
    Object.keys(state.queue).forEach(function (s) { if (!seen[s]) { seen[s] = 1; out.push(s); } });
    Object.keys(state.built).forEach(function (s) { if (!seen[s]) { seen[s] = 1; out.push(s); } });
    if (state.isNew && state.selected && !seen[state.selected]) out.unshift(state.selected);
    return out;
  }

  function matches(slug) {
    var q = (el.q && el.q.value || '').trim().toLowerCase();
    var row = state.queue[slug];
    var b = state.built[slug];
    var title = String((row && row.fields && row.fields.title) || (b && b.title) || slug).toLowerCase();
    if (q && title.indexOf(q) === -1 && slug.indexOf(q) === -1) return false;
    var mode = el.filter ? el.filter.value : 'all';
    if (mode === 'queued') return Boolean(row && row.status === 'pending');
    if (mode === 'applied') return Boolean(row && row.status === 'applied');
    if (mode === 'built') return Boolean(b);
    if (mode === 'drafts') {
      var pub = row && row.fields && row.fields.published !== undefined ? row.fields.published !== false : true;
      return pub === false;
    }
    return true;
  }

  function rowHtml(slug) {
    var row = state.queue[slug];
    var b = state.built[slug];
    var eff = effective(slug);
    var chips = [];
    if (row && row.status === 'pending') chips.push('<span class="art-chip art-chip--pending">Queued — apply pending</span>');
    if (row && row.status === 'applied') chips.push('<span class="art-chip art-chip--applied">Applied — publishes on deploy</span>');
    if (b) chips.push('<span class="art-chip art-chip--built">On the site</span>');
    if (eff.published === false) chips.push('<span class="art-chip art-chip--draft">Draft</span>');

    return [
      '<div class="art-row' + (state.selected === slug ? ' is-selected' : '') + '" data-slug="' + esc(slug) + '">',
      '  <button type="button" class="art-row__open" data-open="' + esc(slug) + '">',
      '    <span class="art-row__body">',
      '      <span class="art-row__title">' + esc(eff.title || slug) + '</span>',
      '      <span class="art-row__meta">' + esc(slug) + ' · ' + esc(eff.date) + '</span>',
      '      <span class="art-row__chips">' + chips.join('') + '</span>',
      '    </span>',
      '  </button>',
      '</div>'
    ].join('');
  }

  function renderList() {
    var slugs = allSlugs().filter(matches).sort(function (a, b2) {
      var ea = effective(a), eb = effective(b2);
      return String(eb.date).localeCompare(String(ea.date));
    });
    var scrollTop = el.list.scrollTop;
    el.list.innerHTML = slugs.length
      ? slugs.map(rowHtml).join('')
      : '<p class="art-empty">Nothing here yet. "New article" starts one, or an agent can POST to the API.</p>';
    el.list.scrollTop = scrollTop;

    var queued = Object.keys(state.queue).filter(function (s) { return state.queue[s].status === 'pending'; }).length;
    el.count.textContent = slugs.length + ' shown · ' + Object.keys(state.built).length + ' on the site · ' + queued + ' queued';
  }

  function onListClick(event) {
    var open = event.target.closest('[data-open]');
    if (open) select(open.getAttribute('data-open'));
  }

  /* ------------------------------------------------------------- editor -- */

  function select(slug) {
    state.selected = slug;
    state.isNew = !state.queue[slug] && !state.built[slug];
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

  function fieldId(key) { return 'art-f-' + key; }

  function inputRow(key, label, type, value, hint) {
    var id = fieldId(key);
    var control;
    if (type === 'textarea') {
      control = '<textarea class="input" rows="20" id="' + id + '" data-field="' + key + '">' + esc(value) + '</textarea>';
    } else if (type === 'checkbox') {
      control = '<input type="checkbox" id="' + id + '" data-field="' + key + '"' + (value ? ' checked' : '') + '>';
    } else {
      control = '<input class="input" type="text" id="' + id + '" data-field="' + key + '" value="' + esc(value) + '">';
    }
    return '<div class="form-group settings-field"><label class="form-group__label" for="' + id + '">' + esc(label) + '</label>' + control +
      (hint ? '<p class="settings-note">' + esc(hint) + '</p>' : '') + '</div>';
  }

  function renderEditor() {
    if (state.selected === null && !state.isNew) { el.editor.hidden = true; return; }
    var slug = state.selected || '';
    var eff = state.isNew && !slug ? { title: '', description: '', date: new Date().toISOString().slice(0, 10), author: 'Ed Portello', tags: [], image: '', body: '', published: true } : effective(slug);
    var b = state.built[slug];

    el.editor.hidden = false;
    var html = [
      '<div class="art-editor__head">',
      '  <h2>' + (state.isNew && !slug ? 'New article' : esc(eff.title || slug)) + '</h2>',
      b ? '  <p class="art-editor__links"><a href="' + esc(b.url) + '" target="_blank" rel="noopener">View the page ↗</a></p>' : '',
      '</div>',
      '<form id="art-form">',
      inputRow('title', 'Title', 'text', eff.title),
      inputRow('slug', 'Slug (URL: /articles/<slug>/)', 'text', slug, 'Lower-case letters, digits and single hyphens. Auto-derived from the title until you edit it.'),
      inputRow('description', 'Meta description (search results)', 'text', eff.description, 'Aim for 70–160 characters. This is what Google shows.'),
      inputRow('date', 'Date (YYYY-MM-DD)', 'text', eff.date),
      inputRow('author', 'Author', 'text', eff.author),
      inputRow('tags', 'Tags (comma separated)', 'text', (eff.tags || []).join(', ')),
      inputRow('image', 'Feature image path (optional)', 'text', eff.image, 'e.g. img/caddy-ed.jpg — a file that exists in the site assets.'),
      inputRow('body', 'Body (Markdown)', 'textarea', eff.body),
      inputRow('published', 'Published (unchecked = draft, invisible on the site)', 'checkbox', eff.published !== false),
      '<div class="settings-actions">',
      '  <button type="submit" class="btn btn-primary" id="art-save"' + (state.canEdit ? '' : ' disabled') + '>Save to queue</button>',
      '  <button type="button" class="btn btn-secondary" id="art-discard">Discard changes</button>',
      '  <button type="button" class="btn btn-secondary" id="art-clear"' + (state.queue[slug] && state.canEdit ? '' : ' disabled') + '>Remove from queue</button>',
      '</div>',
      '</form>',
      '<div class="art-links">',
      '  <h3>Insert an internal link</h3>',
      '  <p class="settings-note">Articles should link back into the site. Search, then insert at the cursor.</p>',
      '  <input class="input" type="search" id="art-link-q" placeholder="Search pages, articles, vehicles">',
      '  <div class="art-links__list" id="art-link-list"></div>',
      '</div>'
    ].join('\n');
    el.editor.innerHTML = html;

    document.getElementById('art-form').addEventListener('submit', function (e) { e.preventDefault(); save(); });
    var lq = document.getElementById('art-link-q');
    lq.addEventListener('input', renderLinkTargets);
    document.getElementById('art-link-list').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-insert]');
      if (btn) insertLink(btn.getAttribute('data-insert-title'), btn.getAttribute('data-insert'));
    });
    renderLinkTargets();
  }

  function renderLinkTargets() {
    var host = document.getElementById('art-link-list');
    if (!host) return;
    var q = (document.getElementById('art-link-q').value || '').trim().toLowerCase();
    var list = targets.filter(function (t) {
      return !q || String(t.title).toLowerCase().indexOf(q) !== -1 || String(t.url).toLowerCase().indexOf(q) !== -1;
    }).slice(0, 12);
    host.innerHTML = list.length
      ? list.map(function (t) {
          return '<button type="button" class="art-link-target" data-insert="' + esc(t.url) + '" data-insert-title="' + esc(t.title) + '">' +
            '<span>' + esc(t.title) + '</span><code>' + esc(t.url) + '</code></button>';
        }).join('')
      : '<p class="settings-note">No match.</p>';
  }

  function insertLink(title, url) {
    var body = document.querySelector('[data-field="body"]');
    if (!body) return;
    var markdown = '[' + String(title).replace(/[\[\]]/g, '') + '](' + url + ')';
    var start = body.selectionStart || 0;
    var end = body.selectionEnd || 0;
    body.value = body.value.slice(0, start) + markdown + body.value.slice(end);
    body.selectionStart = body.selectionEnd = start + markdown.length;
    body.focus();
  }

  function onEditorClick(event) {
    if (event.target.id === 'art-discard') { renderEditor(); say('Changes discarded.', 'info'); return; }
    if (event.target.id === 'art-clear') { clearQueueRow(); }
  }

  function onEditorInput(event) {
    if (event.target && event.target.getAttribute('data-field') === 'title' && !state.slugTouched) {
      var slugInput = document.querySelector('[data-field="slug"]');
      if (slugInput) slugInput.value = slugify(event.target.value);
    }
    if (event.target && event.target.getAttribute('data-field') === 'slug') {
      state.slugTouched = true;
    }
  }

  /* ------------------------------------------------------------ actions -- */

  function collect() {
    var form = document.getElementById('art-form');
    var get = function (k) { var el2 = form.querySelector('[data-field="' + k + '"]'); return el2 ? el2.value : ''; };
    var published = form.querySelector('[data-field="published"]');
    var tags = get('tags').split(',').map(function (t) { return t.trim(); }).filter(Boolean);
    return {
      slug: String(get('slug') || '').trim().toLowerCase(),
      fields: {
        title: get('title').trim(),
        description: get('description').trim(),
        date: get('date').trim(),
        author: get('author').trim(),
        tags: tags,
        image: get('image').trim(),
        body: get('body'),
        published: published ? published.checked : true
      }
    };
  }

  function save() {
    if (!state.canEdit) { say(state.reason, 'error'); return; }
    var record = collect();
    if (!record.slug || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(record.slug)) {
      say('The slug must be lower-case letters, digits and single hyphens.', 'error');
      return;
    }
    if (!record.fields.title) { say('A title is required.', 'error'); return; }
    if (record.fields.description.length > 200) { say('The meta description is longer than 200 characters.', 'error'); return; }

    var btn = document.getElementById('art-save');
    if (btn) btn.disabled = true;
    say('Saving…', 'info');

    fetch(ENDPOINT, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ action: 'save', slug: record.slug, fields: record.fields })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (body) { return { status: r.status, body: body }; });
    }).then(function (res) {
      if (btn) btn.disabled = false;
      if (res.status === 200 && res.body.row) {
        state.queue[record.slug] = res.body.row;
        state.selected = record.slug;
        state.isNew = false;
        state.slugTouched = true;
        renderList();
        renderEditor();
        say('Saved to the queue. Run "npm run articles:apply", then deploy — that is what publishes it.', 'ok');
      } else if (res.status === 422) {
        var why = (res.body.fieldErrors || []).concat(res.body.unknownFields || []).join('; ') || res.body.error;
        say('Not saved — ' + why, 'error');
      } else if (res.status === 401) {
        say('Sign in at /admin/sign-in to write articles.', 'error');
      } else if (res.status === 503) {
        state.canEdit = false;
        state.reason = 'The article queue is not configured on this deployment (no database).';
        say(state.reason, 'error');
        renderEditor();
      } else {
        say('Not saved — the queue answered ' + res.status + '.', 'error');
      }
    }).catch(function () {
      if (btn) btn.disabled = false;
      say('Not saved — the article queue could not be reached.', 'error');
    });
  }

  function clearQueueRow() {
    if (!state.selected || !state.canEdit) return;
    if (!window.confirm('Remove "' + state.selected + '" from the queue? An already-applied file stays on disk; delete it in the repository if that is the intent.')) return;
    fetch(ENDPOINT, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ action: 'clear', slug: state.selected })
    }).then(function (r) { return r.status; }).then(function (status) {
      if (status === 200) {
        delete state.queue[state.selected];
        renderList();
        renderEditor();
        say('Queue row removed.', 'ok');
      } else {
        say('Not removed — the queue answered ' + status + '.', 'error');
      }
    }).catch(function () { say('Not removed — the article queue could not be reached.', 'error'); });
  }

  /* --------------------------------------------------------------- load -- */

  function load() {
    return fetch(ENDPOINT, { headers: headers() }).then(function (r) {
      if (r.status === 200) {
        return r.json().then(function (body) {
          (body.articles || []).forEach(function (row) { state.queue[row.slug] = row; });
        });
      }
      state.canEdit = false;
      if (r.status === 401) state.reason = 'Sign in at /admin/sign-in to write articles. The list stays readable.';
      else if (r.status === 503) state.reason = 'The article queue is not configured on this deployment (no database). You can browse existing articles; saving is unavailable.';
      else state.reason = 'The article queue answered ' + r.status + '.';
    }).catch(function () {
      state.canEdit = false;
      state.reason = 'The article queue could not be reached.';
    });
  }

  window.ARTICLES_ADMIN = {
    state: state,
    select: select,
    collect: collect,
    insertLink: insertLink
  };

  buildShell();
  load().then(function () {
    if (!state.canEdit && state.reason) say(state.reason, 'warn');
    renderList();
    if (!allSlugs().length) startNew();
  });
})();
