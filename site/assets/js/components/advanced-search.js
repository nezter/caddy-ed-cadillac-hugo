/**
 * advanced-search.js
 *
 * Cross-entity search console for the staff area (/admin/search).
 *
 * WHAT THIS TALKS TO
 * ------------------
 * One function, `netlify/functions/search.js`, reached at its own name and
 * dispatching on `event.path`:
 *
 *   GET    /.netlify/functions/search              -> performSearch
 *   GET    /.netlify/functions/search/facets       -> getSearchFacets
 *   GET    /.netlify/functions/search/suggestions  -> getSearchSuggestions
 *   GET    /.netlify/functions/search/saved        -> getSavedSearches
 *   POST   /.netlify/functions/search/saved        -> saveSearch
 *   DELETE /.netlify/functions/search/saved/<id>   -> deleteSavedSearch
 *
 * There is no api-prefix rewrite on this site any more (see the redirect
 * notes in netlify.toml), so the direct function path is the only one that
 * resolves, and no alias is needed: the sub-path above the function name IS
 * the dispatch key.
 *
 * WHY THIS IS IN THE STAFF AREA AND NOT PUBLIC
 * --------------------------------------------
 * search.js opens with `authenticateRequest({ requireAuth: true,
 * allowedRoles: ['admin','manager','sales_rep'], requiredPermissions:
 * ['search_read'] })`. It indexes customers, leads, interactions and vehicles
 * -- CRM rows, including lead scores, sales-rep assignment and interaction
 * content. A public visitor cannot hold a token for it, so a public search page
 * wired to this function would show a 401 on every single query. That is why
 * there is no /search page: the page that would be added is the staff console,
 * and the only honest thing to put in the site header is a link to it.
 *
 * THE RESPONSE ENVELOPE (this was the actual bug)
 * -----------------------------------------------
 * Every function answers through `utils/error-handler`, so a success body is
 *
 *     { success: true, message: "...", data: { ...payload... }, timestamp }
 *
 * and a failure body is `{ success: false, message, errorCode }`.
 *
 * The previous version of this file read `body.results`, `body.facets`,
 * `body.total_results`, `body.pagination`, `body.suggestions` and
 * `body.saved_searches` straight off the parsed body. Every one of those is one
 * level too high: they live under `body.data`. `body.results` was therefore
 * always `undefined`, `this.results` was always `[]`, and the page rendered
 * "No results found" forever -- a search that could not have worked and looked
 * exactly like a search that found nothing. `callApi()` below is the single
 * place the envelope is opened.
 *
 * FACETS
 * ------
 * `search.js` -> `parseFiltersFromQuery` decides which filter params mean
 * anything, and it is not symmetric:
 *
 *   comma-split (multi-select is real):  status
 *   scalar (multi-select is a lie):      customer_type, lead_source, make,
 *                                        model, sales_rep_id, year, min_price,
 *                                        max_price, date_from, date_to
 *   not parsed at all:                   entity_type
 *
 * So the sidebar offers checkboxes for `status` and radios for everything else,
 * and the entity-type facet drives the `entities=` parameter (which is the
 * mechanism that actually works) rather than an `entity_type=` parameter the
 * function would silently drop. `sales_reps` is rendered read-only: the
 * result-side facet counts by rep NAME while the filter wants an id.
 *
 * FAILURE HANDLING
 * ----------------
 * Every request resolves to one of six rendered states -- idle, loading,
 * results, empty, sign-in-required, or error-with-retry -- because "no results"
 * and "the request never happened" must never look alike. A 401 gets its own
 * state, because here a 401 is the expected first response for a staff member
 * whose session has not been restored yet, not an exceptional condition.
 */

const API = {
  search: '/.netlify/functions/search',
  facets: '/.netlify/functions/search/facets',
  suggestions: '/.netlify/functions/search/suggestions',
  saved: '/.netlify/functions/search/saved'
};

const SIGN_IN_URL = '/admin/dashboard';

/** Entity types search.js can actually dispatch (see utils/search-service). */
const ENTITY_TYPES = [
  { value: 'customers', label: 'Customers' },
  { value: 'leads', label: 'Leads' },
  { value: 'interactions', label: 'Interactions' },
  { value: 'vehicles', label: 'Vehicles' },
  { value: 'appointments', label: 'Appointments' }
];

/**
 * Result-side facets, and the query parameter each one drives.
 * `entities` is special: it is the only mechanism for narrowing by entity type.
 */
const RESULT_FACETS = [
  { key: 'entity_types', label: 'Entity type', param: 'entities', multi: false },
  { key: 'status', label: 'Status', param: 'status', multi: true },
  { key: 'customer_types', label: 'Customer type', param: 'customer_type', multi: false },
  { key: 'lead_sources', label: 'Lead source', param: 'lead_source', multi: false },
  { key: 'vehicle_makes', label: 'Vehicle make', param: 'make', multi: false },
  { key: 'vehicle_models', label: 'Vehicle model', param: 'model', multi: false }
];

/** Counted, but not filterable -- see the sales_reps note in the header. */
const READONLY_FACETS = [{ key: 'sales_reps', label: 'Sales rep' }];

/** Facet groups offered in the left filter panel, from GET /facets. */
const FILTER_PANEL_FACETS = [
  { key: 'customer_types', label: 'Customer type', param: 'customer_type', valueKey: 'customer_type' },
  { key: 'lead_sources', label: 'Lead source', param: 'lead_source', valueKey: 'lead_source' },
  { key: 'vehicle_makes', label: 'Vehicle make', param: 'make', valueKey: 'make' }
];

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'created_at', label: 'Date created' },
  { value: 'updated_at', label: 'Last updated' },
  { value: 'score', label: 'Score (leads)' },
  { value: 'list_price', label: 'Price (vehicles)' }
];

