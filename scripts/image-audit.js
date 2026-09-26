#!/usr/bin/env node
/**
 * image-audit.js -- per-page-view image weight, before vs after.
 *
 * Method (matches docs/images.md: count the bytes a browser actually fetches
 * for ONE page view, not the sum of every file in the publish dir):
 *
 *   1. parse every <img>/<source> in the page
 *   2. for each, pick the candidate the browser WOULD choose, given the
 *      viewport width, the sizes attribute and the device pixel ratio
 *   3. prefer AVIF > WebP > JPEG when the browser supports it (it does)
 *   4. sum the real on-disk byte sizes of the chosen files
 *
 * Usage: node scripts/image-audit.js <publicDir> [moreDirs...]
 */
const fs = require('fs');
const path = require('path');

const VIEWPORTS = [
  { name: 'mobile  390x844 dpr3', css: 390, dpr: 3 },
  { name: 'laptop 1440x900 dpr2', css: 1440, dpr: 2 },
];

function attr(tag, name) {
  const m = tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*"([^"]*)"`, 'i')) ||
            tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*'([^']*)'`, 'i')) ||
            tag.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*([^\\s>]+)`, 'i'));
  return m ? m[1] : null;
}

function parseSrcset(v) {
  return v.split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
    const [url, w] = p.split(/\s+/);
    return { url, w: w ? parseInt(w, 10) : null, dpr: w && w.endsWith('x') ? parseFloat(w) : null };
  });
}

/** Evaluate a sizes attribute to a CSS pixel width for a given viewport. */
function evalSizes(sizes, cssWidth) {
  if (!sizes) return cssWidth;
  // Handle the "(max-width: A) B, C" form used throughout this project.
  const parts = sizes.split(',').map((s) => s.trim());
  let last = null;
  for (const part of parts) {
    const m = part.match(/^\(\s*max-width:\s*([\d.]+)(px|rem|em)\s*\)\s*([\d.]+)(px|rem|em|vw|%)?$/);
    if (m) {
      const bp = m[2] === 'px' ? parseFloat(m[1]) : parseFloat(m[1]) * 16;
      if (cssWidth <= bp) return parseFloat(m[3]) * (m[4] === 'rem' || m[4] === 'em' ? 16 : 1);
      last = parseFloat(m[3]);
      continue;
    }
    last = part;
  }
  if (last == null) return cssWidth;
  if (last.endsWith('vw')) return (parseFloat(last) / 100) * cssWidth;
  if (last.endsWith('%')) return (parseFloat(last) / 100) * cssWidth;
  if (last.endsWith('rem') || last.endsWith('em')) return parseFloat(last) * 16;
  const n = parseFloat(last);
  return Number.isFinite(n) ? n : cssWidth;
}

function auditPage(file, publicDir, cssWidth, dpr) {
  const html = fs.readFileSync(file, 'utf8');
  let total = 0;
  const detail = [];

  for (const m of html.matchAll(/<(picture|img|source)\b[^>]*>/gi)) {
    const tag = m[0];
    const kind = m[1].toLowerCase();
    if (kind === 'picture') continue;

    // A <source> is only used if its media/type matches. Assume AVIF-capable.
    const type = attr(tag, 'type');
    if (kind === 'source') {
      if (type && !/avif|webp|jpe?g|png/.test(type)) continue;
    }
    const srcset = attr(tag, 'srcset');
    const src = attr(tag, 'src');
    if (!srcset && !src) continue;

    const cands = srcset ? parseSrcset(srcset) : [{ url: src, w: null, dpr: null }];
    const wDesc = cands.filter((c) => c.w);
    const sizes = attr(tag, 'sizes');
    const cssBox = evalSizes(sizes, cssWidth);

    let chosen = null;
    if (wDesc.length) {
      const need = Math.round(cssBox * dpr);
      const atLeast = wDesc.filter((c) => c.w >= need).sort((a, b) => a.w - b.w);
      chosen = atLeast.length ? atLeast[0]
        : wDesc.slice().sort((a, b) => b.w - a.w)[0];
    } else if (src) {
      chosen = { url: src };
    }
    if (!chosen) continue;

    const p = path.join(publicDir, chosen.url.replace(/[?#].*$/, '').replace(/^\//, ''));
    let bytes = 0;
    if (fs.existsSync(p)) bytes = fs.statSync(p).size;
    total += bytes;
    detail.push({ url: chosen.url, bytes, type: type || 'img' });
  }
  return { total, detail };
}

/** Prefer the AVIF <source> over the <img> srcset when both are present. */
function auditPagePictureAware(file, publicDir, cssWidth, dpr) {
  const html = fs.readFileSync(file, 'utf8');
  const pics = [...html.matchAll(/<picture\b[^>]*>([\s\S]*?)<\/picture>/gi)];
  // Blank out the picture regions so their inner <img>/<source> are not counted
  // a second time by the generic pass, then run the generic pass on the rest.
  let rest = html;
  for (const p of pics) rest = rest.replace(p[0], '<!--picture-->');

  // In each picture the browser takes the first <source> whose type it supports.
  let total = 0;
  const detail = [];
  for (const p of pics) {
    const inner = p[1];
    const sources = [...inner.matchAll(/<source\b[^>]*>/gi)].map((s) => s[0]);
    const imgTag = (inner.match(/<img\b[^>]*>/i) || [])[0];
    // AVIF-capable browser: first image source wins.
    const usable = sources.find((s) => /avif/i.test(attr(s, 'type') || '')) ||
                   sources.find((s) => /webp/i.test(attr(s, 'type') || '')) ||
                   imgTag;
    if (!usable) continue;
    const srcset = attr(usable, 'srcset');
    const src = attr(usable, 'src');
    if (!srcset && !src) continue;
    const cands = srcset ? parseSrcset(srcset) : [{ url: src, w: null }];
    const wDesc = cands.filter((c) => c.w);
    let chosen = null;
    if (wDesc.length) {
      const need = Math.round(evalSizes(attr(usable, 'sizes'), cssWidth) * dpr);
      const atLeast = wDesc.filter((c) => c.w >= need).sort((a, b) => a.w - b.w);
      chosen = atLeast.length ? atLeast[0] : wDesc.slice().sort((a, b) => b.w - a.w)[0];
    } else if (src) chosen = { url: src };
    if (!chosen) continue;
    const fp = path.join(publicDir, chosen.url.replace(/[?#].*$/, '').replace(/^\//, ''));
    const bytes = fs.existsSync(fp) ? fs.statSync(fp).size : 0;
    total += bytes;
    detail.push({ url: chosen.url, bytes, type: attr(usable, 'type') || 'img' });
  }

  const generic = auditPageFrom(rest, publicDir, cssWidth, dpr);
  return { total: total + generic.total, detail: detail.concat(generic.detail) };
}

function auditPageFrom(html, publicDir, cssWidth, dpr) {
  let total = 0;
  const detail = [];
  for (const m of html.matchAll(/<(img|source)\b[^>]*>/gi)) {
    const tag = m[0];
    const type = attr(tag, 'type');
    if (m[1].toLowerCase() === 'source' && type && !/avif|webp|jpe?g|png/.test(type)) continue;
    const srcset = attr(tag, 'srcset');
    const src = attr(tag, 'src');
    if (!srcset && !src) continue;
    const cands = srcset ? parseSrcset(srcset) : [{ url: src, w: null }];
    const wDesc = cands.filter((c) => c.w);
    let chosen = null;
    if (wDesc.length) {
      const need = Math.round(evalSizes(attr(tag, 'sizes'), cssWidth) * dpr);
      const atLeast = wDesc.filter((c) => c.w >= need).sort((a, b) => a.w - b.w);
      chosen = atLeast.length ? atLeast[0] : wDesc.slice().sort((a, b) => b.w - a.w)[0];
    } else if (src) chosen = { url: src };
    if (!chosen) continue;
    const p = path.join(publicDir, chosen.url.replace(/[?#].*$/, '').replace(/^\//, ''));
    const bytes = fs.existsSync(p) ? fs.statSync(p).size : 0;
    total += bytes;
    detail.push({ url: chosen.url, bytes, type: type || 'img' });
  }
  return { total, detail };
}

const dirs = process.argv.slice(2);
const PAGES = ['index.html', 'about/index.html', 'inventory/index.html', 'specials/index.html'];

for (const dir of dirs) {
  const publicDir = path.resolve(dir);
  console.log(`\n${'='.repeat(78)}\n${dir}\n${'='.repeat(78)}`);
  let anyRasters = 0, anyBytes = 0;
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(jpe?g|png|webp|avif|gif|ico)$/i.test(e.name)) {
        anyRasters++; anyBytes += fs.statSync(p).size;
      }
    }
  })(publicDir);
  console.log(`publish dir: ${anyRasters} raster files, ${anyBytes} bytes (${(anyBytes / 1048576).toFixed(2)} MB)`);

  for (const page of PAGES) {
    const f = path.join(publicDir, page);
    if (!fs.existsSync(f)) continue;
    for (const vp of VIEWPORTS) {
      const { total, detail } = auditPagePictureAware(f, publicDir, vp.css, vp.dpr);
      console.log(`\n  ${page}  [${vp.name}]  ->  ${total.toLocaleString()} B  (${(total / 1024).toFixed(1)} KB)`);
      for (const d of detail.sort((a, b) => b.bytes - a.bytes)) {
        console.log(`      ${String(d.bytes).padStart(8)} B  ${d.type.padEnd(12)} ${d.url}`);
      }
    }
  }
}
