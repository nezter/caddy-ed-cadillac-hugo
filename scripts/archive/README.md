# scripts/archive

One-shot migration, repair and codemod scripts that have done their job
and are kept only for the record (archived 2026-10 in the repo hygiene
pass). Nothing here runs in CI or in any documented workflow. If you need
one again, run it deliberately and read it first — they assume the
database and file layouts of the day they were written.

Still-live neighbours that look similar but are NOT archived:
`migrate-turso.js` and `pg2turso.py` (both called by `ci/run.sh`),
`schema-audit.py`, `import-netlify-forms.js` (npm script + docs),
the `seed-*` scripts, and the `setup-*` scripts.
