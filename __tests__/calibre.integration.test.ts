/**
 * Runs the client against a real calibre-server. Skipped unless CALIBRE_URL is set, e.g.
 *   CALIBRE_URL=http://localhost:8099 npx jest calibre.integration
 * scripts/calibre-test-server.sh builds a matching test library (one book with an EPUB,
 * a PDF and a data file).
 */
import {CalibreClient} from '../src/calibre';

const url = process.env.CALIBRE_URL;
const maybe = url ? describe : describe.skip;

maybe('calibre-server integration', () => {
  let client: CalibreClient;
  beforeAll(() => {
    client = new CalibreClient(url!, (u, init) => fetch(u, init as RequestInit));
  });

  it('walks library → search → books → data files → downloads', async () => {
    const info = await client.libraryInfo();
    expect(info.libraries.length).toBeGreaterThan(0);
    const lib = info.defaultLibrary;

    const page = await client.search(lib, {query: 'title:"Test Book"'});
    expect(page.total).toBe(1);

    const [book] = await client.books(lib, page.bookIds);
    expect(book.title).toBe('Test Book');
    expect(book.authors).toEqual(['Ada Tester']);
    expect(book.formats.map(f => f.format).sort()).toEqual(['epub', 'pdf']);
    expect(book.formats.every(f => (f.size ?? 0) > 0)).toBe(true);

    for (const f of book.formats) {
      const res = await fetch(client.formatUrl(lib, book.id, f.format));
      expect(res.status).toBe(200);
      // calibre embeds current metadata into EPUBs as it serves them, so the reported
      // size is approximate; it must still be the same file.
      const bytes = (await res.arrayBuffer()).byteLength;
      expect(Math.abs(bytes - (f.size ?? 0))).toBeLessThan(4096);
    }

    const files = await client.dataFiles(lib, book.id);
    expect(files.map(d => d.name)).toEqual(['notes v2.txt']);
    const res = await fetch(client.dataFileUrl(lib, book.id, files[0].relpath));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('data file contents\n');

    const thumb = await fetch(client.thumbnailUrl(lib, book.id));
    expect(thumb.status).toBe(200);
  });

  it('paginates with offset and sorts by title', async () => {
    const lib = (await client.libraryInfo()).defaultLibrary;
    const first = await client.search(lib, {num: 1, sort: 'title'});
    const second = await client.search(lib, {num: 1, offset: 1, sort: 'title'});
    expect(first.total).toBeGreaterThanOrEqual(2);
    expect(first.bookIds).toHaveLength(1);
    expect(second.bookIds[0]).not.toBe(first.bookIds[0]);
  });
});
