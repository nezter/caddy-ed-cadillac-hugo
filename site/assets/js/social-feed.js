/**
 * social-feed.js -- load a social feed only when the visitor asks for it.
 *
 * WHAT THE FIRST FIX LEFT BROKEN
 * ------------------------------
 *
 * The version above loaded nothing until a tab was chosen and showed a
 * paragraph of explanation in the meantime. That paragraph was then hidden by
 * this same script on load, so the panel sat empty under the tabs: three
 * quarters of the way to a working feature and looking exactly like a broken
 * one.
 *
 * Now the panel always holds something. For Facebook and X that is the offer
 * to load the feed -- what it costs, a button that does it, and a link that
 * leaves for the network without loading anything. Instagram has no profile
 * embed to offer, so its panel says so and links to the profile.
 *
 * Tabs are rendered by the template only for networks that are configured.
 * The X tab shipped with no X account behind it, so choosing it produced "No
 * X account is configured for this site yet" -- a control that exists to
 * announce it does not work.
 *
 * The tablist answers the arrow keys as well, which is what role="tablist"
 * promises a screen reader and what it did not do.
 *
 * THE PROBLEM
 * -----------
 * connect.js injected the platform widget scripts at page load, for every
 * visitor, to render a feed most of them never see. Three costs, all measured or
 * observed rather than assumed:
 *
 *   1. It is the ONLY thing on this site that reaches a third party. Every other
 *      page byte is first-party, which is most of why the site is quick.
 *   2. In Firefox with no session the widget logs
 *      "DataStore.get: namespace is required" repeatedly while it retries -- 43
 *      console errors on a single home page load.
 *   3. It costs `connect.facebook.net` and `platform.twitter.com` allowances in
 *      the Content-Security-Policy, which are the only two third-party origins
 *      the site needs.
 *
 * WHAT CHANGED
 * ------------
 * The embeds are no longer injected on load. The panel shows a plain, honest
 * prompt and the visitor chooses. Clicking a tab loads that platform's script at
 * that point, and only then.
 *
 * The feature is not removed. It is what the earlier work already assumed: the
 * fallback in social-feed.html says what is there and links to it, and that is
 * what most visitors will now see instead of a blank box and 43 console errors.
 * Someone who wants the live feed in the page still gets it, and gets it without
 * costing everyone else.
 */
