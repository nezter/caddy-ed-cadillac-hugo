/**
 * seo-score.js -- the on-page SEO scorer, as a pure function.
 *
 * WHY THIS SHAPE
 * ---------------
 * The scorer takes an HTML string and returns findings; it fetches nothing,
 * imports nothing and touches no database, so it can be unit-tested against
 * fixtures without a server, and netlify/functions/seo-score.js is only the
 * transport around it. The admin page and an LLM agent get the SAME answer
 * for the same page because there is only one implementation.
 *
 * WHAT IT SCORES (weights in CHECKS below)
 * ----------------------------------------
 * The things that are deterministic from the served HTML: title length,
 * meta description length, a single H1, heading structure, canonical, Open
 * Graph tags, image alt coverage, internal links, valid JSON-LD, and the
 * schema type the page should carry for its section (AutoDealer, Car,
 * Article).
 *
 * LOCAL SIGNALS, HONESTLY LABELLED: the city checks look at the page's main
 * content (header/footer stripped) for Charlotte / Pineville / South
 * Charlotte. That is not a ranking guarantee -- nobody can score Google --
 * it is the on-page part of local intent, and the advice text says so.
 *
 * A score is 0-100, passed weight over applicable weight. Checks that do
 * not apply to a section (word count on a contact page) are omitted, not
 * failed -- an inapplicable check that fails is a lie about the page.
 */

'use strict';

/* --------------------------------------------------------------- parse -- */

