import { marked } from 'marked';

/**
 * Pure, network-free helpers for the "From GitHub URL" import feature.
 * All network access lives in the service layer; everything here is
 * deterministic so it can be unit-tested in isolation.
 */

export interface GithubRepo {
  owner: string;
  repo: string;
}

/** Language codes we recognise in release-asset and chapter file names. */
const KNOWN_LANGS = [
  'zh-cn',
  'zh-tw',
  'zh',
  'en',
  'ja',
  'ko',
  'ru',
  'ar',
  'ta',
  'vi',
  'fr',
  'de',
  'es',
  'pt',
  'it',
];

/**
 * Extract `owner/repo` from the various forms a user might paste:
 *   https://github.com/owner/repo
 *   https://github.com/owner/repo/tree/main/docs
 *   github.com/owner/repo
 *   owner/repo
 * Returns null when no repo can be identified.
 */
export function parseGithubRepoUrl(input: string): GithubRepo | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  let path = trimmed;
  const hostMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?github\.com\/(.+)$/i);
  if (hostMatch) {
    path = hostMatch[1]!;
  } else if (/^https?:\/\//i.test(trimmed)) {
    // A URL, but not github.com — not supported.
    return null;
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const owner = segments[0]!;
  const repo = segments[1]!.replace(/\.git$/i, '');
  if (!owner || !repo) return null;
  return { owner, repo };
}

export type ArtifactExt = 'epub' | 'pdf';

export interface ReleaseAsset {
  name: string;
  url: string;
  size?: number;
}

export interface ArtifactCandidate {
  asset: ReleaseAsset;
  ext: ArtifactExt;
  lang: string | null;
}

export interface ArtifactSelection {
  /** The auto-selected artifact, or null when the caller must ask the user. */
  pick: ArtifactCandidate | null;
  /** All epub/pdf candidates, epub-first, for a picker UI. */
  candidates: ArtifactCandidate[];
  /** True when more than one plausible artifact exists and none matched a preferred language. */
  ambiguous: boolean;
}

/** Pull a known language code out of a file name, e.g. "...-zh-CN.epub" -> "zh-cn". */
function parseLangFromName(name: string): string | null {
  const base = name.toLowerCase().replace(/\.(epub|pdf)$/, '');
  for (const lang of KNOWN_LANGS) {
    if (base.endsWith(`-${lang}`) || base.endsWith(`_${lang}`) || base.endsWith(`.${lang}`)) {
      return lang;
    }
  }
  return null;
}

function langMatches(candidate: string | null, preferred: string): boolean {
  if (!candidate) return false;
  const c = candidate.toLowerCase();
  const p = preferred.toLowerCase();
  if (c === p) return true;
  // A region-less preference ("zh") matches any region ("zh-cn", "zh-tw").
  if (!p.includes('-') && c.split('-')[0] === p) return true;
  return false;
}

/**
 * Choose the best downloadable artifact.
 * Rule (design decision B): prefer EPUB over PDF; prefer an asset whose
 * language matches `preferredLangs` (tried in order); only leave it to the
 * user when several languages exist and none is preferred.
 */
export function selectBestArtifact(
  assets: ReleaseAsset[],
  preferredLangs: string[],
): ArtifactSelection {
  const candidates: ArtifactCandidate[] = [];
  for (const asset of assets) {
    const m = asset.name.toLowerCase().match(/\.(epub|pdf)$/);
    if (!m) continue;
    candidates.push({ asset, ext: m[1] as ArtifactExt, lang: parseLangFromName(asset.name) });
  }
  // epub before pdf
  candidates.sort((a, b) => (a.ext === b.ext ? 0 : a.ext === 'epub' ? -1 : 1));

  if (candidates.length === 0) {
    return { pick: null, candidates, ambiguous: false };
  }

  const epubs = candidates.filter((c) => c.ext === 'epub');
  const pool = epubs.length > 0 ? epubs : candidates;

  // Try each preferred language in order.
  for (const pref of preferredLangs) {
    const matches = pool.filter((c) => langMatches(c.lang, pref));
    if (matches.length >= 1) {
      // Prefer an exact code match over a region-less one when several match.
      const exact = matches.find((c) => c.lang?.toLowerCase() === pref.toLowerCase());
      return { pick: exact ?? matches[0]!, candidates, ambiguous: false };
    }
  }

  // No language preference matched.
  if (pool.length === 1) {
    return { pick: pool[0]!, candidates, ambiguous: false };
  }
  const distinctLangs = new Set(pool.map((c) => c.lang));
  if (distinctLangs.size <= 1) {
    // Same (or no) language, multiple formats — pool is epub-first, take the first.
    return { pick: pool[0]!, candidates, ambiguous: false };
  }
  // Multiple languages, none preferred — ask the user.
  return { pick: null, candidates, ambiguous: true };
}

