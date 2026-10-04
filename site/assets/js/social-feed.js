/**
 * social-feed.js -- the "What Ed is posting" panel controller.
 *
 * Cache-based, first-party, quiet. The panels arrive from the server already
 * holding their follow card -- a line of text and a link -- so there is
 * never an empty box and never a script tag pointed at a platform. This file
 * adds one thing on top: it asks the site's own cached endpoint
 * (CADDY_CONNECT.socialEndpoint) for recent posts, and if any are available
 * it swaps the matching panels to post cards. If not -- endpoint not
 * deployed, static preview, offline, empty cache -- the follow cards simply
 * stay. Nothing here is ever rendered as an error.
 *
 * No third-party code loads from this file, at any point, for any reason.
 * The Facebook page-plugin iframe and the Twitter widgets script that once
 * lived here cost two CSP origins and logged 43 console errors per home page
 * load for visitors with no platform session; they are gone, and the CSP no
 * longer names those origins. Post cards are text-only on purpose: platform
 * CDN images would buy back an external origin and weigh more than they add,
 * so the card links out for the picture.
 *
 * The endpoint is refreshed at most once a day (see netlify/functions/
 * social-feed.js); this file only ever reads whatever copy the CDN holds.
 */
(function () {
  'use strict';

  var NETWORKS = ['facebook', 'x', 'instagram'];
  var activeKind = '';

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** data-social="facebook" -> #panelFacebook. No hard-coded pairs. */
  function panelFor(kind) {
    return document.getElementById('panel' + kind.charAt(0).toUpperCase() + kind.slice(1));
  }

  /** Show one network: tab states and the right panel. Content is already
      there (follow card or cards); this only toggles visibility. */
  function activate(kind) {
    activeKind = kind;
    document.querySelectorAll('[data-social]').forEach(function (tab) {
      var on = tab.getAttribute('data-social') === kind;
      tab.setAttribute('aria-selected', on ? 'true' : 'false');
      tab.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll('.social-body .tabpanel').forEach(function (p) {
      p.hidden = p !== panelFor(kind);
    });
  }


  /** Hide tabs for networks the site is not connected to (the endpoint knows;
      the admin page is where accounts get connected). A lone network is not a
      choice, so the tablist retires when only one remains. */
  function adaptTabs(config) {
    if (!config) return;
    var visible = [];
    NETWORKS.forEach(function (kind) {
      var conf = config[kind];
      var tab = document.querySelector('[data-social="' + kind + '"]');
      var panel = panelFor(kind);
      if (conf && conf.configured === false) {
        if (tab) tab.hidden = true;
        if (panel) panel.hidden = true;
      } else if (tab) {
        visible.push(kind);
      }
    });
    var list = document.querySelector('.tabs[role="tablist"]');
    if (list && visible.length <= 1) list.hidden = true;
    if (visible.length && visible.indexOf(activeKind) === -1) activate(visible[0]);
  }
  /* ------------------------------------------------- cached posts -------- */

  function postCard(kind, p) {
    var stats = p.stats || {};
    var s1, s2;
    if (kind === 'x') {
      s1 = (stats.reposts || 0) + ' reposts';
      s2 = (stats.likes || 0) + ' likes';
    } else {
      s1 = (stats.likes || 0) + ' likes';
      s2 = (stats.comments || 0) + ' comments';
    }
    var time = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '';
    return '<article class="social-post">' +
      '<div class="post-head">' +
        '<span class="post-avatar" aria-hidden="true">CE</span>' +
        '<span class="post-id"><span class="post-name">Caddy Ed</span>' +
        '<span class="post-time">' + esc(time) + '</span></span>' +
      '</div>' +
      '<p class="post-body">' + esc(p.text || '') + '</p>' +
      '<div class="post-actions"><span>' + esc(s1) + '</span><span>' + esc(s2) + '</span>' +
        (p.url ? '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" style="margin-left:auto">View post</a>' : '') +
      '</div>' +
    '</article>';
  }

  function renderPosts(kind, posts) {
    var host = panelFor(kind);
    if (!host || !posts || !posts.length) return false;
    host.innerHTML = '<div class="social-posts">' +
      posts.map(function (p) { return postCard(kind, p); }).join('') +
      '</div>';
    return true;
  }

  /** One read of the site's own cached endpoint. Never polls, never retries. */
  function loadCachedFeed() {
    var c = window.CADDY_CONNECT || {};
    if (!c.socialEndpoint || !window.fetch) return;
    fetch(c.socialEndpoint, { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; })
      .then(function (data) {
        if (!data || data.ok === false) return;
        adaptTabs(data.config || null);
        NETWORKS.forEach(function (kind) {
          if (data[kind] && data[kind].posts && data[kind].posts.length) {
            renderPosts(kind, data[kind].posts);
          }
        });
      });
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

    var first = host.getAttribute('data-social-default') ||
      (tabs[0] ? tabs[0].getAttribute('data-social') : '') || '';
    if (first) activate(first);

    loadCachedFeed();
  });
})();
