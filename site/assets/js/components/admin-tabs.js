/*
 * admin-tabs -- one tab implementation for admin pages.
 *
 * The markup contract (used by /admin/followup-campaigns):
 *
 *   <div class="admin-tabs" role="tablist">
 *     <button class="tab-button" data-tab="campaigns" aria-controls="campaigns-tab"
 *             role="tab" aria-selected="true">Campaign Manager</button>
 *   </div>
 *   <div id="campaigns-tab" class="tab-content active" role="tabpanel">
 *
 * A button names its panel with aria-controls. The data-tab value is the
 * short name used for the state; the real element id may differ from it
 * (campaigns -> campaigns-tab on this page), so the panel is resolved
 * aria-controls first, then the value itself, then value + '-tab'. Getting
 * this wrong is exactly why the first version of this file toggled the
 * buttons but not the panels.
 *
 * This replaces the hand-rolled tab script the follow-up page used to carry.
 * That script also tried to construct the two components by bare class name,
 * which cannot work once the bundler wraps each entry as an IIFE -- it threw
 * ReferenceError on every click, so the tabs never switched and the loading
 * spinners never left. Tab switching is independent of the components, so it
 * lives here, and the components mount themselves.
 *
 * Keyboard: left/right arrows move between tabs, as role="tablist" promises.
 */
(function () {
  'use strict';

  function panelFor(button) {
    var id = button.getAttribute('aria-controls') || button.getAttribute('data-tab');
    return document.getElementById(id) || document.getElementById(id + '-tab');
  }

  function init(root) {
    var buttons = root.querySelectorAll('.tab-button[data-tab]');
    if (!buttons.length) return;
    var list = Array.prototype.slice.call(buttons);

    function activate(active) {
      var panel = panelFor(active);
      list.forEach(function (b) {
        var on = b === active;
        b.classList.toggle('active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      document.querySelectorAll('.tab-content').forEach(function (p) {
        p.classList.toggle('active', p === panel);
      });
    }

    list.forEach(function (b) {
      b.addEventListener('click', function () { activate(b); });
      b.addEventListener('keydown', function (e) {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        var i = list.indexOf(b);
        var next = e.key === 'ArrowRight' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
        list[next].focus();
        activate(list[next]);
      });
    });
  }

  function boot() {
    document.querySelectorAll('.admin-tabs').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { init, boot, panelFor };
  }
})();