export interface DetectedChapter {
  path: string;
  title: string;
}

const FRONT_MATTER = ['introduction', 'intro', 'preface', 'foreword', 'prologue'];
const BACK_MATTER = ['afterword', 'appendix', 'conclusion', 'epilogue', 'postscript'];
/** File names (case-insensitive base) that are never book chapters. */
const EXCLUDE_BASENAMES = [
  'readme',
  'license',
  'licence',
  'contributing',
  'code_of_conduct',
  'changelog',
  'security',
  'summary',
  'index',
  'toc',
  '_sidebar',
  '_navbar',
  '_coverpage',
];

function baseName(path: string): string {
  const file = path.split('/').pop() ?? path;
  return file.replace(/\.md$/i, '');
}

/** Strip a trailing language suffix so "chapter1.zhtw" -> "chapter1". */
function stripLangSuffix(base: string): string {
  return base.replace(/[.\-_](zh-cn|zh-tw|zhtw|zh|en|ja|ko|ru|ar|ta|vi|fr|de|es|pt|it)$/i, '');
}

function firstNumber(str: string): number | null {
  const m = str.match(/\d+/);
  return m ? parseInt(m[0]!, 10) : null;
}

function classify(base: string): 'front' | 'back' | 'body' {
  const key = stripLangSuffix(base).toLowerCase();
  if (FRONT_MATTER.some((w) => key.includes(w))) return 'front';
  if (BACK_MATTER.some((w) => key.includes(w))) return 'back';
  // reference-answers / answers belong at the very end
  if (key.includes('answer') || key.includes('solution')) return 'back';
  return 'body';
}

