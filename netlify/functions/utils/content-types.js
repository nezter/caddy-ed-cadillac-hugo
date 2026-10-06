/**
 * content-types.js -- ONE definition per manageable content type.
 *
 * Articles, specials and testimonials are the same machine wearing three
 * hats: a queue table, an applier that writes site content files, an admin
 * API with a field spec, and a public section. This module is the single
 * place the differences live -- tables, markers, fields, permissions, audit
 * actions, apply commands -- so the queue, the API, the applier and the
 * admin page all read the same definition and cannot drift apart.
 *
 * Field kinds the generic editor and validator understand:
 *   text      single-line, length-capped
 *   date      YYYY-MM-DD
 *   textarea  multi-line (body/quote/terms)
 *   tags      array of short strings
 *   bool      checkbox (published drives draft:, featured drives featured:)
 *
 * `main: true` marks the field that becomes the file's markdown body.
 * `required: true` means the row cannot exist without it.
 */

'use strict';

const TYPES = {
  articles: {
    label: 'articles',
    one: 'article',
    table: 'article_drafts',
    marker: 'article_queue',
    listKey: 'articles',
    section: 'articles',
    applyCmd: 'articles:apply',
    permissions: { read: 'articles_read', write: 'articles_write' },
    auditAction: 'article.edit',
    entity: 'article',
    slug: { max: 80 },
    fields: [
      { key: 'title', kind: 'text', label: 'Title', required: true, max: 120 },
      { key: 'description', kind: 'text', label: 'Meta description (search results)', max: 200, hint: 'Aim for 70-160 characters. This is what Google shows.' },
      { key: 'date', kind: 'date', label: 'Date', max: 10 },
      { key: 'author', kind: 'text', label: 'Author', max: 60 },
      { key: 'tags', kind: 'tags', label: 'Tags (comma separated)', maxItems: 8, maxLength: 40 },
      { key: 'image', kind: 'text', label: 'Feature image path (optional)', max: 200, hint: 'e.g. img/caddy-ed.jpg -- a file that exists in the site assets.' },
      { key: 'body', kind: 'textarea', label: 'Body (Markdown)', max: 60000, main: true },
      { key: 'published', kind: 'bool', label: 'Published (unchecked = draft, invisible on the site)', default: true },
    ],
  },
  specials: {
    label: 'specials',
    one: 'special',
    table: 'special_drafts',
    marker: 'special_queue',
    listKey: 'specials',
    section: 'specials',
    applyCmd: 'specials:apply',
    permissions: { read: 'specials_read', write: 'specials_write' },
    auditAction: 'special.edit',
    entity: 'special',
    slug: { max: 80 },
    fields: [
      { key: 'title', kind: 'text', label: 'Offer title', required: true, max: 120 },
      { key: 'description', kind: 'text', label: 'Short description (lists and search)', max: 200 },
      { key: 'date', kind: 'date', label: 'Starts / posted (YYYY-MM-DD)', max: 10 },
      { key: 'expires', kind: 'date', label: 'Expires (YYYY-MM-DD, optional)', max: 10 },
      { key: 'image', kind: 'text', label: 'Image path (optional)', max: 200 },
      { key: 'terms', kind: 'textarea', label: 'Terms & conditions (Markdown, optional)', max: 1000 },
      { key: 'body', kind: 'textarea', label: 'Details (Markdown)', max: 60000, main: true },
      { key: 'featured', kind: 'bool', label: 'Feature this offer' },
      { key: 'published', kind: 'bool', label: 'Published (unchecked = draft)', default: true },
    ],
  },
  testimonials: {
    label: 'testimonials',
    one: 'testimonial',
    table: 'testimonial_drafts',
    marker: 'testimonial_queue',
    listKey: 'testimonials',
    section: 'testimonials',
    applyCmd: 'testimonials:apply',
    permissions: { read: 'testimonials_read', write: 'testimonials_write' },
    auditAction: 'testimonial.edit',
    entity: 'testimonial',
    slug: { max: 80 },
    fields: [
      { key: 'title', kind: 'text', label: 'Customer name', required: true, max: 120 },
      { key: 'vehicle', kind: 'text', label: 'Vehicle purchased', max: 120 },
      { key: 'date', kind: 'date', label: 'Date', max: 10 },
      { key: 'image', kind: 'text', label: 'Customer photo path (optional)', max: 200 },
      { key: 'body', kind: 'textarea', label: 'The testimonial (quote)', max: 4000, main: true },
      { key: 'featured', kind: 'bool', label: 'Feature on the testimonials page' },
      { key: 'published', kind: 'bool', label: 'Published (unchecked = draft)', default: true },
    ],
  },
};

function typeOrThrow(name) {
  const def = TYPES[name];
  if (!def) throw new Error('unknown content type: ' + name);
  return def;
}

module.exports = { TYPES, typeOrThrow };