const SUGGESTION_DELAY_MS = 180;

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape text destined for innerHTML. Every field here is CRM-supplied. */
function escapeHtml(value) {
  // A single global regex rather than String.prototype.replaceAll: entry.html
  // compiles this bundle to an es2018 target and esbuild transpiles syntax, not
  // built-ins, so replaceAll would be undefined on exactly the older browsers
  // that target is written to still cover.
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/**
 * Inline SVG instead of `<i class="fas ...">`.
 *
 * Font Awesome is not loaded anywhere on this site -- there is no <link> to it,
 * no webfont, and the CSP does not allow a CDN for it -- so every `fa-` icon
 * this component used to emit rendered as an invisible empty box. The primary
 * submit control was icon-only, which means it was an empty button.
 * `currentColor` means the design tokens drive these the same as any text.
 */
const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="M16.5 16.5 21 21"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  bookmark: '<path d="M6 3h12v18l-6-4-6 4z"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14"/>',
  eye: '<path d="M2 12c3-6 7-8 10-8s7 2 10 8c-3 6-7 8-10 8s-7-2-10-8z"/><circle cx="12" cy="12" r="3"/>',
  save: '<path d="M4 4h14l2 2v14H4zM8 4v5h8V4M8 20v-6h8v6"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v4M12 17v.5"/>',
  lock: '<path d="M6 11h12v10H6zM9 11V7a3 3 0 0 1 6 0v4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  'user-plus': '<circle cx="10" cy="8" r="4"/><path d="M2 21c0-4 4-6 8-6 1 0 2 .1 3 .4M18 14v6M15 17h6"/>',
  comments: '<path d="M21 12a8 8 0 0 1-8 8H4l2-3a8 8 0 1 1 15-5z"/>',
  car: '<path d="M4 15l1.5-5L8 5h8l2.5 5L20 15v4h-3v-2H7v2H4z"/><circle cx="7.5" cy="15" r="1"/><circle cx="16.5" cy="15" r="1"/>',
  calendar: '<path d="M4 6h16v15H4zM4 10h16M8 3v4M16 3v4"/>',
  dot: '<circle cx="12" cy="12" r="4"/>'
};

/**
 * @param {string} name key of ICONS
 * @param {string} [label] accessible name; omit for decorative icons
 */
function icon(name, label) {
  const body = ICONS[name] || ICONS.dot;
  const a11y = label
    ? ` role="img" aria-label="${escapeHtml(label)}"`
    : ' aria-hidden="true" focusable="false"';
  return (
    `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"` +
    ` stroke-width="2" stroke-linecap="round" stroke-linejoin="round"${a11y}>${body}</svg>`
  );
}

/**
 * The staff functions authenticate with a bearer JWT. session-manager.js
 * persists it in localStorage under `auth_token`; read it from the same place
 * so an authenticated rep gets results instead of a 401.
 *
 * Without this header the component could NEVER have worked: search.js requires
 * auth, and the previous version of this file sent no credentials at all.
 */
function authHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  try {
    const token = window.localStorage.getItem('auth_token');
    if (token) headers.Authorization = `Bearer ${token}`;
  } catch {
    // Storage-disabled browsers: fall through unauthenticated and let the 401
    // handler render the sign-in state.
  }
  return headers;
}

/**
 * One fetch wrapper for the whole component.
 *
 * @returns {Promise<{ok: true, data: any}|{ok: false, kind: string, message: string, detail?: string}>}
 */
async function callApi(url, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { ...authHeaders(), ...(options.headers || {}) }
    });
  } catch {
    return {
      ok: false,
      kind: 'network',
      message: 'Could not reach the server. Check your connection and try again.'
    };
  }

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      kind: 'auth',
      message:
        response.status === 403
          ? 'Your account does not have permission to run searches.'
          : 'Sign in to search customers, leads and vehicles.'
    };
  }

  let body = null;
  try {
    body = await response.json();
  } catch {
    // A non-JSON body on an error status is a proxy error page, not the API.
  }

  if (!response.ok || (body && body.success === false)) {
    return {
      ok: false,
      kind: 'http',
      message: (body && body.message) || `Request failed (HTTP ${response.status}).`,
      detail: body && body.errorDetails
    };
  }

  // The envelope. Everything below reads `.data`, never the top level.
  return { ok: true, data: body ? body.data : null };
}

