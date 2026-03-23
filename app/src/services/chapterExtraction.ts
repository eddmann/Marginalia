import type { BookDoc, TOCItem } from '@/libs/document';

/**
 * Find the top-level TOC item that contains the given target.
 * If the target is "Section 5.1" nested under "Chapter 5", returns "Chapter 5".
 * If the target is already top-level, returns itself.
 */
export function findTopLevelAncestor(toc: TOCItem[], target: TOCItem): TOCItem | null {
  for (const item of toc) {
    if (item.href === target.href && item.label === target.label) return item;
    if (item.subitems?.length && containsItem(item.subitems, target)) return item;
  }
  return null;
}

function containsItem(items: TOCItem[], target: TOCItem): boolean {
  for (const item of items) {
    if (item.href === target.href && item.label === target.label) return true;
    if (item.subitems?.length && containsItem(item.subitems, target)) return true;
  }
  return false;
}

/**
 * Find the next top-level TOC item after the given one.
 * Used to determine where the current chapter ends.
 */
function findNextTopLevelItem(toc: TOCItem[], current: TOCItem): TOCItem | null {
  const idx = toc.findIndex(
    (item) => item.href === current.href && item.label === current.label,
  );
  if (idx === -1 || idx >= toc.length - 1) return null;
  return toc[idx + 1]!;
}

// Block-level elements that should get their own line breaks
const BLOCK_ELEMENTS = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'ASIDE', 'MAIN', 'NAV', 'HEADER', 'FOOTER',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'BLOCKQUOTE', 'PRE', 'FIGURE', 'FIGCAPTION',
  'UL', 'OL', 'LI', 'DL', 'DT', 'DD',
  'TABLE', 'TR', 'TH', 'TD',
  'HR', 'BR',
]);

const HEADING_LEVELS: Record<string, string> = {
  H1: '# ',
  H2: '## ',
  H3: '### ',
  H4: '#### ',
  H5: '##### ',
  H6: '###### ',
};

/**
 * Convert a DOM subtree to structured plain text suitable for LLM context.
 * Preserves headings, paragraphs, list items, and blockquotes as markdown-like formatting.
 */
function domToStructuredText(node: Node): string {
  const parts: string[] = [];

  function walk(n: Node) {
    if (n.nodeType === Node.TEXT_NODE) {
      const text = n.nodeValue?.replace(/[\t\n\r]+/g, ' ') ?? '';
      if (text.trim()) {
        parts.push(text);
      }
      return;
    }

    if (n.nodeType !== Node.ELEMENT_NODE) return;

    const el = n as Element;
    const tag = el.tagName;

    // Skip hidden elements, scripts, styles
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;

    const isBlock = BLOCK_ELEMENTS.has(tag);

    if (tag === 'BR') {
      parts.push('\n');
      return;
    }

    if (tag === 'HR') {
      parts.push('\n\n---\n\n');
      return;
    }

    if (isBlock) {
      parts.push('\n\n');
    }

    // Add markdown-style prefixes
    const headingPrefix = HEADING_LEVELS[tag];
    if (headingPrefix) {
      parts.push(headingPrefix);
    } else if (tag === 'LI') {
      // Determine if ordered or unordered
      const parent = el.parentElement;
      if (parent?.tagName === 'OL') {
        const index = Array.from(parent.children).indexOf(el) + 1;
        parts.push(`${index}. `);
      } else {
        parts.push('- ');
      }
    } else if (tag === 'BLOCKQUOTE') {
      parts.push('> ');
    }

    for (const child of el.childNodes) {
      walk(child);
    }

    if (isBlock) {
      parts.push('\n\n');
    }
  }

  walk(node);

  // Clean up: collapse multiple blank lines, trim
  return parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n /g, '\n')
    .replace(/ \n/g, '\n')
    .trim();
}

/**
 * Extract the DOM content of a section between two optional anchor IDs.
 * If startId is provided, extraction begins at that element.
 * If endId is provided, extraction stops before that element.
 */
