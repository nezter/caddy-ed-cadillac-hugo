/*
 * sw-register.js -- service worker registration and the PWA install prompt.
 *
 * WHY THIS FILE USED TO THROW ON EVERY PAGE
 * -----------------------------------------
 * It began with:
 *
 *     export function registerSW() { ... }
 *
 * and baseof.html loads it as a plain classic script:
 *
 *     <script src="/sw-register.js" defer></script>
 *
 * An `export` at the top level of a file loaded that way is a SyntaxError, and
 * because a parse error kills the whole file, none of the rest of it ran either.
 * Confirmed in a real browser on 2026-09-27, on every page:
 *
 *     SyntaxError: export declarations may only appear at top level of a module
 *
 * So the service worker never registered and the install-prompt handler was
 * never attached. Both had been dead for the life of the file.
 *
 * Two ways to fix it were available: add type="module" to the script tag, or
 * drop the export. The export is dropped because nothing imports this file --
 * it is served from static/ and referenced by URL, so it is not part of any
 * module graph, and `registerSW` had exactly zero callers even when it parsed.
 * An export nothing imports is a file that only works in the one context that
 * cannot load it.
 *
 * The registration is now invoked at the end of the file, which is what the
 * original author clearly intended: a script named "sw-register" that registers
 * nothing is a script that does not do its job.
 *
 * NOTE: this file is served verbatim from static/ and is NOT bundled, minified
 * or fingerprinted, so it must stay valid, classic, self-contained JavaScript.
 * No imports, no exports.
 */

(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker
        .register('/sw.js')
        .then(function (registration) {
          // Left on console.log rather than console.error on purpose: a
          // successful registration is not news, and a failed one -- which is
          // what a browser in private mode, or over plain http to a non-localhost
          // origin, will do -- is already reported by the catch below.
          console.log('Service worker registered, scope:', registration.scope);
        })
        .catch(function (error) {
          // Expected and harmless in private browsing and on http:// origins.
          // Logged at debug level so it does not read as a site fault.
          console.debug('Service worker registration skipped:', error && error.message);
        });
    });
  }

  // --- PWA install prompt ----------------------------------------------------
  let deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function (e) {
    // Chrome 67+ would otherwise show its own mini-infobar.
    e.preventDefault();
    deferredPrompt = e;

    document.querySelectorAll('.install-app-button').forEach(function (button) {
      button.style.display = 'block';
      button.addEventListener('click', installApp);
    });
  });

  function installApp() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();

    deferredPrompt.userChoice.then(function (choice) {
      console.log(
        choice.outcome === 'accepted'
          ? 'App installed'
          : 'Install dismissed by the user'
      );
      // The prompt can only be used once.
      deferredPrompt = null;
      document.querySelectorAll('.install-app-button').forEach(function (button) {
        button.style.display = 'none';
      });
    });
  }
})();
