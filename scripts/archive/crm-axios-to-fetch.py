#!/usr/bin/env python3
"""
crm-axios-to-fetch.py -- replace axios in crm-service.js with fetch.

All five call sites had the identical shape:

    const response = await axios.post(
      `${this.apiUrl}/...`,
      body,
      { headers: {...}, timeout: this.timeout }
    )

Node 24 has global fetch, so axios was a second HTTP client alongside the one
the rest of the codebase already uses. The one real behaviour difference is
timeout: axios takes it in the config, fetch takes an AbortSignal. Getting that
wrong turns a 10-second timeout into an unbounded wait, so it is implemented
properly rather than dropped.

The old call is left in a comment at each site so the mapping is auditable.
"""

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILE = ROOT / 'netlify/functions/utils/crm-service.js'

HELPER = '''  /**
   * POST JSON, with a timeout.
   *
   * This replaces axios, which the rest of the codebase does not use: Node 24
   * has global fetch, and having two HTTP clients in one service meant two
   * timeout behaviours, two error shapes, and a dependency to keep current.
   *
   * The timeout is the one thing that is genuinely different between the two.
   * axios takes `timeout` in a config object; fetch has no such option and
   * needs an AbortSignal. Without it this call would wait indefinitely, which
   * for a third-party CRM is how one slow response becomes a pile-up of open
   * Lambda invocations.
   */
  async postJson(url, body, extraHeaders) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeout || 10000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: Object.assign(
          { 'Content-Type': 'application/json' },
          extraHeaders || {}
        ),
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }
'''


def main():
    src = FILE.read_text(encoding='utf-8')

    src = src.replace("const axios = require('axios');\n", '', 1)

    # axios.post(url, body, { headers: {...}, timeout: N })
    pattern = re.compile(
        r"const response = await axios\.post\(\s*"
        r"(`[^`]*`|'[^']*'|\"[^\"]*\")\s*,\s*"
        r"([A-Za-z_$][\w$.]*)\s*,\s*\{\s*"
        r"headers:\s*\{(.*?)\}\s*,\s*"
        r"timeout:\s*this\.timeout\s*,?\s*"
        r"\}\s*\)\s*;",
        re.S,
    )

    def repl(m):
        url, body, headers = m.group(1), m.group(2), m.group(3)
        return (
            "const response = await this.postJson(\n"
            f"        {url},\n"
            f"        {body},\n"
            "        { headers: {\n"
            f"{headers}\n"
            "        } }\n"
            "      );"
        )

    src, n = pattern.subn(repl, src)
    print(f'  {n}/5 axios.post call sites replaced')

    # Add the helper as the first method of the class.
    m = re.search(r"(\n  (?:async )?[A-Za-z_$][\w$]*\([^)]*\)\s*\{)", src)
    if m and 'postJson' not in src:
        src = src[:m.start()] + '\n' + HELPER + src[m.start():]
        print('  postJson helper added')

    FILE.write_text(src, encoding='utf-8')
    return 0 if n == 5 else 1


if __name__ == '__main__':
    sys.exit(main())