function attrValue(tag, name) {
  const re = new RegExp('\\b' + name + '\\s*=\\s*("[^"]*"|\'[^\']*\'|[^\\s>]+)', 'i');
  const m = tag.match(re);
  if (!m) return null;
  return m[1].replace(/^["']|["']$/g, '');
}

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&middot;/g, '.').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Main content only: header/nav/footer stripped, so local checks are about
 *  what the page SAYS, not what the chrome repeats on every page. */
function mainTextOf(html) {
  let s = html;
  s = s.replace(/<header[\s\S]*?<\/header>/gi, ' ');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  return textOf(s);
}

function countMatches(text, re) {
  const m = text.match(re);
  return m ? m.length : 0;
}

/* --------------------------------------------------------------- score -- */

function sectionOf(path) {
  const p = String(path || '/');
  if (p === '/' || p === '') return 'home';
  if (p.startsWith('/inventory')) return 'inventory';
  if (p.startsWith('/articles')) return 'articles';
  return 'other';
}

const CITY_RE = /charlotte|pineville/gi;
const PHONE_RE = /803[-.\s]?431[-.\s]?6180|tel:\+?18034316180/i;

function scoreHtml(html, opts) {
  const options = opts || {};
  const path = options.path || '/';
  const section = options.section || sectionOf(path);
  const doc = String(html || '');
  const text = textOf(doc);
  const main = mainTextOf(doc);

  /* --- extraction --- */
  const titleMatch = doc.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? textOf(titleMatch[1]) : '';
  const metas = doc.match(/<meta\s[^>]*>/gi) || [];
  let description = '';
  let ogTitle = false, ogDesc = false, ogImage = false;
  for (const tag of metas) {
    const name = (attrValue(tag, 'name') || '').toLowerCase();
    const prop = (attrValue(tag, 'property') || '').toLowerCase();
    const content = attrValue(tag, 'content') || '';
    if (name === 'description' && !description) description = content;
    if (prop === 'og:title' && content) ogTitle = true;
    if (prop === 'og:description' && content) ogDesc = true;
    if (prop === 'og:image' && content) ogImage = true;
  }
  const canonicalTag = (doc.match(/<link\s[^>]*rel\s*=\s*["']?canonical[^>]*>/i) || [])[0] || '';
  const canonical = canonicalTag ? attrValue(canonicalTag, 'href') : null;
  const h1s = doc.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || [];
  const h2s = doc.match(/<h2\b[^>]*>[\s\S]*?<\/h2>/gi) || [];
  const anchors = doc.match(/<a\b[^>]*>/gi) || [];
  let internalLinks = 0;
  for (const a of anchors) {
    const href = attrValue(a, 'href');
    if (!href) continue;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
    if (href.startsWith('/') && !href.startsWith('//')) internalLinks += 1;
  }
  const imgs = doc.match(/<img\b[^>]*>/gi) || [];
  const imgsWithAlt = imgs.filter((t) => /\balt\s*=/.test(t)).length;
  const ldBlocks = [];
  const ldRe = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  let ldParseFail = false;
  while ((ldMatch = ldRe.exec(doc))) {
    try {
      ldBlocks.push(JSON.parse(ldMatch[1]));
    } catch (e) {
      ldParseFail = true;
    }
  }
  const schemaTypes = [];
  const collectTypes = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(collectTypes); return; }
    if (typeof node['@type'] === 'string') schemaTypes.push(node['@type']);
    else if (Array.isArray(node['@type'])) node['@type'].forEach((t) => schemaTypes.push(t));
    if (node['@graph']) collectTypes(node['@graph']);
  };
  ldBlocks.forEach(collectTypes);

  const words = main ? main.split(/\s+/).filter(Boolean).length : 0;
  const cityMentions = countMatches(main, CITY_RE);
  const hasPhone = PHONE_RE.test(main) || PHONE_RE.test(doc);

  /* --- checks --- */
  const checks = [];
  const add = (id, label, pass, weight, advice) => checks.push({ id, label, pass: Boolean(pass), weight, advice: advice || '' });

  add('title.present', 'Title tag exists', Boolean(title.trim()), 10, 'Add a <title> — it is the single strongest on-page element.');
  if (title) {
    add('title.length', 'Title is 15-65 characters', title.length >= 15 && title.length <= 65, 6,
      title.length < 15 ? 'Title is short (' + title.length + ' chars); aim for 15-65.' : 'Title is long (' + title.length + ' chars); aim for 15-65 so it is not truncated in results.');
  }
  add('description.present', 'Meta description exists', Boolean(description.trim()), 8, 'Add a meta description — it is the pitch line in search results.');
  if (description) {
    add('description.length', 'Description is 70-160 characters', description.length >= 70 && description.length <= 160, 6,
      description.length < 70 ? 'Description is short (' + description.length + ' chars); 70-160 reads better.' : 'Description is long (' + description.length + ' chars); 70-160 avoids truncation.');
  }
  add('h1.single', 'Exactly one H1', h1s.length === 1, 10, h1s.length ? 'There are ' + h1s.length + ' H1s; one H1 per page is the structure search expects.' : 'Add an H1 — the page main heading.');
  if (section === 'articles' || section === 'other') {
    add('headings.structure', 'At least two H2 sections', h2s.length >= 2, 4, 'Break the page into H2 sections — it helps readers and crawlers equally.');
  }
  add('canonical.present', 'Canonical link present', Boolean(canonical), 6, 'Add <link rel=canonical> so the page cannot be split across URLs.');
  add('og.tags', 'Open Graph title, description and image', ogTitle && ogDesc && ogImage, 6, 'Complete the og: tags — they are the shared card on every platform.');
  if (imgs.length) {
    const covered = imgsWithAlt / imgs.length;
    add('images.alt', 'Images carry alt text (>= 90%)', covered >= 0.9, 8, imgsWithAlt + ' of ' + imgs.length + ' images have alt attributes; add the rest.');
  }
  add('links.internal', 'At least three internal links', internalLinks >= 3, 8, 'Link out to at least three of our own pages — inventory, financing, contact — so the page is part of the site, not an island.');
  add('schema.parses', 'Structured data parses', !ldParseFail, 6, 'A JSON-LD block is invalid JSON — search tools will ignore it.');
  if (section === 'home' || section === 'other') {
    add('schema.autodealer', 'AutoDealer structured data present', schemaTypes.includes('AutoDealer'), 6, 'Add the AutoDealer JSON-LD block (name, address, phone, hours).');
  }
  if (section === 'inventory') {
    add('schema.car', 'Car structured data present', schemaTypes.includes('Car'), 8, 'Vehicle pages should carry Car/Offer JSON-LD.');
    add('title.model', 'Model named in the title', /cadillac|escalade|lyriq|celestiq|optiq|vistiq|xt[456]|ct[456]/i.test(title), 6, 'Put the model in the title — it is what people search.');
  }
  if (section === 'articles') {
    add('schema.article', 'Article structured data present', schemaTypes.includes('Article') || schemaTypes.includes('BlogPosting'), 8, 'Articles should carry Article JSON-LD (headline, date, author).');
    add('words.longform', 'Long-form (300+ words)', words >= 300, 8, 'This piece is ' + words + ' words; 300+ gives it something to rank for.');
  }
  if (section === 'home' || section === 'other' || section === 'articles') {
    add('local.city', 'Service area named in the content', cityMentions >= 1, 6, 'Name the area (Charlotte / Pineville / South Charlotte) in the copy — the on-page half of local intent.');
    add('local.phone', 'A contact route on the page', hasPhone, 4, 'Put a phone number or tel: link on the page so a local searcher can act.');
  }

  const applicable = checks.filter((c) => c.weight > 0);
  const total = applicable.reduce((n, c) => n + c.weight, 0);
  const won = applicable.reduce((n, c) => n + (c.pass ? c.weight : 0), 0);
  const score = total ? Math.round((won / total) * 100) : 0;

  return {
    path,
    section,
    score,
    checks,
    stats: {
      title, titleLength: title.length,
      descriptionLength: description.length,
      h1Count: h1s.length, h2Count: h2s.length,
      words, internalLinks,
      images: imgs.length, imagesWithAlt: imgsWithAlt,
      schemaTypes: Array.from(new Set(schemaTypes)),
      canonical: canonical || '',
      cityMentions,
      hasPhone,
    },
  };
}

module.exports = { scoreHtml, sectionOf, textOf, mainTextOf, attrValue };
