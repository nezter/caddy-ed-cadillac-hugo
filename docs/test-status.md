# Test Suite Status

Honest accounting of where the Netlify Functions test suite actually stands.

## Summary

| | |
|---|---|
| Suites | 9 |
| Tests | 72 |
| Passing | 41 |
| Failing | 31 (all pre-existing) |
| Coverage | ~0.6% |

## Why this was hidden for so long

`netlify/functions/jest.config.js` had:

```js
testMatch: ['../tests/**/*.test.js', ...]
```

The suite lives at the **repository root** `tests/`, so from
`netlify/functions/` the correct path is `../../tests/`. `../tests/` resolves to
`netlify/tests/`, which does not exist. Jest therefore matched **zero** test
files on every run.

That produced two compounding illusions:

1. A single placeholder suite (`test-basic.test.js`, 3 trivial tests) was the
   only thing that ran, so the pipeline reported "1 passed".
2. `collectCoverageFrom` still globbed every function file, so real coverage was
   ~0% — but the thresholds were set to 70/75/75/75, which should have failed
   the build every time. It did fail, and that failure was ignored/waved away
   rather than diagnosed, because the obvious conclusion ("the suite matches
   nothing") was never followed up.

Net effect: a large amount of rot accumulated behind a green-looking pipeline.

## What was fixed

| Problem | Fix |
|---|---|
| `testMatch` pointed at a nonexistent directory | `'<rootDir>/../../tests/**/*.test.js'` |
| Jest only searches `roots` (default `[rootDir]`), so the root `tests/` tree was invisible | added `roots: ['<rootDir>', '<rootDir>/../../tests']` |
| `tests/setup.js` mocks `ioredis`/`pg`/etc., but those live in `netlify/functions/node_modules` and Node resolves upward from `tests/` | added `modulePaths: ['<rootDir>/node_modules']` |
| Suites do `require('../setup')`, but `setup.js` only assigned `global.testUtils` and never exported | added `module.exports = global.testUtils` |
| A `jest.mock()` factory closed over the bare identifier `testUtils` (jest hoisting forbids out-of-scope refs) | reference `global.testUtils` instead |
| Calendar tests are browser code but the suite runs in `node` | per-file `@jest-environment jsdom` docblock; added `jest-environment-jsdom` |
| Coverage thresholds were unsatisfiable fiction (70/75 vs actual 0%) | lowered to a ratchet just below current levels, with a note not to lower them further |

Result: 0 → 41 passing.

## What still fails (31)

**`tests/unit/auth-middleware.test.js`** — the bulk of the failures.
`tests/setup.js` mocks `jsonwebtoken` so that `verify()` always returns
`{ role: 'admin', permissions: [...] }`. Tests for *manager* role, specific
permission sets, and user-data extraction set up their own expectations that
the blanket mock cannot satisfy, so every positive-path assertion receives
`false`. The negative-path tests (invalid/expired/malformed token) pass.

The fix is to make the `jsonwebtoken` mock delegate to the real implementation
(`jest.requireActual('jsonwebtoken')`) and sign real tokens with
`testUtils.createMockJWT()`, so each test controls its own claims. The current
`createMockJWT` also does not produce a valid JWT — it base64-encodes a raw JSON
payload with no header, signature, or base64url encoding, so `verify()` could
never accept it.

**`tests/unit/calendar/*`** — written against an older calendar module API.
Assertions reference methods and state the current implementation in
`site/assets/js/refactored/` does not expose.

## CI behaviour

The `test` job is `continue-on-error: true` and is deliberately **not** in the
`ci-green` needs list. It reports honestly without blocking a deploy.

`ci-green` gates on: `build`, `lint`, `audit`, `security`.

To make tests blocking, fix the assertions above, then remove
`continue-on-error` and add `test` to the `ci-green` needs. Do not silence a
failing test to get there.

## Known dead files (front end)

Unreferenced modules in `site/assets/js/`. None are imported by
`site/assets/js/index.js`, so Hugo never bundles them — this was confirmed by
grepping the built `js/main.*.js`. They are listed in `eslint.config.js` under
`ignores` so the lint gate stays meaningful instead of being permanently red.

| File | Problem | Notes |
|---|---|---|
| `vehicle-comparison.js` | **truncated mid-write** — unbalanced brace, "Expected identifier but found end of file" | working equivalent is `vehicleComparison.js` |
| `financingCalculator.js` | **truncated mid-write** — ends mid-sentence inside a template literal | working equivalent is `finance-calculator.js` |
| `api/inventory-proxy.js` | uses CommonJS `exports` in a browser module | |
| `inventory-fetcher.js` | calls `require('jsdom')` — Node-only, would throw in a browser | imported by the dead `inventory-display.js` |
| `utils.js` | calls `initLazyLoading()`, which is not defined anywhere | imported by the dead `main.js` |
| `main.js` | a second entry point alongside `index.js`; nothing imports it | |

They are left in place rather than deleted so the call on whether to restore or
remove them stays with the owner. All are recoverable from git history.

## Running them

```bash
./ci/run.sh test                        # on the CI host
./ci/run.sh shell                       # then: cd netlify/functions && npx jest
```

Single file, with coverage off while iterating:

```bash
npx jest --testPathPatterns=auth-middleware --coverage=false
```