(function () {
  'use strict';

  var loaded = {};

  var PLATFORMS = {
    facebook: {
      script: null,          // the page plugin is an iframe, not a script tag
      render: function (host) {
        var page = (window.CADDY_CONNECT && window.CADDY_CONNECT.facebookPageUrl) || '';
        if (!page) {
          host.innerHTML = '<p class="social-fallback__note">No Facebook page is ' +
            'configured for this site yet.</p>';
          return;
        }
        var src = 'https://www.facebook.com/plugins/page.php?href=' +
          encodeURIComponent(page) +
          '&tabs=timeline&width=400&height=620&small_header=true' +
          '&adapt_container_width=true&hide_cover=false&show_facepile=false';
        var frame = document.createElement('iframe');
        frame.className = 'social-frame';
        frame.src = src;
        frame.width = '100%';
        frame.height = '620';
        frame.style.height = '620px';
        frame.title = 'Caddy Ed on Facebook';
        frame.loading = 'lazy';
        frame.setAttribute('scrolling', 'no');
        frame.setAttribute('frameborder', '0');
        frame.setAttribute('allow', 'encrypted-media');
        host.appendChild(frame);
      },
    },

    x: {
      script: 'https://platform.twitter.com/widgets.js',
      render: function (host) {
        var handle = (window.CADDY_CONNECT && window.CADDY_CONNECT.xHandle) || '';
        if (!handle || handle === '@') {
          host.innerHTML = '<p class="social-fallback__note">No X account is ' +
            'configured for this site yet.</p>';
          return;
        }
        var anchor = document.createElement('a');
        anchor.className = 'twitter-timeline';
        anchor.setAttribute('data-height', '620');
        anchor.setAttribute('data-dnt', 'true');
        anchor.href = 'https://twitter.com/' + handle.replace(/^@/, '');
        anchor.textContent = 'Posts by ' + handle;
        host.appendChild(anchor);
        // widgets.js is what turns that anchor into a timeline. If it has not
        // loaded yet, load it now and re-render.
        if (window.twttr && window.twttr.widgets) {
          window.twttr.widgets.load(anchor.parentNode);
        } else {
          loadScript(PLATFORMS.x.script, function () {
            var host2 = document.getElementById('panelX');
            if (host2 && window.twttr && window.twttr.widgets) {
              window.twttr.widgets.load(host2);
            }
          });
        }
      },
    },

    /* Instagram has no profile-timeline embed: its own embed script renders a
       single post and nothing else. So this panel does not pretend to load a
       feed. It says what Instagram cannot do and links to the profile, which
       is the part that actually helps. */
    instagram: {
      script: null,
      render: function (host) {
        var url = (window.CADDY_CONNECT && window.CADDY_CONNECT.instagramUrl) || '';
        var handle = (window.CADDY_CONNECT && window.CADDY_CONNECT.instagramHandle) || '';
        if (!url) {
          host.innerHTML = '<p class="social-load__note">No Instagram profile is ' +
            'configured for this site yet.</p>';
          return;
        }
        host.innerHTML =
          '<p class="social-load__note">Instagram does not offer an embed for a ' +
          'whole profile, so this panel links straight to it &mdash; nothing ' +
          'third-party loads here.</p>' +
          '<p class="social-load__actions"><a class="btn btn-outline btn-sm" href="' + esc(url) +
          '" target="_blank" rel="noopener">Open ' + esc(handle || 'the profile') +
          ' on Instagram</a></p>';
      },
    },
  };

  function loadScript(src, done) {
    if (loaded[src]) {
      if (done) done();
      return;
    }
    loaded[src] = true;
    var s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = function () { if (done) done(); };
    s.onerror = function () {
      loaded[src] = false;
      var n = document.createElement('p');
      n.className = 'social-fallback__note';
      n.textContent = 'That feed could not be loaded. The links below go straight to it.';
      document.getElementById('social-feed-host')?.appendChild(n);
    };
    document.head.appendChild(s);
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** data-social="facebook" -> #panelFacebook. No hard-coded pairs. */
  function panelFor(kind) {
    return document.getElementById('panel' + kind.charAt(0).toUpperCase() + kind.slice(1));
  }

  function labelFor(kind) {
    return { facebook: 'Facebook', x: 'X', instagram: 'Instagram' }[kind] || kind;
  }

  /** Where a network lives, from the config the template printed. */
  function platformUrl(kind) {
    var c = window.CADDY_CONNECT || {};
    if (kind === 'facebook') return c.facebookPageUrl || '';
    if (kind === 'x') return c.xHandle ? 'https://twitter.com/' + String(c.xHandle).replace(/^@/, '') : '';
    if (kind === 'instagram') return c.instagramUrl || '';
    return '';
  }

  /**
   * The offer to load a feed.
   *
   * The panel used to hide its own explanation the moment the page loaded and
   * put nothing in its place, so under the tabs sat an empty box -- which is
   * what a visitor reads as broken, because it was. This is what goes there
   * instead: what loading costs, a button that does it, and a link that leaves
   * for the network without loading anything at all.
   */
  function offerLoad(kind) {
    var host = panelFor(kind);
    if (!host) return;
    var label = labelFor(kind);
    var url = platformUrl(kind);
    host.innerHTML =
      '<p class="social-load__note">Loading the feed brings ' + esc(label) +
      '&rsquo;s own script onto this page. It loads only when you ask.</p>' +
      '<p class="social-load__actions">' +
        '<button type="button" class="btn btn-outline btn-sm" data-social-load="' + esc(kind) + '">' +
          'Load the ' + esc(label) + ' feed</button>' +
        (url ? '<a class="btn btn-ghost btn-sm" href="' + esc(url) + '" target="_blank" rel="noopener">' +
               'Open ' + esc(label) + ' instead</a>' : '') +
      '</p>';
  }

  /** Show one network: tab states, the right panel, and that panel filled. */
  function activate(kind) {
    document.querySelectorAll('[data-social]').forEach(function (tab) {
      var on = tab.getAttribute('data-social') === kind;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.social-body .tabpanel').forEach(function (p) {
      p.hidden = p !== panelFor(kind);
    });
    // Instagram has nothing third-party to load, so its panel is its content.
    if (kind === 'instagram') select(kind);
    else offerLoad(kind);
  }

  function select(kind) {
    var platform = PLATFORMS[kind];
    if (!platform) return;
    var host = panelFor(kind);
    if (!host) return;
    host.hidden = false;
    host.innerHTML = '';
    if (platform.script) loadScript(platform.script);
    platform.render(host);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var host = document.getElementById('social-feed-host');
    if (!host) return;

    var tabs = Array.prototype.slice.call(document.querySelectorAll('[data-social]'));

    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { activate(tab.getAttribute('data-social')); });
      // A tablist is one stop in the tab order; the arrow keys move inside it,
      // which is what a screen-reader user will try first.
      tab.addEventListener('keydown', function (e) {
        var dir = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (dir === undefined && e.key !== 'Home' && e.key !== 'End') return;
        e.preventDefault();
        var next = e.key === 'Home' ? 0
          : e.key === 'End' ? tabs.length - 1
          : (i + dir + tabs.length) % tabs.length;
        tabs[next].focus();
        activate(tabs[next].getAttribute('data-social'));
      });
    });

    // The load button inside a panel.
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('[data-social-load]');
      if (btn) select(btn.getAttribute('data-social-load'));
    });

    // Never an empty box: fill the panel for the first configured network.
    var first = host.getAttribute('data-social-default') ||
      (tabs[0] ? tabs[0].getAttribute('data-social') : '') || '';
    if (first) activate(first);
  });
})();
