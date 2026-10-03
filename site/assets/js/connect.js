/* ==========================================================================
   Caddy Ed - "Stay Connected" hub behaviour
   Vanilla JS, no dependencies. Progressive enhancement only: if a network call
   fails the modules fall back to build-time data and labelled empty states, so
   the page always renders something real.

   Config is injected as window.CADDY_CONNECT (see partials/connect-config.html
   in Hugo, or the inline block in the standalone index.html).
   ========================================================================== */
(function () {
  "use strict";

  var cfg = window.CADDY_CONNECT || {};
  var CONFIG = {
    // Empty by default: the stock list is baked at build time from real
    // inventory pages, so there is nothing to fetch and no skeleton flash.
    // Point this at a live feed to switch the panel to pull mode.
    stockEndpoint: cfg.stockEndpoint || "",
    // (social feed config moved to assets/js/social-feed.js)
    // /.netlify/functions/contact-form, not /api/contact. There is no /api/
    // route on this site -- a Gatsby-ism from before the Hugo rewrite -- so the
    // "Ask Ed" form submitted into a 404 and reported a generic failure. The
    // payload was already correct; only the URL was from another framework.
    askEndpoint: cfg.askEndpoint || "/.netlify/functions/contact-form",
    alertFormName: cfg.alertFormName || "stock-alerts",
    visibleCount: cfg.visibleCount || 6,
    totalStock: cfg.totalStock || null,
    buildDate: cfg.buildDate || ""
  };

  var embedded = window.CADDY_STOCK_FALLBACK || [];
  var state = { items: [], filter: "all", expanded: false };

  /* ------------------------------------------------------------ helpers -- */

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Condition buckets. One dimension only.
  function bucket(item) {
    var s = (item.status || "").toLowerCase();
    var c = (item.condition || "").toLowerCase();
    if (s === "new") return "new";
    if (c.indexOf("certified") > -1) return "cpo";
    return "pre-owned";
  }

  // Fuel type is a second, independent dimension, so Electric stands on its own
  // and deliberately ignores the condition buckets when selected.
  function isElectric(item) {
    return /lyriq|vistiq|optiq|celestiq|escalade iq|\bev\b|electric/i.test(item.title || "");
  }

  function matchesFilter(item) {
    if (state.filter === "all") return true;
    if (state.filter === "electric") return isElectric(item);
    return bucket(item) === state.filter;
  }

  // Newest model year first, then the priciest, so "Fresh stock" reads as fresh.
  // Swap the key here if the feed exposes a real arrival date.
  function sortItems(items) {
    // Guard against non-array input. window.CADDY_STOCK_FALLBACK is set by a
    // Hugo partial; if that partial renders nothing (e.g. no inventory pages),
    // `embedded` is undefined and items.slice() throws.
    if (!Array.isArray(items)) return [];
    return items.slice().sort(function (a, b) {
      var ya = parseInt(a.year, 10) || 0;
      var yb = parseInt(b.year, 10) || 0;
      if (yb !== ya) return yb - ya;
      return (b.price || 0) - (a.price || 0);
    });
  }

  /* -------------------------------------------------------- stock feed --- */

  // The feed may send a formatted priceText or just a numeric price; format the
  // number here so a build never depends on a template number-formatting call.
  function priceLabel(item) {
    if (item.priceText) return item.priceText;
    if (typeof item.price === "number" && item.price > 0) {
      return "$" + item.price.toLocaleString("en-US");
    }
    return "";
  }

  function stockRow(item) {
    var b = bucket(item);
    var condLabel = item.condition || "Pre-Owned";
    var condClass = b === "new" ? "cond cond--new" : "cond";
    var priceText = priceLabel(item);
    return '' +
      '<li class="stock-item" data-bucket="' + esc(b) + '">' +
        '<a class="stock-item__media" href="' + esc(item.href) + '" tabindex="-1" aria-hidden="true">' +
          '<img src="' + esc(item.img) + '" alt="" loading="lazy" decoding="async">' +
        '</a>' +
        '<div class="stock-item__body">' +
          '<div class="stock-item__top">' +
            '<h3 class="stock-item__title"><a href="' + esc(item.href) + '">' + esc(item.title) + '</a></h3>' +
            '<span class="stock-item__price">' + esc(priceText) + '</span>' +
          '</div>' +
          '<p class="stock-item__meta"><span class="' + condClass + '">' + esc(condLabel) + '</span>' +
            (item.meta ? '<span>' + esc(item.meta) + '</span>' : '') +
          '</p>' +
          '<div class="stock-item__actions">' +
            '<a class="btn btn-outline btn-sm" href="' + esc(item.href) + '">Details</a>' +
            '<button class="btn btn-primary btn-sm" type="button" data-ask ' +
              'data-title="' + esc(item.title) + '" data-price="' + esc(priceText) + '" ' +
              'data-href="' + esc(item.href) + '">Ask about this</button>' +
          '</div>' +
        '</div>' +
      '</li>';
  }

  function renderStock() {
    var list = $("#stockList");
    if (!list) return;
    var filtered = state.items.filter(matchesFilter);
    var limit = state.expanded ? filtered.length : CONFIG.visibleCount;
    var shown = filtered.slice(0, limit);

    if (!shown.length) {
      list.innerHTML = '<li><div class="empty-state"><strong>Nothing in this group right now</strong>' +
        'Stock turns over fast. Clear the filter or tell me what you are after and I will find it.</div></li>';
    } else {
      list.innerHTML = shown.map(stockRow).join("");
    }

    var more = $("#stockMore");
    if (more) {
      var hiddenCount = filtered.length - shown.length;
      more.hidden = hiddenCount <= 0;
      more.textContent = "Show " + hiddenCount + " more";
    }
    var fewer = $("#stockFewer");
    if (fewer) fewer.hidden = !(state.expanded && filtered.length > CONFIG.visibleCount);

    updateCounts();
  }

  function updateCounts() {
    var counts = { all: state.items.length, new: 0, cpo: 0, "pre-owned": 0, electric: 0 };
    state.items.forEach(function (it) {
      counts[bucket(it)] = (counts[bucket(it)] || 0) + 1;
      if (isElectric(it)) counts.electric += 1;
    });
    $$("[data-filter]").forEach(function (chip) {
      var k = chip.getAttribute("data-filter");
      var n = counts[k] || 0;
      var base = chip.getAttribute("data-label") || chip.textContent.replace(/\s*\(\d+\)$/, "");
      chip.setAttribute("data-label", base);
      chip.textContent = base + " (" + n + ")";
      chip.hidden = (k !== "all" && n === 0);
      chip.setAttribute("aria-pressed", String(k === state.filter));
    });
    var summary = $("#stockSummary");
    if (summary) {
      var shownNow = Math.min(state.expanded ? state.items.length : CONFIG.visibleCount, state.items.length);
      var total = CONFIG.totalStock || state.items.length;
      summary.textContent = "Showing " + shownNow + " of " + state.items.length + " listed here" +
        (CONFIG.totalStock && CONFIG.totalStock !== state.items.length ? " · " + total + " on the lot" : "");
    }
  }

  // "live" = came from a feed endpoint. "embedded" = baked in at build time
  // from the real inventory pages. Both are real; only one is live.
  function setSource(kind) {
    var live = $("#stockLive");
    var updated = $("#stockUpdated");
    if (live) live.hidden = kind !== "live";
    if (updated) {
      if (kind === "live") {
        updated.textContent = "Live feed";
      } else if (CONFIG.buildDate) {
        updated.textContent = "Updated " + CONFIG.buildDate;
      } else {
        updated.textContent = "";
      }
    }
  }

  function renderSkeleton() {
    var list = $("#stockList");
    if (!list) return;
    var row = '<li class="stock-skeleton"><span class="sk sk--media"></span>' +
      '<span style="display:grid;gap:10px"><span class="sk sk--line short"></span>' +
      '<span class="sk sk--line"></span><span class="sk sk--line short"></span></span></li>';
    list.innerHTML = row + row + row;
  }

  function loadStock() {
    state.items = sortItems(embedded);
    if (!CONFIG.stockEndpoint || !window.fetch) { setSource("embedded"); renderStock(); return; }
    renderSkeleton();
    fetch(CONFIG.stockEndpoint, { headers: { Accept: "application/json" } })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (data) {
        var items = (data && (data.items || data.vehicles)) || [];
        if (!items.length) throw new Error("empty feed");
        if (typeof data.total === "number") CONFIG.totalStock = data.total;
        state.items = sortItems(items);
        setSource("live");
        renderStock();
      })
      .catch(function () { setSource("embedded"); renderStock(); });
  }

  /* ------------------------------------------------------- quick ask ----- */

  function initQuickAsk() {
    var list = $("#stockList");
    var form = $("#quickAsk");
    var field = $("#quickAskMessage");
    var note = $("#quickAskNote");
    if (!form || !field) return;

    if (list) {
      list.addEventListener("click", function (e) {
        var btn = e.target.closest ? e.target.closest("[data-ask]") : null;
        if (!btn) return;
        e.preventDefault();
        var title = btn.getAttribute("data-title");
        var price = btn.getAttribute("data-price");
        field.value = "Hi Ed, I would like more information about the " + title +
          (price ? " listed at " + price : "") + ".";
        setField("vehicle", title);
        form.scrollIntoView({ behavior: "smooth", block: "center" });
        if (note) note.textContent = "Asking about: " + title;
        var first = form.querySelector('input[name="name"]');
        (first || field).focus();
      });
    }

    function setField(name, value) {
      var el = form.querySelector('[name="' + name + '"]');
      if (el) el.value = value;
    }
    function val(name) {
      var el = form.querySelector('[name="' + name + '"]');
      return el ? String(el.value || "").trim() : "";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = $("#quickAskStatus");
      var submit = form.querySelector('button[type="submit"]');
      var name = val("name");
      var email = val("email");
      var message = val("message");

      function fail(text, focusName) {
        if (status) {
          status.className = "form-message form-message--error";
          status.textContent = text;
          status.hidden = false;
        }
        var f = form.querySelector('[name="' + focusName + '"]');
        if (f) f.focus();
      }

      if (!name) { fail("Please add your name so Ed knows who to reply to.", "name"); return; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        fail("Please add a valid email address.", "email"); return;
      }
      if (message.length < 5) { fail("Please add a little more detail.", "message"); return; }

      if (submit) { submit.disabled = true; submit.dataset.label = submit.textContent; submit.textContent = "Sending..."; }

      var vehicle = val("vehicle");
      var payload = {
        formType: "vehicle-question",
        name: name,
        email: email,
        phone: val("phone"),
        vehicle: vehicle,
        website: val("website"),
        _t: val("_t"),
        subject: vehicle ? "Vehicle question: " + vehicle : "Vehicle question from the website",
        message: message
      };

      function done(ok, text) {
        if (status) {
          status.className = "form-message " + (ok ? "form-message--success" : "form-message--error");
          status.textContent = text;
          status.hidden = false;
        }
        if (submit) { submit.disabled = false; submit.textContent = submit.dataset.label || "Send question"; }
        if (ok) {
          form.reset();
          setField("vehicle", "");
          if (note) note.textContent = "";
        }
      }

      if (!window.fetch) { done(false, "This form needs JavaScript. Call 803-431-6180 instead."); return; }
      fetch(CONFIG.askEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }).catch(function () { return { ok: r.ok, j: {} }; }); })
        .then(function (res) {
          // Only an EXPLICIT success counts as success. This used to accept
          // anything that was not an explicit failure, so a static preview's
          // stub ({"error": "..."}, no success field) produced a thank-you for
          // a question that was never sent.
          if (res.ok && res.j && res.j.success === true) {
            done(true, "Thanks, your question is with Ed. He answers the same day.");
          } else {
            var why = res.j && (res.j.message ||
              (typeof res.j.error === "string" ? res.j.error : res.j.error && res.j.error.message));
            done(false, why || "Could not send that just now. Call 803-431-6180 or email ed@caddyed.com.");
          }
        })
        .catch(function () {
          done(false, "Could not send that just now. Call 803-431-6180 or email ed@caddyed.com.");
        });
    });
  }

  /* Social feed and tab behaviour live in assets/js/social-feed.js now --
   cache-based and first-party. The platform embeds that used to be injected
   from this file (Facebook page-plugin iframe, Twitter widgets.js) were
   removed with them: they cost two CSP origins and 43 console errors on a
   logged-out home page load, to render a feed most visitors never saw.
   (The bundle filenames are deliberately not named here -- they are gone.) */
