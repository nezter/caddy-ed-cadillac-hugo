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
    socialEndpoint: cfg.socialEndpoint || "",
    facebookPageUrl: cfg.facebookPageUrl || "",
    xHandle: cfg.xHandle || "",
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
          if (res.ok && res.j && res.j.success !== false) {
            done(true, "Thanks, your question is with Ed. He answers the same day.");
          } else {
            done(false, (res.j && (res.j.message || (res.j.error && res.j.error.message))) ||
              "Could not send that just now. Call 803-431-6180 or email ed@caddyed.com.");
          }
        })
        .catch(function () {
          done(false, "Could not send that just now. Call 803-431-6180 or email ed@caddyed.com.");
        });
    });
  }

  /* ----------------------------------------------------------- tabs ------ */

  function initTabs() {
    var tablist = $('[role="tablist"]');
    if (!tablist) return;
    var tabs = $$('[role="tab"]', tablist);
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(t.getAttribute("aria-controls"));
        if (panel) panel.hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        var next = null;
        if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") next = tabs[0];
        if (e.key === "End") next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next); next.focus(); }
      });
    });
    select(tabs[0]);
  }

  /* --------------------------------------------------------- social ------ */

  function demoPost(opts) {
    return '' +
      '<article class="social-post">' +
        '<div class="post-head">' +
          '<span class="post-avatar" aria-hidden="true">CE</span>' +
          '<span class="post-id"><span class="post-name">' + esc(opts.name) + '</span>' +
          '<span class="post-time">' + esc(opts.time) + '</span></span>' +
        '</div>' +
        '<p class="post-body">' + esc(opts.body) + '</p>' +
        (opts.img ? '<div class="post-media"><img src="' + esc(opts.img) + '" alt="" loading="lazy" decoding="async"></div>' : '') +
        '<div class="post-actions"><span>' + esc(opts.stat1) + '</span><span>' + esc(opts.stat2) + '</span></div>' +
      '</article>';
  }

  function renderDemo(kind) {
    // This used to render two invented Facebook/X posts -- "Sample layout",
    // "Sample reactions", "Sample comments" -- under the real business's name.
    //
    // It rendered 627px of fabricated social content above the fold of a real
    // dealership's home page, for every visitor whose embed did not load: anyone
    // logged out of Facebook, anyone with an ad blocker, and everyone on the
    // static preview. Posts attributed to a named person that the person never
    // wrote are the same problem as a fabricated testimonial, and the reviews
    // side of this is a legal exposure under the FTC's rule on fake reviews
    // (16 CFR 465), not just an aesthetic one.
    //
    // So the fallback is the honest one: a link out, and a line of text saying
    // what would be here. partials/social-feed.html already renders that
    // server-side, so there is nothing to draw -- the panel is left empty and
    // the fallback below it is what the visitor reads.
    var host = document.getElementById(kind === "facebook" ? "panelFacebook" : "panelX");
    if (host) host.innerHTML = "";
  }

  function mountFacebook() {
    var host = document.getElementById("panelFacebook");
    if (!host) return;

    // The configured value has been arriving with a pair of literal double
    // quotes wrapped around it, and the page plugin was being asked for
    //     href=%22https%3A%2F%2Fwww.facebook.com%2Feportello%22
    // which Facebook cannot resolve -- so the embed silently never worked and
    // all that was left was a 620px empty box. Strip surrounding quotes and
    // whitespace before encoding, rather than trusting the source to be clean.
    var page = String(CONFIG.facebookPageUrl || "").trim().replace(/^["']|["']$/g, "").trim();
    if (!page) { renderDemo("facebook"); return; }

    var src = "https://www.facebook.com/plugins/page.php?href=" +
      encodeURIComponent(page) +
      "&tabs=timeline&width=400&height=620&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false";
    host.innerHTML = '<iframe class="social-frame" src="' + esc(src) + '" width="100%" height="620" ' +
      'style="height:620px" title="Caddy Ed on Facebook" loading="lazy" ' +
      'scrolling="no" frameborder="0" allow="encrypted-media"></iframe>';
  }

  function mountX() {
    var host = document.getElementById("panelX");
    if (!host) return;
    if (!CONFIG.xHandle) { renderDemo("x"); return; }
    host.innerHTML = '<a class="twitter-timeline" data-height="620" data-dnt="true" ' +
      'href="https://twitter.com/' + esc(CONFIG.xHandle.replace(/^@/, "")) + '">Posts by ' + esc(CONFIG.xHandle) + '</a>';
    var s = document.createElement("script");
    s.src = "https://platform.twitter.com/widgets.js";
    s.async = true;
    s.onerror = function () { renderDemo("x"); };
    document.head.appendChild(s);
    setTimeout(function () { if (!host.querySelector("iframe")) renderDemo("x"); }, 3500);
  }

  function serverPost(kind, p) {
    var stats = p.stats || {};
    var s1, s2;
    if (kind === "facebook") { s1 = (stats.likes || 0) + " likes"; s2 = (stats.comments || 0) + " comments"; }
    else { s1 = (stats.reposts || 0) + " reposts"; s2 = (stats.likes || 0) + " likes"; }
    var time = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : "";
    var name = kind === "facebook" ? "Caddy Ed - Cadillac Sales Specialist" : (p.handle || "Caddy Ed");
    return '<article class="social-post">' +
      '<div class="post-head">' +
        '<span class="post-avatar" aria-hidden="true">CE</span>' +
        '<span class="post-id"><span class="post-name">' + esc(name) + '</span>' +
        '<span class="post-time">' + esc(time) + '</span></span>' +
      '</div>' +
      '<p class="post-body">' + esc(p.text) + '</p>' +
      (p.image ? '<div class="post-media"><img src="' + esc(p.image) + '" alt="" loading="lazy" decoding="async"></div>' : '') +
      '<div class="post-actions"><span>' + esc(s1) + '</span><span>' + esc(s2) + '</span>' +
        (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" style="margin-left:auto">View post</a>' : '') +
      '</div>' +
    '</article>';
  }

  function renderServer(kind, feed) {
    var host = document.getElementById(kind === "facebook" ? "panelFacebook" : "panelX");
    if (!host || !feed || !feed.posts || !feed.posts.length) return false;
    host.innerHTML = feed.posts.map(function (p) { return serverPost(kind, p); }).join("");
    return true;
  }

  function loadSocial() {
    // social-feed returns { facebook:{posts}, x:{posts} } when tokens are set.
    // Anything missing falls back to the official client embeds, then to the
    // labelled sample layout.
    // The platform embeds are NOT loaded here.
    //
    // This used to fall back to mountFacebook()/mountX() -- which injects a
    // Facebook page-plugin iframe and a platform.twitter.com script -- for every
    // visitor, on every load, to render a feed most of them never see. It was
    // the only thing on this site that reached a third party, and in Firefox
    // with no session the widget logged "DataStore.get: namespace is required"
    // 43 times on one home page load.
    //
    // social-feed.js now loads a platform's embed only when its tab is chosen.
    // If this project's own social endpoint has real posts, those are rendered
    // here as before -- that is first-party and costs nothing. Only the
    // third-party fallback waits for a click.
    if (CONFIG.socialEndpoint && window.fetch) {
      fetch(CONFIG.socialEndpoint, { headers: { Accept: "application/json" } })
        .then(function (r) { return r.ok ? r.json() : {}; })
        .catch(function () { return {}; })
        .then(function (data) {
          renderServer("facebook", data && data.facebook);
          renderServer("x", data && data.x);
        });
    }
  }

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
      var body = "form-name=" + encodeURIComponent(CONFIG.alertFormName) +
        "&email=" + encodeURIComponent(email.value);
      if (!window.fetch) return;
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
    if (fewer) fewer.addEventListener("click", function () { state.expanded = false; renderStock(); });

    initTabs();
    initQuickAsk();
    initAlerts();
    loadStock();
    loadSocial();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
