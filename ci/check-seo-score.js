#!/usr/bin/env node
/**
 * check-seo-score.js -- the scorer says what it means, on fixtures.
 *
 * WHY THIS EXISTS
 * ---------------
 * An SEO score is advice someone acts on. Two ways it can lie: a page that
 * has everything scores low (applicable checks misapplied), or a page
 * missing things scores high (checks not actually running). Both are
 * proven against hand-built fixtures here -- deterministically, no network.
 *
 * Run:  node ci/check-seo-score.js
 */

'use strict';

const path = require('path');
const { scoreHtml, sectionOf } = require(path.join(path.resolve(__dirname, '..'), 'netlify', 'functions', 'utils', 'seo-score.js'));

const results = [];
const check = (label, pass, detail) =>
  results.push({ label, pass: Boolean(pass), detail: detail === undefined ? '' : String(detail) });

const goodArticle = '<!doctype html><html><head>' +
  '<title>How Cadillac financing works in Charlotte | Caddy Ed</title>' +
  '<meta name="description" content="A practical walk through Cadillac financing in Charlotte and Pineville: terms, payments and what to bring to the dealership.">' +
  '<link rel="canonical" href="https://caddyed.com/articles/cadillac-financing/">' +
  '<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="i">' +
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Article","headline":"h"}<\/script>' +
  '</head><body><header>nav nav nav</header><main>' +
  '<h1>How Cadillac financing works</h1>' +
  '<h2>Terms</h2><p>' + 'word '.repeat(320) + '</p>' +
  '<h2>Payments</h2><p>Ask Ed in Charlotte or Pineville.</p>' +
  '<img src="a.jpg" alt="a car"><img src="b.jpg" alt="another car">' +
  '<a href="/inventory/">inventory</a><a href="/contact/">contact</a><a href="/financing/">financing</a><a href="https://example.com">out</a>' +
  '<a href="tel:+18034316180">call</a>' +
  '</main><footer>10725 Pineville Rd</footer></body></html>';

const badPage = '<!doctype html><html><head><title>x</title></head><body><p>thin page</p></body></html>';

const inventoryPage = '<!doctype html><html><head>' +
  '<title>2026 Cadillac XT5 Luxury in Pineville | Caddy Ed</title>' +
  '<meta name="description" content="2026 Cadillac XT5 Luxury with mileage, photos and the real asking price at Caddy Ed in Pineville, near Charlotte.">' +
  '<link rel="canonical" href="https://caddyed.com/inventory/x/">' +
  '<meta property="og:title" content="t"><meta property="og:description" content="d"><meta property="og:image" content="i">' +
  '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Car","name":"XT5"}<\/script>' +
  '</head><body><header>nav</header><main><h1>2026 Cadillac XT5 Luxury</h1>' +
  '<img src="a.jpg" alt="car"><img src="b.jpg" alt="car">' +
  '<a href="/inventory/">a</a><a href="/contact/">b</a><a href="/financing/">c</a>' +
  '</main><footer>x</footer></body></html>';

(async () => {
  const s1 = scoreHtml(goodArticle, { path: '/articles/cadillac-financing/' });
  check('good article scores high', s1.score >= 85, 'score ' + s1.score);
  const failed1 = s1.checks.filter((c) => !c.pass).map((c) => c.id);
  check('good article fails nothing', failed1.length === 0, failed1.join(','));
  check('article check set (no word fail)', s1.checks.some((c) => c.id === 'words.longform' && c.pass));
  check('city counted from MAIN text, header stripped', s1.stats.cityMentions >= 2, s1.stats.cityMentions);
  check('external link not counted as internal', s1.stats.internalLinks === 3, s1.stats.internalLinks);

  const s2 = scoreHtml(badPage, { path: '/somewhere/' });
  check('bad page scores low', s2.score <= 40, 'score ' + s2.score);
  const failed2 = s2.checks.filter((c) => !c.pass).map((c) => c.id);
  for (const id of ['title.length', 'description.present', 'canonical.present', 'links.internal', 'schema.autodealer']) {
    check('bad page fails ' + id, failed2.includes(id), failed2.join(','));
  }

  const s3 = scoreHtml(inventoryPage, { path: '/inventory/x/' });
  check('inventory page gets Car + model checks', s3.checks.some((c) => c.id === 'schema.car' && c.pass) && s3.checks.some((c) => c.id === 'title.model' && c.pass));
  check('inventory page does NOT get article checks', !s3.checks.some((c) => c.id.startsWith('words.')));
  check('inventory page does NOT get city check (chrome would fake it)', !s3.checks.some((c) => c.id === 'local.city'));

  const noSchemaCity = goodArticle.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '<script type="application/ld+json">{broken<\/script>');
  const s4 = scoreHtml(noSchemaCity, { path: '/articles/x/' });
  check('invalid JSON-LD fails parsing', s4.checks.some((c) => c.id === 'schema.parses' && !c.pass));
  check('missing Article schema fails its check', s4.checks.some((c) => c.id === 'schema.article' && !c.pass));

  const noCity = goodArticle.replace(/Charlotte/g, 'Metro').replace(/Pineville/g, 'Metro').replace(/charlotte/gi, 'Metro');
  const s5 = scoreHtml(noCity, { path: '/articles/x/' });
  check('cityless article fails local.city with advice', s5.checks.some((c) => c.id === 'local.city' && !c.pass && /Charlotte/.test(c.advice)));

  check('sectionOf routes correctly', sectionOf('/') === 'home' && sectionOf('/inventory/x/') === 'inventory' && sectionOf('/articles/') === 'articles' && sectionOf('/about/') === 'other');
  check('alt coverage counted', s2.stats.images === 0 || s2.stats.imagesWithAlt <= s2.stats.images, JSON.stringify(s2.stats));

  const failed = results.filter((x) => !x.pass);
  for (const x of results) console.log('  ' + (x.pass ? 'ok  ' : 'FAIL') + '  ' + x.label + (x.pass ? '' : '  -- ' + x.detail));
  console.log('\n  ' + (results.length - failed.length) + '/' + results.length + (failed.length ? ' -- FAILURES' : ' ok'));
  process.exit(failed.length ? 1 : 0);
})();
