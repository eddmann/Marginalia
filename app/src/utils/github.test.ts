import { describe, it, expect } from 'vitest';
import {
  parseGithubRepoUrl,
  selectBestArtifact,
  detectChapters,
  parseSummaryOrder,
  deriveChapterTitle,
  resolveRelativeUrl,
  markdownToXhtml,
  type ReleaseAsset,
} from './github';

describe('parseGithubRepoUrl', () => {
  it('parses the common URL forms', () => {
    expect(parseGithubRepoUrl('https://github.com/bojieli/ai-agent-book')).toEqual({
      owner: 'bojieli',
      repo: 'ai-agent-book',
    });
    expect(parseGithubRepoUrl('github.com/bojieli/ai-agent-book')).toEqual({
      owner: 'bojieli',
      repo: 'ai-agent-book',
    });
    expect(parseGithubRepoUrl('bojieli/ai-agent-book')).toEqual({
      owner: 'bojieli',
      repo: 'ai-agent-book',
    });
    expect(parseGithubRepoUrl('https://github.com/bojieli/ai-agent-book/tree/main/docs')).toEqual({
      owner: 'bojieli',
      repo: 'ai-agent-book',
    });
    expect(parseGithubRepoUrl('  https://github.com/owner/repo.git  ')).toEqual({
      owner: 'owner',
      repo: 'repo',
    });
  });

  it('rejects non-github and malformed input', () => {
    expect(parseGithubRepoUrl('')).toBeNull();
    expect(parseGithubRepoUrl('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseGithubRepoUrl('just-one-segment')).toBeNull();
  });
});

describe('selectBestArtifact', () => {
  const asset = (name: string): ReleaseAsset => ({ name, url: `https://x/${name}` });
  const multiLang = [
    'AI-Agents-in-Depth-ar.epub',
    'AI-Agents-in-Depth-ar.pdf',
    'AI-Agents-in-Depth-en.epub',
    'AI-Agents-in-Depth-en.pdf',
    'AI-Agents-in-Depth-ja.epub',
    'AI-Agents-in-Depth-zh-CN.epub',
    'AI-Agents-in-Depth-zh-CN.pdf',
    'AI-Agents-in-Depth-zh-TW.epub',
  ].map(asset);

  it('prefers the EPUB whose language matches (zh-CN for a Chinese user)', () => {
    const sel = selectBestArtifact(multiLang, ['zh-cn', 'zh']);
    expect(sel.ambiguous).toBe(false);
    expect(sel.pick?.asset.name).toBe('AI-Agents-in-Depth-zh-CN.epub');
    expect(sel.pick?.ext).toBe('epub');
    // epub candidates listed before pdf ones
    expect(sel.candidates[0]!.ext).toBe('epub');
  });

  it('prefers EPUB over PDF for the same language', () => {
    const sel = selectBestArtifact(multiLang, ['en']);
    expect(sel.pick?.asset.name).toBe('AI-Agents-in-Depth-en.epub');
  });

  it('is ambiguous when several languages exist and none is preferred', () => {
    const sel = selectBestArtifact(multiLang, ['fr']);
    expect(sel.pick).toBeNull();
    expect(sel.ambiguous).toBe(true);
    expect(sel.candidates.length).toBeGreaterThan(1);
  });

  it('auto-picks a lone artifact regardless of language', () => {
    const sel = selectBestArtifact([asset('the-book.epub')], ['zh-cn']);
    expect(sel.ambiguous).toBe(false);
    expect(sel.pick?.asset.name).toBe('the-book.epub');
  });

  it('falls back to PDF when no EPUB exists', () => {
    const sel = selectBestArtifact([asset('book-en.pdf'), asset('book-ja.pdf')], ['en']);
    expect(sel.pick?.asset.name).toBe('book-en.pdf');
    expect(sel.pick?.ext).toBe('pdf');
  });

  it('returns no pick when there are no epub/pdf assets', () => {
    const sel = selectBestArtifact([asset('notes.zip'), asset('cover.png')], ['en']);
    expect(sel.pick).toBeNull();
    expect(sel.candidates).toHaveLength(0);
    expect(sel.ambiguous).toBe(false);
  });
});

describe('detectChapters', () => {
  it('picks the language book folder and orders front/body/back with natural sort', () => {
    const paths = [
      'README.md',
      'LICENSE.md',
      'book-en/introduction.md',
      'book-en/chapter1.md',
      'book-en/chapter2.md',
      'book-en/chapter10.md',
      'book-en/afterword.md',
      'book-en/reference-answers.md',
      'chapter1/context/README.md',
    ];
    const chapters = detectChapters(paths, ['en']);
    expect(chapters.map((c) => c.path)).toEqual([
      'book-en/introduction.md',
      'book-en/chapter1.md',
      'book-en/chapter2.md',
      'book-en/chapter10.md', // must come after chapter2, not after chapter1
      'book-en/afterword.md',
      'book-en/reference-answers.md',
    ]);
    expect(chapters[1]!.title).toBe('Chapter 1');
    expect(chapters[3]!.title).toBe('Chapter 10');
  });

  it('falls back to a docs folder and excludes non-chapter files', () => {
    const paths = ['docs/README.md', 'docs/01-intro.md', 'docs/02-usage.md', 'docs/SUMMARY.md'];
    const chapters = detectChapters(paths, ['zh-cn']);
    expect(chapters.map((c) => c.path)).toEqual(['docs/01-intro.md', 'docs/02-usage.md']);
  });

  it('returns empty when there are no markdown files', () => {
    expect(detectChapters(['src/main.ts', 'image.png'], [])).toEqual([]);
  });
});

describe('parseSummaryOrder', () => {
  it('extracts ordered .md link targets and drops anchors/dupes', () => {
    const summary = [
      '# Summary',
      '- [Intro](intro.md)',
      '- [One](chapters/one.md)',
      '- [Two](chapters/two.md#section)',
      '- [One again](chapters/one.md)',
      '- [External](https://example.com)',
    ].join('\n');
    expect(parseSummaryOrder(summary)).toEqual(['intro.md', 'chapters/one.md', 'chapters/two.md']);
  });
});

describe('deriveChapterTitle', () => {
  it('humanises file names', () => {
    expect(deriveChapterTitle('book-en/chapter10.md')).toBe('Chapter 10');
    expect(deriveChapterTitle('book-zhtw/chapter1.zhtw.md')).toBe('Chapter 1');
    expect(deriveChapterTitle('docs/getting-started.md')).toBe('Getting Started');
    expect(deriveChapterTitle('introduction.md')).toBe('Introduction');
  });
});

describe('resolveRelativeUrl', () => {
  const base = 'https://raw.githubusercontent.com/o/r/main/';
  it('resolves relative refs against the file dir', () => {
    expect(resolveRelativeUrl(base, 'book-en', 'images/a.png')).toBe(
      'https://raw.githubusercontent.com/o/r/main/book-en/images/a.png',
    );
    expect(resolveRelativeUrl(base, 'book-en', '../assets/x.png')).toBe(
      'https://raw.githubusercontent.com/o/r/main/assets/x.png',
    );
  });
  it('leaves absolute refs and anchors untouched', () => {
    expect(resolveRelativeUrl(base, 'book-en', 'https://cdn.example/x.png')).toBe(
      'https://cdn.example/x.png',
    );
    expect(resolveRelativeUrl(base, 'book-en', '#footnote')).toBe('#footnote');
    expect(resolveRelativeUrl(base, 'book-en', 'data:image/png;base64,AAAA')).toBe(
      'data:image/png;base64,AAAA',
    );
  });
});

describe('markdownToXhtml', () => {
  const base = 'https://raw.githubusercontent.com/o/r/main/';

  it('rewrites relative image URLs and produces well-formed XHTML', () => {
    const xhtml = markdownToXhtml('# Title\n\n![alt](img/x.png)\n\nSome **text**.', {
      rawBase: base,
      fileDir: 'book-en',
    });
    expect(xhtml).toContain('https://raw.githubusercontent.com/o/r/main/book-en/img/x.png');
    // Well-formed: re-parsing as XML must not error.
    const doc = new DOMParser().parseFromString(`<root>${xhtml}</root>`, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
  });
});
