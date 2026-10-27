// Client for the calibre Content Server JSON API.
// Endpoints (calibre/src/calibre/srv/{ajax,content,code}.py):
//   /ajax/library-info                       -> libraries
//   /ajax/search/{lib}?query&num&offset&sort -> matching book ids
//   /ajax/books/{lib}?ids=1,2                -> metadata per id
//   /interface-data/book-metadata/{id}       -> includes data_files
//   /get/{fmt}/{id}/{lib}                    -> book file
//   /data-files/get/{id}/{relpath}/{lib}     -> extra data file
//   /get/thumb/{id}/{lib}?sz=WxH             -> cover thumbnail

export type FetchLike = (
  url: string,
  init?: {signal?: AbortSignal; headers?: Record<string, string>},
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}>;

export interface LibraryInfo {
  libraries: {id: string; name: string}[];
  defaultLibrary: string;
}

export interface SearchPage {
  total: number;
  offset: number;
  bookIds: number[];
}

export interface BookFormat {
  format: string; // lower case, e.g. "epub"
  size: number | null; // bytes
}

export interface Book {
  id: number;
  title: string;
  authors: string[];
  formats: BookFormat[];
}

export interface DataFile {
  relpath: string; // e.g. "data/vol1/notes.pdf"
  name: string; // path inside the data folder, e.g. "vol1/notes.pdf"
  size: number | null;
}

export type SortField = 'timestamp' | 'title' | 'author_sort' | 'last_modified';

export class CalibreError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'CalibreError';
  }
}

/** Accept "host", "host:port" or a full URL; return "http(s)://host:port" without a trailing slash. */
export function normalizeServerUrl(input: string): string {
  let url = input.trim();
  if (!url) {
    throw new CalibreError('Server address is empty');
  }
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, '');
}

export class CalibreClient {
  readonly baseUrl: string;

  constructor(
    serverUrl: string,
    private readonly fetchFn: FetchLike,
    private readonly timeoutMs = 15000,
  ) {
    this.baseUrl = normalizeServerUrl(serverUrl);
  }

  private async getJson(path: string): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let res;
    try {
      res = await this.fetchFn(this.baseUrl + path, {
        signal: controller.signal,
        headers: {Accept: 'application/json'},
      });
    } catch (e: any) {
      const reason = controller.signal.aborted ? 'timed out' : e?.message ?? String(e);
      throw new CalibreError(`Cannot reach ${this.baseUrl}: ${reason}`);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      const hint = res.status === 401 ? ' (the server requires a login)' : '';
      throw new CalibreError(`HTTP ${res.status} for ${path}${hint}`, res.status);
    }
    try {
      return await res.json();
    } catch {
      throw new CalibreError(`${this.baseUrl}${path} did not return JSON; is this a calibre server?`);
    }
  }

  async libraryInfo(): Promise<LibraryInfo> {
    const data = await this.getJson('/ajax/library-info');
    const map: Record<string, string> = data?.library_map ?? {};
    return {
      libraries: Object.entries(map).map(([id, name]) => ({id, name})),
      defaultLibrary: data?.default_library ?? Object.keys(map)[0] ?? '',
    };
  }

  async search(
    library: string,
    opts: {query?: string; offset?: number; num?: number; sort?: SortField} = {},
  ): Promise<SearchPage> {
    const params = new URLSearchParams({
      query: opts.query ?? '',
      offset: String(opts.offset ?? 0),
      num: String(opts.num ?? 20),
      sort: opts.sort ?? 'timestamp',
      sort_order: opts.sort === 'title' || opts.sort === 'author_sort' ? 'asc' : 'desc',
    });
    const data = await this.getJson(`/ajax/search/${enc(library)}?${params}`);
    return {
      total: data?.total_num ?? 0,
      offset: data?.offset ?? 0,
      bookIds: data?.book_ids ?? [],
    };
  }

  /** Metadata for the given ids, in the same order. Ids the server hides are dropped. */
  async books(library: string, ids: number[]): Promise<Book[]> {
    if (ids.length === 0) {
      return [];
    }
    const data = await this.getJson(
      `/ajax/books/${enc(library)}?ids=${ids.join(',')}&category_urls=false`,
    );
    const out: Book[] = [];
    for (const id of ids) {
      const b = data?.[String(id)];
      if (b) {
        out.push(parseBook(id, b));
      }
    }
    return out;
  }

  async dataFiles(library: string, bookId: number): Promise<DataFile[]> {
    const data = await this.getJson(
      `/interface-data/book-metadata/${bookId}?library_id=${enc(library)}`,
    );
    const files: Record<string, {size?: number}> = data?.data_files ?? {};
    return Object.entries(files)
      .map(([relpath, stat]) => ({
        relpath,
        name: relpath.replace(/^data\//, ''),
        size: typeof stat?.size === 'number' ? stat.size : null,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  formatUrl(library: string, bookId: number, format: string): string {
    return `${this.baseUrl}/get/${enc(format.toLowerCase())}/${bookId}/${enc(library)}`;
  }

  dataFileUrl(library: string, bookId: number, relpath: string): string {
    return `${this.baseUrl}/data-files/get/${bookId}/${enc(relpath)}/${enc(library)}`;
  }

  thumbnailUrl(library: string, bookId: number, width = 60, height = 80): string {
    return `${this.baseUrl}/get/thumb/${bookId}/${enc(library)}?sz=${width}x${height}`;
  }
}

function enc(s: string): string {
  return encodeURIComponent(s);
}

function parseBook(id: number, b: any): Book {
  const meta: Record<string, {size?: number}> = b.format_metadata ?? {};
  const formats: string[] = b.formats ?? Object.keys(meta);
  return {
    id,
    title: b.title ?? `Book ${id}`,
    authors: Array.isArray(b.authors) ? b.authors : [],
    formats: formats.map(f => ({
      format: f.toLowerCase(),
      size: typeof meta[f.toLowerCase()]?.size === 'number' ? meta[f.toLowerCase()].size! : null,
    })),
  };
}
