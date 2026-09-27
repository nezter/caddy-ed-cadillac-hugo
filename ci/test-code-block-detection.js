// Does the gate's detection actually fire on the shapes of defect it claims to
// catch, and stay quiet on a real code block of source?
//
// The negative test could not be run against a real original file inside the
// build container -- git cannot cross the podman mount, so "restore the original
// and rebuild" silently tested an empty file. That produced a green result for
// a gate that had not been exercised at all, which is exactly the failure mode
// this repo keeps hitting. So the detection is tested here instead, where the
// inputs are visible.
const ESCAPED_MARKUP = /&lt;\/?[a-z][\w-]*[\s/>]|&quot;|&#39;|&gt;(?!\w)/i;
const RAW_ATTRS = /\s(?:class|id|href|src|name|type|value)\s*=\s*"/i;
const RE = /<pre[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>/g;

const cases = [
  ['a real code block of shell source', '<pre><code>npm run build\nnpm test</code></pre>', false],
  ['a real code block of JS source', '<pre><code>const x = 1;\nif (x) { go(); }</code></pre>', false],
  ['a pre with no code tag at all', '<pre>plain preformatted text</pre>', false],
  ['markup escaped by a broken raw HTML block', '<pre><code>&lt;div class="form-grid"&gt;\n  &lt;input id=lead-name&gt;\n&lt;/div&gt;</code></pre>', true],
  ['escaped tags but no quotes', '<pre><code>&lt;section&gt;\n&lt;h1&gt;Title&lt;/h1&gt;\n&lt;/section&gt;</code></pre>', true],
  ['quotes escaped but no tags', '<pre><code>&quot;value&quot; &amp; &quot;other&quot;</code></pre>', true],
  ['raw attributes, no escaping at all', '<pre><code><div class="x">hi</div></code></pre>', true],
  ['a code block that legitimately shows HTML', '<pre><code>&amp;lt;div&amp;gt;  // escaped once, as documentation\n&lt;p&gt;and once because it is an example&lt;/p&gt;</code></pre>', true],
];

let failures = 0;
for (const [name, html, want] of cases) {
  RE.lastIndex = 0;
  let fires = false;
  let m;
  while ((m = RE.exec(html)) !== null) {
    if (ESCAPED_MARKUP.test(m[1]) || RAW_ATTRS.test(m[1])) { fires = true; break; }
  }
  const ok = fires === want;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  fires=${String(fires).padEnd(5)} want=${String(want).padEnd(5)} ${name}`);
}

console.log(`\n  ${cases.length - failures}/${cases.length} correct`);
process.exit(failures ? 1 : 0);
