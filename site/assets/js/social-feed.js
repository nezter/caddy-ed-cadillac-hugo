/**
 * social-feed.js -- load the Facebook and X embeds only when asked.
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

  function select(tab) {
    var kind = tab.getAttribute('data-social') || 'facebook';
    var platform = PLATFORMS[kind];
    if (!platform) return;

    var host = document.getElementById(kind === 'facebook' ? 'panelFacebook' : 'panelX');
    if (!host) return;

    host.innerHTML = '';
    if (platform.script) loadScript(platform.script);
    platform.render(host);
  }

  document.addEventListener('DOMContentLoaded', function () {
    var host = document.getElementById('social-feed-host');
    if (!host) return;

    // The prompt. Hidden the moment a tab is chosen.
    var prompt = host.querySelector('[data-social-prompt]');
    if (prompt) prompt.hidden = true;

    document.querySelectorAll('[data-social]').forEach(function (tab) {
      tab.addEventListener('click', function () {
        if (prompt) prompt.hidden = true;
        select(tab);
      });
    });
  });
})();
