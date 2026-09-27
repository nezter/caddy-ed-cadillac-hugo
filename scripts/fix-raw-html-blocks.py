#!/usr/bin/env python3
"""
fix-raw-html-blocks.py -- remove the blank lines that turn raw HTML into code.

THE BUG
-------
A raw HTML block in markdown (Goldmark block types 6 and 7) is terminated by a
BLANK LINE. So a block like this:

    <form ...>
      <p class="visually-hidden">...</p>

      <div class="form-grid">

renders the first part as HTML and then treats the indented remainder as an
INDENTED CODE BLOCK -- four spaces is markdown for "code". The result on
/lead-form/ was:

    <pre><code>&lt;div class="form-grid form-grid-2"&gt; ...

which is a visible block of escaped markup, and 379px of horizontal overflow
because a <pre> does not wrap.

It is invisible in review. The .md looks correct, the gate passes, the page
returns 200, and only a rendered browser shows that half the form is being
displayed as source code.

THE FIX
-------
Drop the blank lines inside raw HTML blocks. Nothing else changes: the rendered
markup is identical apart from the code block not being there.

This is safe to do mechanically because the blank lines are INSIDE an open tag,
where they carry no meaning in HTML. Whitespace between block elements is
insignificant. The only thing lost is readability in the .md source, which is
why the .md files are not edited here -- this rewrites only the built output's
source, and the .md files are fixed in place by hand where it matters.

Actually: it does rewrite the .md. See below.
"""

import os
import re
import sys

TAG_OPEN = re.compile(
    r'<(form|div|section|table|nav|header|footer|article|aside|main|ul|ol|dl|figure|'
    r'picture|label|fieldset|noscript|details|dialog|blockquote|pre|svg|span|p|h[1-6])\b'
)
TAG_CLOSE = re.compile(
    r'</(?:form|div|section|table|nav|header|footer|article|aside|main|ul|ol|dl|figure|'
    r'picture|label|fieldset|noscript|details|dialog|blockquote|pre|svg|span|p|h[1-6])>'
)

def fix(path):
    original = open(path, encoding='utf-8').read()
    lines = original.split('\n')
    out = []
    depth = 0
    changed = 0
    in_fence = False

    for line in lines:
        s = line.strip()

        if s.startswith('```'):
            in_fence = not in_fence
            out.append(line)
            continue
        if in_fence:
            out.append(line)
            continue

        # Front matter, and the opening --- of the document.
        if depth == 0 and (not s or s.startswith('---') or re.match(r'^[a-zA-Z_]+:', s)):
            out.append(line)
            if s.startswith('---') and out[:-1] and any(l.strip() == '---' for l in out[:-1]):
                pass
            continue

        if s == '' and depth > 0:
            # Look ahead: an indented line after a blank, while a tag is open.
            nxt = None
            for j in range(len(out), len(lines)):
                if lines[j].strip():
                    nxt = lines[j]
                    break
            if nxt is not None and nxt.startswith(('    ', '\t')):
                changed += 1
                continue  # drop the blank line

        out.append(line)
        opens = len(TAG_OPEN.findall(s))
        closes = len(TAG_CLOSE.findall(s))
        selfclose = len(re.findall(r'/>\s*$', s))
        depth += opens - closes - selfclose
        if depth < 0:
            depth = 0

    if changed:
        open(path, 'w', encoding='utf-8').write('\n'.join(out))
    return changed


def main():
    targets = sys.argv[1:]
    if not targets:
        for root, d, files in os.walk('site/content'):
            for n in sorted(files):
                if n.endswith('.md'):
                    targets.append(os.path.join(root, n))
    total = 0
    touched = []
    for p in targets:
        c = fix(p)
        if c:
            total += c
            touched.append((p, c))
    for p, c in touched:
        print(f'  {p}: removed {c} blank line(s)')
    print(f'\n  {len(touched)} file(s) fixed, {total} blank line(s) removed')
    if not touched:
        print('  nothing to fix')


if __name__ == '__main__':
    main()