/* --------------------------------------------------------- alerts ------ */

  function initAlerts() {
    var form = $("#stockAlerts");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var status = $("#stockAlertsStatus");
      var email = form.querySelector('[name="email"]');
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
        if (status) { status.className = "form-message form-message--error"; status.textContent = "Please enter a valid email address."; status.hidden = false; }
        if (email) email.focus();
        return;
      }
      if (!window.fetch) return;
      // Netlify's reCAPTCHA (data-netlify-recaptcha on the form) verifies the
      // token server-side. If the widget is still loading -- blocked network,
      // slow connection -- submission proceeds and Netlify answers for itself
      // rather than this code inventing a failure; if it HAS loaded and is
      // unticked, say so instead of posting something Netlify will reject.
      var token = "";
      try {
        if (window.grecaptcha && typeof window.grecaptcha.getResponse === "function") {
          token = window.grecaptcha.getResponse() || "";
        }
      } catch (e) { token = ""; }
      if (!token && window.grecaptcha) {
        if (status) {
          status.className = "form-message form-message--error";
          status.textContent = "Please tick the \u201CI\u2019m not a robot\u201D box, then send again.";
          status.hidden = false;
        }
        return;
      }
      // Netlify's honeypot only works if the field reaches the server inside
      // the POST body (the docs say so for AJAX submissions). Empty for a
      // person, filled by a bot -- and Netlify quietly rejects a filled one.
      var trap = form.querySelector('[name="website"]');
      var body = "form-name=" + encodeURIComponent(CONFIG.alertFormName) +
        "&email=" + encodeURIComponent(email.value) +
        "&website=" + encodeURIComponent(trap ? trap.value : "") +
        (token ? "&g-recaptcha-response=" + encodeURIComponent(token) : "");
      fetch("/", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body })
        .then(function (r) {
          if (!r.ok) throw new Error("bad");
          if (status) { status.className = "form-message form-message--success"; status.textContent = "You are on the list. New arrivals get sent to that address."; status.hidden = false; }
          form.reset();
        })
        .catch(function () {
          if (status) { status.className = "form-message form-message--error"; status.textContent = "Could not sign you up just now. Call 803-431-6180 and I will add you."; status.hidden = false; }
        });
    });
  }

  /* ------------------------------------------------------------- boot ---- */

  function boot() {
    $$("[data-filter]").forEach(function (chip) {
      chip.addEventListener("click", function () {
        state.filter = chip.getAttribute("data-filter");
        state.expanded = false;
        renderStock();
      });
    });
    var more = $("#stockMore");
    if (more) more.addEventListener("click", function () { state.expanded = true; renderStock(); });
    var fewer = $("#stockFewer");
    if (fewer) fewer.addEventListener("click", function () { state.expanded = false; renderStock(); });    initQuickAsk();
    initAlerts();
    loadStock();  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
