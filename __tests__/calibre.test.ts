import {CalibreClient, CalibreError, normalizeServerUrl, type FetchLike} from '../src/calibre';

function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): FetchLike {
  return async url => {
    calls.push(url);
    const path = url.replace('http://nas:8080', '');
    if (!(path in routes)) {
      return {ok: false, status: 404, json: async () => ({})};
    }
    return {ok: true, status: 200, json: async () => routes[path]};
  };
}

describe('normalizeServerUrl', () => {
  it('adds http:// and strips trailing slashes', () => {
    expect(normalizeServerUrl(' 192.168.1.5:8080/ ')).toBe('http://192.168.1.5:8080');
    expect(normalizeServerUrl('https://books.example/')).toBe('https://books.example');
  });
  it('rejects an empty address', () => {
    expect(() => normalizeServerUrl('  ')).toThrow(CalibreError);
  });
});

describe('CalibreClient', () => {
  it('reads the library map and default library', async () => {
    const c = new CalibreClient(
      'nas:8080',
      fakeFetch({
        '/ajax/library-info': {
          library_map: {Calibre_Library: 'Calibre Library', Papers: 'Papers'},
          default_library: 'Papers',
        },
      }),
    );
    expect(await c.libraryInfo()).toEqual({
      libraries: [
        {id: 'Calibre_Library', name: 'Calibre Library'},
        {id: 'Papers', name: 'Papers'},
      ],
      defaultLibrary: 'Papers',
    });
  });

  it('builds the search query and parses the page', async () => {
    const calls: string[] = [];
    const c = new CalibreClient(
      'nas:8080',
      fakeFetch(
        {
          '/ajax/search/Papers?query=author%3Aknuth&offset=12&num=12&sort=title&sort_order=asc': {
            total_num: 30,
            offset: 12,
            book_ids: [7, 3],
          },
        },
        calls,
      ),
    );
    const page = await c.search('Papers', {query: 'author:knuth', offset: 12, num: 12, sort: 'title'});
    expect(page).toEqual({total: 30, offset: 12, bookIds: [7, 3]});
  });

  it('returns books in the requested order with format sizes, dropping hidden ids', async () => {
    const c = new CalibreClient(
      'nas:8080',
      fakeFetch({
        '/ajax/books/L?ids=2,1,9&category_urls=false': {
          '1': {
            title: 'TAOCP',
            authors: ['Donald Knuth'],
            formats: ['epub', 'pdf'],
            format_metadata: {epub: {size: 1000}, pdf: {size: 2048}},
          },
          '2': {title: 'Untitled', authors: [], formats: [], format_metadata: {}},
          '9': null,
        },
      }),
    );
    const books = await c.books('L', [2, 1, 9]);
    expect(books.map(b => b.id)).toEqual([2, 1]);
    expect(books[1]).toEqual({
      id: 1,
      title: 'TAOCP',
      authors: ['Donald Knuth'],
      formats: [
        {format: 'epub', size: 1000},
        {format: 'pdf', size: 2048},
      ],
    });
  });

  it('skips the request when there are no ids', async () => {
    const calls: string[] = [];
    const c = new CalibreClient('nas:8080', fakeFetch({}, calls));
    expect(await c.books('L', [])).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('lists data files sorted by name', async () => {
    const c = new CalibreClient(
      'nas:8080',
      fakeFetch({
        '/interface-data/book-metadata/5?library_id=L': {
          data_files: {'data/z.pdf': {size: 10}, 'data/a.txt': {size: 3}},
        },
      }),
    );
    expect(await c.dataFiles('L', 5)).toEqual([
      {relpath: 'data/a.txt', name: 'a.txt', size: 3},
      {relpath: 'data/z.pdf', name: 'z.pdf', size: 10},
    ]);
  });

  it('builds download URLs with encoded path segments', () => {
    const c = new CalibreClient('nas:8080', fakeFetch({}));
    expect(c.formatUrl('My Library', 4, 'EPUB')).toBe('http://nas:8080/get/epub/4/My%20Library');
    expect(c.dataFileUrl('L', 4, 'data/notes v2.pdf')).toBe(
      'http://nas:8080/data-files/get/4/data%2Fnotes%20v2.pdf/L',
    );
  });

  it('reports HTTP errors and unreachable servers', async () => {
    const c = new CalibreClient('nas:8080', fakeFetch({}));
    await expect(c.libraryInfo()).rejects.toThrow('HTTP 404');
    const down = new CalibreClient('nas:8080', async () => {
      throw new Error('Network request failed');
    });
    await expect(down.libraryInfo()).rejects.toThrow('Cannot reach http://nas:8080');
  });
});
