/**
 * stripJsComments -- remove JS comments WITHOUT eating code.
 *
 * Order matters, and getting it wrong is invisible.
 *
 * A line comment in this repo reads:
 *
 *     // Repointed from unrouted /api/ paths.
 *
 * The slash-star sequence inside that PROSE is not a comment opener, but a
 * naive block-comment stripper sees it as one. It then runs until the next
 * close-delimiter it can find, which may be a doc comment hundreds of lines
 * later, and everything between is deleted.
 *
 * That is not hypothetical. site/assets/js/customerRelationship.js has a line
 * comment containing a slash-star sequence in prose. The block-first stripper
 * removed its entire ENDPOINTS constant, so the endpoint gate reported "no
 * endpoint literals in this file" for a module whose whole purpose is calling
 * endpoints. It reported zero. The module was correct; the stripper was eating
 * it. A checker that silently deletes the thing it is checking is worse than no
 * checker, because it reports success.
 *
 * So: line comments first, then block comments. Once the line comments are
 * gone there is no slash-star hiding in prose to open a phantom block.
 *
 * The line-comment pattern also requires the double-slash to be preceded by
 * something that is not a quote, colon or slash, so a URL such as https: is
 * not mistaken for a comment opener.
 *
 * A trailing unterminated block comment is stripped too, so a genuinely
 * unbalanced file cannot swallow the remainder of the source.
 *
 * Shared by ci/verify-endpoints.js and ci/verify-content.js. Both needed this
 * and both got it wrong independently before this module existed.
 */
'use strict';

const LINE_COMMENT = /(^|[^:'"`\\/])\/\/[^\n]*/g;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const UNTERMINATED_BLOCK = /\/\*[\s\S]*$/;

function stripJsComments(src) {
  return String(src)
    .replace(LINE_COMMENT, '$1 ')
    .replace(BLOCK_COMMENT, ' ')
    .replace(UNTERMINATED_BLOCK, ' ');
}

module.exports = { stripJsComments };