function capitalizeFirst(value) {
  const s = String(value == null ? '' : value);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function formatDate(value) {
  if (!value) return 'N/A';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'N/A';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

class AdvancedSearch {
  /** @param {HTMLElement} root the `#advanced-search-app` mount point */
  constructor(root) {
    this.root = root;
    this.searchCriteria = {
      query: '',
      entity_types: ['customers', 'leads', 'interactions', 'vehicles'],
      filters: {},
      sort_by: 'relevance',
      sort_order: 'desc',
      limit: 20,
      offset: 0
    };
    this.results = [];
    this.facets = {};
    this.savedSearches = [];
    this.availableFacets = null;
    this.searchHistory = [];
    this.currentPage = 1;
    this.searchSeq = 0;
    this.suggestSeq = 0;
    this.suggestTimer = null;
  }

  // --- lifecycle ----------------------------------------------------------

  async start() {
    this.render();
    this.bindEvents();
    this.setState('idle');
    this.restoreFromURL();

    // Facets and saved searches are supporting chrome. A failure in either
    // must not block searching, but it must not be silent either: the panel
    // that could not load says so.
    this.loadFacets();
    this.loadSavedSearches();
  }

  // --- rendering ----------------------------------------------------------

  render() {
    this.root.innerHTML = `
      <div class="advanced-search">
        <form class="search-header" id="search-form" role="search">
          <div class="search-input-group">
            <div class="search-input-wrapper">
              <label class="visually-hidden" for="search-input">Search the CRM</label>
              <input type="search" id="search-input" name="q"
                     placeholder="Search customers, leads, interactions, vehicles&hellip;"
                     autocomplete="off" />
              <button type="submit" id="search-button" class="btn btn-primary">
                ${icon('search')}<span class="visually-hidden">Search</span>
              </button>
              <button type="button" id="clear-search" class="btn btn-ghost search-clear" hidden>
                ${icon('close')}<span class="visually-hidden">Clear search</span>
              </button>
            </div>
            <div id="search-suggestions" class="search-suggestions" role="listbox"
                 aria-label="Search suggestions" hidden></div>
          </div>

          <div class="search-actions">
            <button type="button" id="filter-toggle" class="btn btn-secondary"
                    aria-expanded="false" aria-controls="filters-panel">
              ${icon('filter')}<span id="filter-toggle-label">Filters</span>
              <span id="active-filters-count" class="filter-count" hidden>0</span>
            </button>
            <button type="button" id="save-search-btn" class="btn btn-secondary" disabled>
              ${icon('save')} Save Search
            </button>
            <button type="button" id="saved-searches-toggle" class="btn btn-secondary"
                    aria-expanded="false" aria-controls="saved-searches-panel">
              ${icon('bookmark')} Saved
            </button>
          </div>
        </form>

        <div id="filters-panel" class="filters-panel" hidden>
          <div class="filters-content">
            <div class="filter-section">
              <h3 class="filter-section__title">Search in</h3>
              <div class="entity-type-filters">
                ${ENTITY_TYPES.map(
                  (t) => `<label>
                    <input type="checkbox" value="${t.value}" data-entity /> ${t.label}
                  </label>`
                ).join('')}
              </div>
            </div>

            <div class="filter-section">
              <h3 class="filter-section__title">Date range</h3>
              <div class="date-filters">
                <div class="date-input">
                  <label for="date-from">From</label>
                  <input type="date" id="date-from" />
                </div>
                <div class="date-input">
                  <label for="date-to">To</label>
                  <input type="date" id="date-to" />
                </div>
              </div>
            </div>

            <div id="facet-filters" class="facet-filters">
              <p class="filter-section__placeholder">Loading filter values&hellip;</p>
            </div>

            <div class="filter-section">
              <h3 class="filter-section__title">Sort by</h3>
              <div class="sort-options">
                <label class="visually-hidden" for="sort-by">Sort field</label>
                <select id="sort-by">
                  ${SORT_OPTIONS.map((o) => `<option value="${o.value}">${o.label}</option>`).join('')}
                </select>
                <label class="visually-hidden" for="sort-order">Sort order</label>
                <select id="sort-order">
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
            </div>
          </div>

          <div class="filter-actions">
            <button type="button" id="clear-filters" class="btn btn-ghost">Clear all</button>
            <button type="button" id="apply-filters" class="btn btn-primary">Apply filters</button>
          </div>
        </div>

        <div id="saved-searches-panel" class="saved-searches-panel" hidden>
          <div class="saved-searches-header">
            <h3 class="saved-searches-header__title">Saved searches</h3>
            <button type="button" id="close-saved-searches" class="btn-icon" title="Close">
              ${icon('close')}<span class="visually-hidden">Close saved searches</span>
            </button>
          </div>
          <div id="saved-searches-list" class="saved-searches-list"></div>
        </div>

        <div class="search-results">
          <div class="results-header">
            <div class="results-info">
              <span id="results-count">No search performed yet</span>
              <span id="search-time" class="results-time"></span>
            </div>
            <div class="results-actions">
              <label class="visually-hidden" for="results-per-page">Results per page</label>
              <select id="results-per-page">
                <option value="10">10 per page</option>
                <option value="20" selected>20 per page</option>
                <option value="50">50 per page</option>
                <option value="100">100 per page</option>
              </select>
            </div>
          </div>

          <div class="results-layout">
            <div id="facets-sidebar" class="facets-sidebar" hidden></div>
            <div class="results-content">
              <div id="search-status" class="search-status" role="status" aria-live="polite"></div>
              <div id="loading-indicator" class="loading-indicator" role="status" hidden>
                <span class="spinner" aria-hidden="true"></span>
                <span>Searching&hellip;</span>
              </div>
              <div id="results-list" class="results-list"></div>
              <div id="pagination" class="pagination" hidden></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // --- state machine ------------------------------------------------------

  /**
   * The six states this component can be in. Each renders visibly and
   * differently; collapsing any of them into another is the defect this
   * rewrite exists to remove.
   */
  setState(state, options = {}) {
    const status = document.getElementById('search-status');
    const list = document.getElementById('results-list');
    const pagination = document.getElementById('pagination');
    const count = document.getElementById('results-count');
    const time = document.getElementById('search-time');
    if (!status) return;

    this.state = state;
    status.className = `search-status search-status--${state}`;
    status.innerHTML = '';
    list.innerHTML = '';
    pagination.hidden = true;
    pagination.innerHTML = '';
    if (time) time.textContent = '';

    switch (state) {
      case 'idle':
        count.textContent = 'No search performed yet';
        status.innerHTML = `
          <p class="search-status__message">
            ${icon('search', 'Search')}
            <span>Enter a name, email, phone number, VIN or stock number to begin.</span>
          </p>`;
        break;

      case 'loading':
        count.textContent = 'Searching…';
        break;

      case 'results':
        count.textContent = options.summary || '';
        if (options.timing != null) time.textContent = `(${options.timing}ms)`;
        break;

      case 'empty':
        status.innerHTML = `
          <div class="search-status__message">
            ${icon('search', 'No results')}
            <p class="search-status__headline">No results found</p>
            <p class="search-status__detail">
              Nothing matched <strong>${escapeHtml(options.term || '')}</strong> with the
              current filters. Try fewer filters, a shorter term, or a different field.
            </p>
            <button type="button" class="btn btn-secondary" data-action="clear-search">
              ${icon('close')} Clear search
            </button>
          </div>`;
        break;

      case 'auth':
        status.innerHTML = `
          <div class="search-status__message">
            ${icon('lock', 'Sign in required')}
            <p class="search-status__headline">Sign in required</p>
            <p class="search-status__detail">${escapeHtml(options.message || '')}</p>
            <a class="btn btn-primary" href="${SIGN_IN_URL}">${icon('user', 'Sign in')} Sign in</a>
          </div>`;
        break;

      case 'error':
        status.innerHTML = `
          <div class="search-status__message">
            ${icon('alert', 'Search failed')}
            <p class="search-status__headline">Search failed</p>
            <p class="search-status__detail">${escapeHtml(options.message || '')}</p>
            <button type="button" class="btn btn-secondary" data-action="retry">
              ${icon('search', 'Retry')} Try again
            </button>
          </div>`;
        break;

      default:
        break;
    }

    if (state === 'auth' || state === 'error') {
      this.root.querySelectorAll('[data-action="retry"], [data-action="clear-search"]').forEach((el) => {
        el.addEventListener('click', () => {
          if (el.dataset.action === 'clear-search') this.clearSearch();
          else this.performSearch();
        });
      });
    }
  }

  setLoading(loading) {
    const indicator = document.getElementById('loading-indicator');
    if (indicator) indicator.hidden = !loading;
    if (loading) this.setState('loading');
  }

  // --- events -------------------------------------------------------------

  bindEvents() {
    const form = document.getElementById('search-form');
    if (form) {
      // A <form> so Enter submits natively; previously a bare div with a
      // hand-rolled keydown handler, which also meant no implicit submit role.
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.performSearch();
      });
    }

    const input = document.getElementById('search-input');
    if (input) input.addEventListener('input', (e) => this.handleSearchInput(e));

    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) clearBtn.addEventListener('click', () => this.clearSearch());

    const filterToggle = document.getElementById('filter-toggle');
    const filtersPanel = document.getElementById('filters-panel');
    if (filterToggle && filtersPanel) {
      const toggleLabel = document.getElementById('filter-toggle-label');
      filterToggle.addEventListener('click', () => {
        const open = filtersPanel.hidden;
        filtersPanel.hidden = !open;
        filterToggle.setAttribute('aria-expanded', String(open));
        if (toggleLabel) toggleLabel.textContent = open ? 'Hide filters' : 'Filters';
      });
    }

    const applyFilters = document.getElementById('apply-filters');
    if (applyFilters) applyFilters.addEventListener('click', () => this.applyFilters());

    const clearFilters = document.getElementById('clear-filters');
    if (clearFilters) clearFilters.addEventListener('click', () => this.clearFilters());

    this.root.querySelectorAll('.entity-type-filters input[data-entity]').forEach((cb) => {
      cb.addEventListener('change', () => this.syncEntityTypes());
    });

    const sortBy = document.getElementById('sort-by');
    if (sortBy) {
      sortBy.addEventListener('change', (e) => {
        this.searchCriteria.sort_by = e.target.value;
      });
    }
    const sortOrder = document.getElementById('sort-order');
    if (sortOrder) {
      sortOrder.addEventListener('change', (e) => {
        this.searchCriteria.sort_order = e.target.value;
      });
    }

    const perPage = document.getElementById('results-per-page');
    if (perPage) {
      perPage.addEventListener('change', (e) => {
        this.searchCriteria.limit = parseInt(e.target.value, 10) || 20;
        this.searchCriteria.offset = 0;
        this.currentPage = 1;
        if (this.searchCriteria.query) this.performSearch();
      });
    }

    const savedToggle = document.getElementById('saved-searches-toggle');
    const savedPanel = document.getElementById('saved-searches-panel');
    if (savedToggle && savedPanel) {
      savedToggle.addEventListener('click', () => {
        const open = savedPanel.hidden;
        savedPanel.hidden = !open;
        savedToggle.setAttribute('aria-expanded', String(open));
      });
    }
    const closeSaved = document.getElementById('close-saved-searches');
    if (closeSaved && savedPanel) {
      closeSaved.addEventListener('click', () => {
        savedPanel.hidden = true;
        savedToggle.setAttribute('aria-expanded', 'false');
      });
    }

    const saveBtn = document.getElementById('save-search-btn');
    if (saveBtn) saveBtn.addEventListener('click', () => this.promptSaveSearch());

    // Close the suggestions list on an outside click or on Escape.
    document.addEventListener('click', (e) => {
      const group = document.querySelector('.search-input-group');
      if (group && !group.contains(e.target)) this.hideSearchSuggestions();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.hideSearchSuggestions();
    });
  }

  // --- suggestions --------------------------------------------------------

  handleSearchInput(e) {
    const query = e.target.value.trim();
    this.searchCriteria.query = query;

    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) clearBtn.hidden = !query;

    const saveBtn = document.getElementById('save-search-btn');
    if (saveBtn) saveBtn.disabled = !query;

    clearTimeout(this.suggestTimer);
    if (query.length < 2) {
      this.hideSearchSuggestions();
      return;
    }
    // Debounced: the previous version fired a request on every keystroke, so
    // typing "smith" issued five searches and raced them.
    this.suggestTimer = setTimeout(() => this.showSearchSuggestions(query), SUGGESTION_DELAY_MS);
  }

  async showSearchSuggestions(query) {
    const seq = ++this.suggestSeq;
    const result = await callApi(`${API.suggestions}?q=${encodeURIComponent(query)}&limit=10`);
    // Drop the answer if the user kept typing, or started another search.
    if (seq !== this.suggestSeq) return;
    if (!result.ok) {
      // Suggestions are ambient. A failure here hides the list; the search
      // itself reports its own failures, and a suggestion panel stuck open
      // over a 401 is worse than no suggestions.
      this.hideSearchSuggestions();
      return;
    }
    this.renderSearchSuggestions((result.data && result.data.suggestions) || []);
  }

  renderSearchSuggestions(suggestions) {
    const container = document.getElementById('search-suggestions');
    if (!container) return;
    if (!suggestions.length) {
      this.hideSearchSuggestions();
      return;
    }

    container.innerHTML = suggestions
      .map(
        (s) => `
        <button type="button" class="suggestion-item" role="option" data-term="${escapeHtml(s.term)}">
          ${icon(this.getEntityIcon(s.entity_type))}
          <span class="suggestion-text">${escapeHtml(s.term)}</span>
          <span class="suggestion-type">${escapeHtml(s.entity_type)}</span>
        </button>`
      )
      .join('');
    container.hidden = false;

    container.querySelectorAll('.suggestion-item').forEach((item) => {
      item.addEventListener('click', () => {
        const term = item.dataset.term;
        const input = document.getElementById('search-input');
        if (input) input.value = term;
        this.searchCriteria.query = term;
        const clearBtn = document.getElementById('clear-search');
        if (clearBtn) clearBtn.hidden = false;
        const saveBtn = document.getElementById('save-search-btn');
        if (saveBtn) saveBtn.disabled = false;
        this.hideSearchSuggestions();
        this.performSearch();
      });
    });
  }

  hideSearchSuggestions() {
    const container = document.getElementById('search-suggestions');
    if (container) {
      container.hidden = true;
      container.innerHTML = '';
    }
  }

  getEntityIcon(entityType) {
    const map = {
      customers: 'user',
      leads: 'user-plus',
      interactions: 'comments',
      vehicles: 'car',
      appointments: 'calendar'
    };
    return map[entityType] || 'dot';
  }

  // --- the search itself --------------------------------------------------

  async performSearch() {
    if (!this.searchCriteria.query.trim()) {
      this.setState('empty', { term: '' });
      const count = document.getElementById('results-count');
      if (count) count.textContent = 'Enter a search term';
      return;
    }

    const seq = ++this.searchSeq;
    this.setLoading(true);
    this.updateURL();

    const params = new URLSearchParams({
      q: this.searchCriteria.query,
      entities: this.searchCriteria.entity_types.join(','),
      sort_by: this.searchCriteria.sort_by,
      sort_order: this.searchCriteria.sort_order,
      limit: String(this.searchCriteria.limit),
      offset: String(this.searchCriteria.offset)
    });
    Object.keys(this.searchCriteria.filters).forEach((key) => {
      const value = this.searchCriteria.filters[key];
      if (Array.isArray(value)) {
        if (value.length) params.append(key, value.join(','));
      } else if (value !== '' && value != null) {
        params.append(key, String(value));
      }
    });

    const result = await callApi(`${API.search}?${params.toString()}`);

    // A slower earlier request must not overwrite a newer one.
    if (seq !== this.searchSeq) return;
    this.setLoading(false);

    if (!result.ok) {
      this.results = [];
      this.facets = {};
      if (result.kind === 'auth') this.setState('auth', { message: result.message });
      else this.setState('error', { message: result.message });
      return;
    }

    // `result.data` is the payload object built in search.js performSearch().
    const payload = result.data || {};
    this.results = Array.isArray(payload.results) ? payload.results : [];
    this.facets = payload.facets || {};

    const count = document.getElementById('results-count');
    const total = typeof payload.total_results === 'number' ? payload.total_results : this.results.length;

    if (!this.results.length) {
      this.setState('empty', { term: this.searchCriteria.query });
      if (count) count.textContent = `No results for "${this.searchCriteria.query}"`;
      this.renderResultFacets();
      return;
    }

    this.setState('results', {
      summary: `Found ${total} result${total === 1 ? '' : 's'} for "${this.searchCriteria.query}"`,
      timing: payload.execution_time_ms
    });
    document.getElementById('results-list').innerHTML = this.results
      .map((r) => this.renderResultItem(r))
      .join('');

    this.renderResultFacets();
    this.renderPagination(payload);
    this.addToSearchHistory(this.searchCriteria.query);
  }

  renderResultItem(result) {
    const type = result.entity_type || '';
    return `
      <article class="result-item result-item--${escapeHtml(type)}" data-entity-type="${escapeHtml(type)}">
        <div class="result-icon">${icon(this.getEntityIcon(type))}</div>
        <div class="result-content">
          <div class="result-header">
            <h4 class="result-title">${escapeHtml(this.getResultTitle(result))}</h4>
            <span class="result-entity-type">${escapeHtml(capitalizeFirst(type))}</span>
          </div>
          ${this.getResultSubtitle(result) ? `<p class="result-subtitle">${escapeHtml(this.getResultSubtitle(result))}</p>` : ''}
          ${this.getResultDetails(result) ? `<p class="result-details">${escapeHtml(this.getResultDetails(result))}</p>` : ''}
          <p class="result-meta">
            <span class="result-relevance">Relevance ${
              typeof result.relevance_score === 'number' ? result.relevance_score.toFixed(1) : 'N/A'
            }</span>
            <span class="result-date">Added ${escapeHtml(formatDate(result.created_at))}</span>
          </p>
        </div>
      </article>`;
  }

  getResultTitle(result) {
    switch (result.entity_type) {
      case 'customers':
      case 'leads': {
        const name = [result.first_name, result.last_name].filter(Boolean).join(' ').trim();
        return name || result.email || result.phone || 'Unnamed contact';
      }
      case 'interactions':
        return result.subject || 'Interaction';
      case 'vehicles': {
        const name = [result.year, result.make, result.model].filter(Boolean).join(' ').trim();
        return name || result.stock_number || 'Vehicle';
      }
      case 'appointments':
        return result.title || 'Appointment';
      default:
        return 'Result';
    }
  }

  getResultSubtitle(result) {
    switch (result.entity_type) {
      case 'customers':
      case 'leads':
        return [result.email, result.phone].filter(Boolean).join(' · ');
      case 'interactions':
        return `${result.interaction_type || 'Note'} with ${[result.customer_first_name, result.customer_last_name]
          .filter(Boolean)
          .join(' ')}`.trim();
      case 'vehicles':
        return result.stock_number
          ? `Stock ${result.stock_number}${result.list_price != null ? ` · $${Number(result.list_price).toLocaleString()}` : ''}`
          : '';
      case 'appointments':
        return `Scheduled ${formatDate(result.scheduled_start)}`;
      default:
        return '';
    }
  }

  getResultDetails(result) {
    const parts = [];
    if (result.entity_type === 'customers') {
      if (result.customer_type) parts.push(`Type: ${result.customer_type}`);
      parts.push(`${result.interaction_count || 0} interactions`);
    } else if (result.entity_type === 'leads') {
      if (result.score != null) parts.push(`Score: ${result.score}/100`);
      if (result.lead_source) parts.push(`Source: ${result.lead_source}`);
      if (result.status) parts.push(`Status: ${result.status}`);
    } else if (result.entity_type === 'interactions') {
      if (result.content) {
        const text = String(result.content);
        parts.push(text.length > 120 ? `${text.slice(0, 120)}…` : text);
      }
    } else if (result.entity_type === 'vehicles') {
      if (result.mileage != null) parts.push(`${Number(result.mileage).toLocaleString()} miles`);
      if (result.exterior_color) parts.push(result.exterior_color);
    }
    return parts.join(' · ');
  }

  // --- facets -------------------------------------------------------------

  renderResultFacets() {
    const sidebar = document.getElementById('facets-sidebar');
    if (!sidebar) return;

    // `counts` is carried on the group object. Reading it from a closure over
    // the loop variable would be the kind of thing that silently renders "0".
    const collect = (spec) => {
      const counts = this.facets[spec.key];
      if (!counts || typeof counts !== 'object') return null;
      const entries = Object.keys(counts).filter((k) => k && counts[k] > 0);
      return entries.length ? { spec, counts, entries } : null;
    };

    const groups = RESULT_FACETS.map(collect).filter(Boolean);
    const readOnly = READONLY_FACETS.map(collect).filter(Boolean);

    if (!groups.length && !readOnly.length) {
      sidebar.hidden = true;
      sidebar.innerHTML = '';
      return;
    }

    sidebar.innerHTML =
      '<h3 class="facets-sidebar__title">Narrow results</h3>' +
      groups
        .map(
          ({ spec, counts, entries }) => `
        <fieldset class="facet-group" data-param="${escapeHtml(spec.param)}">
          <legend class="facet-group__title">${escapeHtml(spec.label)}</legend>
          ${entries
            .map((key) => {
              const type = spec.multi ? 'checkbox' : 'radio';
              return `<label class="facet-option">
                <input type="${type}" name="facet-${escapeHtml(spec.param)}"
                       value="${escapeHtml(key)}" data-facet-param="${escapeHtml(spec.param)}"
                       ${this.isFacetSelected(spec, key) ? 'checked' : ''} />
                <span class="facet-option__label">${escapeHtml(capitalizeFirst(key))}</span>
                <span class="facet-option__count">${escapeHtml(String(counts[key]))}</span>
              </label>`;
            })
            .join('')}
        </fieldset>`
        )
        .join('') +
      readOnly
        .map(
          ({ spec, counts, entries }) => `
        <div class="facet-group facet-group--readonly">
          <h4 class="facet-group__title">${escapeHtml(spec.label)}</h4>
          <ul class="facet-counts">
            ${entries
              .map(
                (key) =>
                  `<li><span>${escapeHtml(capitalizeFirst(key))}</span><span>${escapeHtml(String(counts[key]))}</span></li>`
              )
              .join('')}
          </ul>
          <p class="facet-note">Not filterable: the result facet counts by name, the filter takes an id.</p>
        </div>`
        )
        .join('');

    sidebar.hidden = false;
    sidebar.querySelectorAll('input[data-facet-param]').forEach((input) => {
      input.addEventListener('change', () => this.applyFacetFilters());
    });
  }

  isFacetSelected(spec, value) {
    if (spec.param === 'entities') return this.searchCriteria.entity_types.indexOf(value) !== -1;
    const current = this.searchCriteria.filters[spec.param];
    if (current == null) return false;
    return Array.isArray(current) ? current.indexOf(value) !== -1 : current === value;
  }

  applyFacetFilters() {
    // entity_type is not a parameter search.js parses, so the entity-type facet
    // drives `entities` instead. Everything else writes searchCriteria.filters.
    const filters = {};
    RESULT_FACETS.forEach((spec) => {
      if (spec.param === 'entities') return;
      const checked = Array.from(
        this.root.querySelectorAll(
          `#facets-sidebar input[data-facet-param="${spec.param}"]:checked`
        )
      ).map((el) => el.value);
      if (!checked.length) return;
      filters[spec.param] = spec.multi ? checked : checked[0];
    });

    const entityChecked = Array.from(
      this.root.querySelectorAll('#facets-sidebar input[data-facet-param="entities"]:checked')
    ).map((el) => el.value);
    if (entityChecked.length) {
      this.searchCriteria.entity_types = entityChecked;
      this.syncEntityTypeInputs();
    }

    this.searchCriteria.filters = filters;
    this.searchCriteria.offset = 0;
    this.currentPage = 1;
    this.updateActiveFiltersCount();
    this.performSearch();
  }

  // --- filter panel -------------------------------------------------------

  async loadFacets() {
    const result = await callApi(API.facets);
    const panel = document.getElementById('facet-filters');
    if (!panel) return;

    if (!result.ok) {
      // Not fatal: search still works without filter values. But say so,
      // because a silently empty panel reads as "no values exist".
      panel.innerHTML = `<p class="filter-section__placeholder filter-section__placeholder--error">
        ${result.kind === 'auth' ? 'Sign in to load filter values.' : 'Filter values unavailable.'}
      </p>`;
      return;
    }

    this.availableFacets = (result.data && result.data.facets) || {};
    this.renderFacetFilters();
  }

  renderFacetFilters() {
    const panel = document.getElementById('facet-filters');
    if (!panel) return;
    const facets = this.availableFacets || {};

    const groups = FILTER_PANEL_FACETS.map((spec) => {
      const rows = Array.isArray(facets[spec.key]) ? facets[spec.key] : [];
      const values = rows
        .filter((r) => r && r[spec.valueKey])
        .slice(0, 6)
        .map((r) => ({ value: r[spec.valueKey], count: r.count }));
      return values.length ? { spec, values } : null;
    }).filter(Boolean);

    if (!groups.length) {
      panel.innerHTML =
        '<p class="filter-section__placeholder">No filter values in the database yet.</p>';
      return;
    }

    panel.innerHTML = groups
      .map(
        ({ spec, values }) => `
      <fieldset class="filter-section" data-param="${escapeHtml(spec.param)}">
        <legend class="filter-section__title">${escapeHtml(spec.label)}</legend>
        <div class="facet-options">
          <label>
            <input type="radio" name="fp-${escapeHtml(spec.param)}" value=""
                   data-filter-param="${escapeHtml(spec.param)}"
                   ${this.isFilterSelected(spec, '') ? 'checked' : ''} /> Any
          </label>
          ${values
            .map(
              (v) => `<label>
                <input type="radio" name="fp-${escapeHtml(spec.param)}"
                       value="${escapeHtml(v.value)}"
                       data-filter-param="${escapeHtml(spec.param)}"
                       ${this.isFilterSelected(spec, v.value) ? 'checked' : ''} />
                ${escapeHtml(capitalizeFirst(v.value))} (${escapeHtml(String(v.count))})
              </label>`
            )
            .join('')}
        </div>
      </fieldset>`
      )
      .join('');
  }

  isFilterSelected(spec, value) {
    const current = this.searchCriteria.filters[spec.param];
    if (value === '') return current == null || current === '';
    return current === value;
  }

  applyFilters() {
    const filters = {};

    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    if (dateFrom && dateFrom.value) filters.date_from = dateFrom.value;
    if (dateTo && dateTo.value) filters.date_to = dateTo.value;

    this.root.querySelectorAll('#facet-filters input[data-filter-param]:checked').forEach((el) => {
      if (el.value) filters[el.dataset.filterParam] = el.value;
    });

    this.searchCriteria.filters = filters;
    this.searchCriteria.offset = 0;
    this.currentPage = 1;
    this.updateActiveFiltersCount();
    this.performSearch();
  }

  clearFilters() {
    this.searchCriteria.filters = {};
    this.searchCriteria.offset = 0;
    this.currentPage = 1;

    const dateFrom = document.getElementById('date-from');
    const dateTo = document.getElementById('date-to');
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';
    this.root
      .querySelectorAll('#facet-filters input[type="radio"][value=""]')
      .forEach((el) => {
        el.checked = true;
      });
    this.root.querySelectorAll('#facets-sidebar input[type="checkbox"]').forEach((el) => {
      el.checked = false;
    });

    this.updateActiveFiltersCount();
    if (this.searchCriteria.query) this.performSearch();
  }

  syncEntityTypes() {
    this.searchCriteria.entity_types = Array.from(
      this.root.querySelectorAll('.entity-type-filters input[data-entity]:checked')
    ).map((el) => el.value);
    this.searchCriteria.offset = 0;
    this.currentPage = 1;
  }

  syncEntityTypeInputs() {
    this.root.querySelectorAll('.entity-type-filters input[data-entity]').forEach((cb) => {
      cb.checked = this.searchCriteria.entity_types.indexOf(cb.value) !== -1;
    });
  }

  updateActiveFiltersCount() {
    const count = Object.values(this.searchCriteria.filters)
      .flat()
      .filter((v) => v !== '' && v != null).length;
    const el = document.getElementById('active-filters-count');
    if (el) {
      el.textContent = String(count);
      el.hidden = count === 0;
    }
  }

  // --- pagination ---------------------------------------------------------

  renderPagination(payload) {
    const pagination = document.getElementById('pagination');
    if (!pagination) return;

    const total = typeof payload.total_results === 'number' ? payload.total_results : this.results.length;
    const limit = this.searchCriteria.limit;
    const currentPage = Math.floor(this.searchCriteria.offset / limit) + 1;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    if (totalPages <= 1) {
      pagination.hidden = true;
      return;
    }

    const start = Math.max(1, currentPage - 2);
    const end = Math.min(totalPages, currentPage + 2);
    const button = (page, label, extra) =>
      `<button type="button" class="page-btn${extra}" data-page="${page}"${
        page === currentPage ? ' aria-current="page"' : ''
      }>${label}</button>`;

    pagination.innerHTML =
      '<div class="pagination-controls">' +
      (currentPage > 1 ? button(currentPage - 1, 'Previous', '') : '') +
      Array.from({ length: end - start + 1 }, (_, i) => start + i)
        .map((p) => button(p, String(p), p === currentPage ? ' active' : ''))
        .join('') +
      (currentPage < totalPages ? button(currentPage + 1, 'Next', '') : '') +
      '</div>';
    pagination.hidden = false;

    pagination.querySelectorAll('.page-btn').forEach((btn) => {
      btn.addEventListener('click', () => this.goToPage(parseInt(btn.dataset.page, 10)));
    });
  }

  goToPage(page) {
    this.currentPage = page;
    this.searchCriteria.offset = (page - 1) * this.searchCriteria.limit;
    this.performSearch();
  }

  // --- saved searches -----------------------------------------------------

  async loadSavedSearches() {
    const result = await callApi(API.saved);
    const list = document.getElementById('saved-searches-list');
    if (!list) return;

    if (!result.ok) {
      list.innerHTML = `<p class="no-saved-searches">${
        result.kind === 'auth' ? 'Sign in to see saved searches.' : 'Saved searches unavailable.'
      }</p>`;
      return;
    }

    this.savedSearches = (result.data && result.data.saved_searches) || [];
    this.renderSavedSearches();
  }

  renderSavedSearches() {
    const container = document.getElementById('saved-searches-list');
    if (!container) return;

    if (!this.savedSearches.length) {
      container.innerHTML = '<p class="no-saved-searches">No saved searches yet</p>';
      return;
    }

    container.innerHTML = this.savedSearches
      .map(
        (s) => `
      <div class="saved-search-item" data-search-id="${escapeHtml(s.id)}">
        <div class="saved-search-info">
          <h4 class="saved-search-info__name">${escapeHtml(s.name)}</h4>
          <p class="saved-search-info__query">&ldquo;${escapeHtml(s.query)}&rdquo;</p>
          <small>Created ${escapeHtml(formatDate(s.created_at))}</small>
        </div>
        <div class="saved-search-actions">
          <button type="button" class="btn-icon load-search" title="Load search">
            ${icon('play', 'Load search')}<span class="visually-hidden">Load ${escapeHtml(s.name)}</span>
          </button>
          <button type="button" class="btn-icon delete-search" title="Delete search">
            ${icon('trash', 'Delete search')}<span class="visually-hidden">Delete ${escapeHtml(s.name)}</span>
          </button>
        </div>
      </div>`
      )
      .join('');

    // These two buttons were rendered by the previous version and never bound
    // to anything, so "Load" and "Delete" did nothing at all.
    container.querySelectorAll('.saved-search-item').forEach((item) => {
      const id = item.dataset.searchId;
      const saved = this.savedSearches.find((s) => String(s.id) === id);
      const loadBtn = item.querySelector('.load-search');
      const delBtn = item.querySelector('.delete-search');
      if (loadBtn) loadBtn.addEventListener('click', () => this.loadSavedSearch(saved));
      if (delBtn) delBtn.addEventListener('click', () => this.deleteSavedSearch(id, saved));
    });
  }

  loadSavedSearch(saved) {
    if (!saved) return;
    this.searchCriteria.query = saved.query || '';
    this.searchCriteria.filters = saved.filters || {};
    this.searchCriteria.entity_types =
      Array.isArray(saved.entity_types) && saved.entity_types.length
        ? saved.entity_types
        : this.searchCriteria.entity_types;
    const input = document.getElementById('search-input');
    if (input) input.value = this.searchCriteria.query;
    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) clearBtn.hidden = false;
    this.syncEntityTypeInputs();
    this.searchCriteria.offset = 0;
    this.currentPage = 1;
    this.updateActiveFiltersCount();

    const panel = document.getElementById('saved-searches-panel');
    if (panel) panel.hidden = true;
    this.performSearch();
  }

  async deleteSavedSearch(id, saved) {
    if (!window.confirm(`Delete the saved search "${saved && saved.name}"?`)) return;
    const result = await callApi(`${API.saved}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!result.ok) {
      this.showNotification(
        result.kind === 'auth' ? 'Sign in to delete saved searches.' : result.message,
        'error'
      );
      return;
    }
    this.savedSearches = this.savedSearches.filter((s) => String(s.id) !== id);
    this.renderSavedSearches();
    this.showNotification('Saved search deleted.', 'success');
  }

  promptSaveSearch() {
    const name = window.prompt('Name this search:');
    if (!name) return;
    this.saveSearch(name);
  }

  async saveSearch(name) {
    const result = await callApi(API.saved, {
      method: 'POST',
      body: JSON.stringify({
        name,
        query: this.searchCriteria.query,
        filters: this.searchCriteria.filters,
        entity_types: this.searchCriteria.entity_types
      })
    });

    if (!result.ok) {
      this.showNotification(
        result.kind === 'auth' ? 'Sign in to save searches.' : result.message,
        'error'
      );
      return;
    }
    const saved = result.data && result.data.saved_search;
    if (saved) this.savedSearches.unshift(saved);
    this.renderSavedSearches();
    this.showNotification('Search saved.', 'success');
  }

  // --- URL ----------------------------------------------------------------

  updateURL() {
    const params = new URLSearchParams();
    if (this.searchCriteria.query) params.set('q', this.searchCriteria.query);
    if (this.searchCriteria.entity_types.length) {
      params.set('entities', this.searchCriteria.entity_types.join(','));
    }
    const query = params.toString();
    window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }

  restoreFromURL() {
    const params = new URLSearchParams(window.location.search);
    const query = params.get('q');
    const entities = params.get('entities');
    if (!query) return;

    this.searchCriteria.query = query;
    const input = document.getElementById('search-input');
    if (input) input.value = query;
    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) clearBtn.hidden = false;
    const saveBtn = document.getElementById('save-search-btn');
    if (saveBtn) saveBtn.disabled = false;

    if (entities) {
      this.searchCriteria.entity_types = entities.split(',').filter(Boolean);
      this.syncEntityTypeInputs();
    }
    this.performSearch();
  }

  // --- misc ---------------------------------------------------------------

  clearSearch() {
    this.searchCriteria.query = '';
    this.searchCriteria.offset = 0;
    this.currentPage = 1;
    this.results = [];
    this.facets = {};

    const input = document.getElementById('search-input');
    if (input) input.value = '';
    const clearBtn = document.getElementById('clear-search');
    if (clearBtn) clearBtn.hidden = true;
    const saveBtn = document.getElementById('save-search-btn');
    if (saveBtn) saveBtn.disabled = true;

    this.hideSearchSuggestions();
    this.updateURL();
    this.setState('idle');
  }

  addToSearchHistory(query) {
    this.searchHistory = this.searchHistory.filter((q) => q !== query);
    this.searchHistory.unshift(query);
    this.searchHistory = this.searchHistory.slice(0, 10);
  }

  showNotification(message, type) {
    const el = document.createElement('div');
    el.className = `notification notification--${type === 'success' ? 'success' : 'error'}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }
}

/**
 * Boot.
 *
 * The mount point is required. The previous version of this file exported a
 * class and never instantiated it -- no DOMContentLoaded handler, no global --
 * so the 31KB of UI it contained could never have rendered. If the page was
 * rendered without the mount point, say so in the console rather than throwing
 * inside an event handler where nothing would surface it.
 */
function init() {
  const root = document.getElementById('advanced-search-app');
  if (!root) {
    console.error('[advanced-search] #advanced-search-app mount point not found; skipping init.');
    return;
  }
  new AdvancedSearch(root).start();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Exported for tests. Not assigned to `window`: entry.html bundles each entry
// as an IIFE, so a global would not survive the build anyway.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AdvancedSearch, init, callApi, escapeHtml };
}