function extractRangeText(doc: Document, startId: string | null, endId: string | null): string {
  const body = doc.body ?? doc.documentElement;
  if (!body) return '';

  // No anchors — use the full body
  if (!startId && !endId) {
    return domToStructuredText(body);
  }

  // Create a range covering the desired portion
  const range = doc.createRange();

  if (startId) {
    const startEl = doc.getElementById(startId);
    if (startEl) {
      range.setStartBefore(startEl);
    } else {
      range.setStartBefore(body.firstChild ?? body);
    }
  } else {
    range.setStartBefore(body.firstChild ?? body);
  }

  if (endId) {
    const endEl = doc.getElementById(endId);
    if (endEl) {
      range.setEndBefore(endEl);
    } else {
      range.setEndAfter(body.lastChild ?? body);
    }
  } else {
    range.setEndAfter(body.lastChild ?? body);
  }

  const fragment = range.cloneContents();
  // Wrap in a temporary element for text extraction
  const wrapper = doc.createElement('div');
  wrapper.appendChild(fragment);

  return domToStructuredText(wrapper);
}

/**
 * Resolve a TOC href into a section index and optional fragment ID.
 * Handles the async case (PDF) transparently.
 */
async function resolveTocHref(
  bookDoc: BookDoc,
  href: string | undefined,
): Promise<{ sectionId: string | number | null; fragment: string | null }> {
  if (!href) return { sectionId: null, fragment: null };

  const result = await Promise.resolve(bookDoc.splitTOCHref(href));
  const sectionId = result[0] ?? null;
  const fragment = result[1] != null ? String(result[1]) : null;

  return { sectionId, fragment };
}

/**
 * Find the index in bookDoc.sections for a given section ID.
 */
function findSectionIndex(bookDoc: BookDoc, sectionId: string | number | null): number {
  if (sectionId == null) return -1;
  return bookDoc.sections.findIndex((s) => s.id === sectionId || s.id === String(sectionId));
}

/**
 * Extract the full text of a chapter, identified by a TOC item, from the book.
 *
 * Uses `createDocument()` to load section DOMs independently of the renderer,
 * resolves chapter boundaries from the TOC, and converts to structured text.
 */
export async function extractChapterText(
  bookDoc: BookDoc,
  tocItem: TOCItem | undefined | null,
  toc: TOCItem[] | undefined,
): Promise<string> {
  if (!tocItem?.href || !toc || !bookDoc.sections?.length) return '';

  try {
    // Always extract the full top-level chapter, even if we're in a subsection
    const topLevelItem = findTopLevelAncestor(toc, tocItem) ?? tocItem;
    const nextItem = findNextTopLevelItem(toc, topLevelItem);

    // Resolve start boundary
    const start = await resolveTocHref(bookDoc, topLevelItem.href);
    if (start.sectionId == null) return '';

    const startSectionIdx = findSectionIndex(bookDoc, start.sectionId);
    if (startSectionIdx === -1) return '';

    // Resolve end boundary
    const end = nextItem ? await resolveTocHref(bookDoc, nextItem.href) : { sectionId: null, fragment: null };
    const endSectionIdx = end.sectionId != null ? findSectionIndex(bookDoc, end.sectionId) : -1;

    const textParts: string[] = [];

    // Determine how many sections to process.
    // Only include the end section if it has a fragment anchor (chapter boundary is mid-section).
    // Otherwise the end section belongs entirely to the next chapter — stop before it.
    let lastSectionIdx: number;
    if (endSectionIdx === -1) {
      lastSectionIdx = startSectionIdx;
    } else if (end.fragment) {
      lastSectionIdx = endSectionIdx;
    } else {
      lastSectionIdx = endSectionIdx - 1;
    }

    for (let i = startSectionIdx; i <= lastSectionIdx; i++) {
      const section = bookDoc.sections[i];
      if (!section?.createDocument) continue;

      const doc = await section.createDocument();
      if (!doc) continue;

      const isFirstSection = i === startSectionIdx;
      const isLastSection = i === lastSectionIdx;

      // Determine start/end anchors for this section
      const sectionStartId = isFirstSection ? (start.fragment ?? null) : null;
      // Only apply end fragment if the end is in this same section
      const sectionEndId = isLastSection && endSectionIdx !== -1 ? (end.fragment ?? null) : null;

      const text = extractRangeText(doc, sectionStartId, sectionEndId);
      if (text) textParts.push(text);
    }

    return textParts.join('\n\n');
  } catch (e) {
    console.warn('Chapter text extraction failed:', e);
    return '';
  }
}
