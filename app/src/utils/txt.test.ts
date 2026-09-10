import { describe, it, expect } from 'vitest';
import { TextWriter, Uint8ArrayReader, ZipReader } from '@zip.js/zip.js';
import { TxtToEpubConverter } from './txt';

describe('TxtToEpubConverter.convertChapters', () => {
  it('produces a valid multi-chapter EPUB with a TOC', async () => {
    const converter = new TxtToEpubConverter();
    const file = await converter.convertChapters({
      bookTitle: 'My Book',
      author: 'Tester',
      language: 'zh-CN',
      identifier: 'github:o/r',
      chapters: [
        { title: 'Introduction', content: '<h1>Introduction</h1><p>Hello &amp; welcome.</p>' },
        { title: 'Chapter 1', content: '<h1>Chapter 1</h1><p>Body</p>' },
      ],
    });

    expect(file.name).toBe('My Book.epub');
    expect(file.size).toBeGreaterThan(0);

    const bytes = new Uint8Array(await file.arrayBuffer());
    // Zip local-file-header signature "PK\x03\x04".
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);

    const reader = new ZipReader(new Uint8ArrayReader(bytes));
    const entries = await reader.getEntries();
    const names = entries.map((e) => e.filename);
    expect(names).toContain('mimetype');
    expect(names).toContain('content.opf');
    expect(names).toContain('toc.ncx');
    expect(names).toContain('OEBPS/chapter1.xhtml');
    expect(names).toContain('OEBPS/chapter2.xhtml');

    type DataEntry = { getData: (writer: TextWriter) => Promise<string> };
    const read = (name: string) =>
      (entries.find((e) => e.filename === name) as unknown as DataEntry).getData(new TextWriter());

    const opf = await read('content.opf');
    expect(opf).toContain('<dc:title>My Book</dc:title>');
    expect(opf).toContain('<dc:language>zh-CN</dc:language>');

    const toc = await read('toc.ncx');
    expect(toc).toContain('Introduction');
    expect(toc).toContain('Chapter 1');

    const chapter1 = await read('OEBPS/chapter1.xhtml');
    expect(chapter1).toContain('Hello &amp; welcome.');

    await reader.close();
  });

  it('rejects an empty chapter list', async () => {
    const converter = new TxtToEpubConverter();
    await expect(
      converter.convertChapters({ bookTitle: 'Empty', chapters: [] }),
    ).rejects.toThrow(/no chapters/i);
  });
});