/** Turn a file base name into a human title: "chapter10" -> "Chapter 10". */
export function deriveChapterTitle(path: string): string {
  const base = stripLangSuffix(baseName(path));
  const n = firstNumber(base);
  const words = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (/^chapter/i.test(base) && n !== null) return `Chapter ${n}`;
  // Capitalise each word.
  return words.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Detect an ordered chapter list from a repo's markdown file paths.
 * Picks the most likely book folder (a `book-<lang>` matching a preferred
 * language, else `book`, else `docs`, else the repo root), then orders it as
 * front matter -> numbered body (natural sort) -> back matter.
 *
 * The result is a *suggestion*; the UI lets the user edit it (decision B).
 */
export function detectChapters(paths: string[], preferredLangs: string[] = []): DetectedChapter[] {
  const mdPaths = paths.filter((p) => /\.md$/i.test(p));
  if (mdPaths.length === 0) return [];

  // Group by top-level directory.
  const byDir = new Map<string, string[]>();
  for (const p of mdPaths) {
    const idx = p.indexOf('/');
    const dir = idx === -1 ? '' : p.slice(0, idx);
    if (!byDir.has(dir)) byDir.set(dir, []);
    byDir.get(dir)!.push(p);
  }

  const isChapterish = (p: string) => !EXCLUDE_BASENAMES.includes(baseName(p).toLowerCase());

  // Rank candidate directories.
  const scoreDir = (dir: string): number => {
    const lower = dir.toLowerCase();
    for (let i = 0; i < preferredLangs.length; i++) {
      const pref = preferredLangs[i]!.toLowerCase();
      if (lower === `book-${pref}` || lower === `book_${pref}`) return 1000 - i;
    }
    if (/^book(-|_|$)/.test(lower)) return 500;
    if (lower === 'docs' || lower === 'doc' || lower === 'book') return 400;
    if (lower === '') return 100;
    return 200;
  };

  let bestDir = '';
  let bestScore = -1;
  for (const [dir, files] of byDir) {
    const chapterCount = files.filter(isChapterish).length;
    if (chapterCount === 0) continue;
    const score = scoreDir(dir) + Math.min(chapterCount, 50);
    if (score > bestScore) {
      bestScore = score;
      bestDir = dir;
    }
  }

  const chosen = (byDir.get(bestDir) ?? []).filter(isChapterish);

  const ordered = [...chosen].sort((a, b) => {
    const ca = classify(baseName(a));
    const cb = classify(baseName(b));
    const rank = { front: 0, body: 1, back: 2 } as const;
    if (rank[ca] !== rank[cb]) return rank[ca] - rank[cb];
    const na = firstNumber(stripLangSuffix(baseName(a)));
    const nb = firstNumber(stripLangSuffix(baseName(b)));
    if (na !== null && nb !== null && na !== nb) return na - nb; // natural sort
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return baseName(a).localeCompare(baseName(b));
  });

  return ordered.map((path) => ({ path, title: deriveChapterTitle(path) }));
}

/**
 * Parse an ordered list of markdown link targets out of a SUMMARY.md /
 * index / _sidebar file (mdBook / docsify / GitBook convention).
 * Returns repo-relative-ish paths in document order.
 */
export function parseSummaryOrder(summaryMarkdown: string): string[] {
  const order: string[] = [];
  // Match `](path.md)` allowing an optional #anchor after the .md.
  const linkRe = /\]\(([^)#\s]+\.md)(?:#[^)]*)?\)/gi;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(summaryMarkdown)) !== null) {
    const target = m[1]!.trim();
    if (target && !order.includes(target)) order.push(target);
  }
  return order;
}

function isAbsoluteUrl(url: string): boolean {
  return (
    /^[a-z][a-z0-9+.-]*:/i.test(url) || // scheme:...
    url.startsWith('//') ||
    url.startsWith('#') ||
    url.startsWith('data:')
  );
}

/**
 * Resolve a possibly-relative asset URL against the raw base of the file that
 * referenced it, so images/links keep working once the markdown is extracted.
 * `rawBase` must be like "https://raw.githubusercontent.com/owner/repo/branch/".
 */
export function resolveRelativeUrl(rawBase: string, fileDir: string, ref: string): string {
  if (isAbsoluteUrl(ref)) return ref;
  const dir = fileDir ? (fileDir.endsWith('/') ? fileDir : fileDir + '/') : '';
  try {
    return new URL(ref, rawBase + dir).href;
  } catch {
    return ref;
  }
}

/**
 * Convert a markdown chapter into well-formed XHTML suitable for embedding in
 * an EPUB body. Relative image/link URLs are rewritten to absolute raw URLs.
 * Parsing as HTML then re-serialising as XML guarantees well-formedness
 * (self-closed void tags, escaped entities) regardless of the markdown.
 */
export function markdownToXhtml(
  md: string,
  opts: { rawBase: string; fileDir: string },
): string {
  const html = marked.parse(md, { async: false }) as string;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const root = doc.body.firstElementChild ?? doc.body;

  root.querySelectorAll('img[src]').forEach((el) => {
    el.setAttribute('src', resolveRelativeUrl(opts.rawBase, opts.fileDir, el.getAttribute('src')!));
  });
  root.querySelectorAll('a[href]').forEach((el) => {
    el.setAttribute('href', resolveRelativeUrl(opts.rawBase, opts.fileDir, el.getAttribute('href')!));
  });

  const serializer = new XMLSerializer();
  let xhtml = '';
  root.childNodes.forEach((n) => {
    xhtml += serializer.serializeToString(n);
  });
  return xhtml;
}
