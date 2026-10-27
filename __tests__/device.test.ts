// Device layer with the native modules mocked.

const mockFs = {
  exists: jest.fn(),
  mkdir: jest.fn(),
  mv: jest.fn(),
  unlink: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
};
const mockFetch = jest.fn();

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    get fs() {
      return mockFs;
    },
    config: () => ({fetch: (...args: unknown[]) => mockFetch(...args)}),
  },
}));

const mockPluginManager = {
  hasPermission: jest.fn(),
  requestPermission: jest.fn(),
  closePluginView: jest.fn(),
  getPluginDirPath: jest.fn(),
};
const mockPluginFileAPI = {openFile: jest.fn()};
jest.mock('sn-plugin-lib', () => ({
  get PluginManager() {
    return mockPluginManager;
  },
  get PluginFileAPI() {
    return mockPluginFileAPI;
  },
  FileUtils: {getExternalDirPath: jest.fn()},
}));

import {destinationDir, download, ensurePermissions, openInReader} from '../src/device';

/** A blob-util task: an awaitable with progress() and cancel(). */
function fakeTask(result: Promise<{info(): {status: number}}>) {
  const task: any = result;
  task.progress = jest.fn();
  task.cancel = jest.fn();
  return task;
}

const deferred = <T>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return {promise, resolve};
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFs.exists.mockResolvedValue(false);
  mockFs.mkdir.mockResolvedValue(undefined);
  mockFs.mv.mockResolvedValue(true);
  mockFs.unlink.mockResolvedValue(undefined);
});

describe('download', () => {
  it('streams to .part and moves it into place', async () => {
    mockFetch.mockReturnValue(fakeTask(Promise.resolve({info: () => ({status: 200})})));
    const path = await download('http://s/get/pdf/1/L', '/sd/Doc', 'a.pdf', () => {}).promise;
    expect(path).toBe('/sd/Doc/a.pdf');
    expect(mockFs.mv).toHaveBeenCalledWith('/sd/Doc/a.pdf.part', '/sd/Doc/a.pdf');
  });

  it('honours a cancel that arrives before the native task exists', async () => {
    const mkdir = deferred<void>();
    mockFs.mkdir.mockReturnValue(mkdir.promise);
    const h = download('http://s/x', '/sd/Doc', 'a.pdf', () => {});
    h.cancel();
    mkdir.resolve();
    await expect(h.promise).rejects.toThrow('Cancelled');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(mockFs.mv).not.toHaveBeenCalled();
  });

  it('does not commit a download cancelled after the transfer finished', async () => {
    const done = deferred<{info(): {status: number}}>();
    mockFetch.mockReturnValue(fakeTask(done.promise));
    const h = download('http://s/x', '/sd/Doc', 'a.pdf', () => {});
    await Promise.resolve();
    await Promise.resolve();
    h.cancel();
    done.resolve({info: () => ({status: 200})});
    await expect(h.promise).rejects.toThrow('Cancelled');
    expect(mockFs.mv).not.toHaveBeenCalled();
  });

  it('removes the .part file on HTTP errors and failed moves', async () => {
    mockFs.exists.mockImplementation(async (p: string) => p.endsWith('.part'));
    mockFetch.mockReturnValue(fakeTask(Promise.resolve({info: () => ({status: 404})})));
    await expect(download('http://s/x', '/d', 'a.pdf', () => {}).promise).rejects.toThrow('HTTP 404');
    expect(mockFs.unlink).toHaveBeenCalledWith('/d/a.pdf.part');

    mockFs.unlink.mockClear();
    mockFs.mv.mockResolvedValue(false);
    mockFetch.mockReturnValue(fakeTask(Promise.resolve({info: () => ({status: 200})})));
    await expect(download('http://s/x', '/d', 'a.pdf', () => {}).promise).rejects.toThrow(
      'Could not move',
    );
    expect(mockFs.unlink).toHaveBeenCalledWith('/d/a.pdf.part');
  });
});

describe('openInReader', () => {
  it('surfaces SDK failures and keeps the plugin open', async () => {
    mockPluginFileAPI.openFile.mockResolvedValue({success: false, error: {message: 'no such file'}});
    await expect(openInReader('/sd/a.pdf')).rejects.toThrow('no such file');
    expect(mockPluginManager.closePluginView).not.toHaveBeenCalled();
  });
  it('closes the plugin after a successful open', async () => {
    mockPluginFileAPI.openFile.mockResolvedValue({success: true, result: true});
    await openInReader('/sd/a.pdf');
    expect(mockPluginManager.closePluginView).toHaveBeenCalled();
  });
});

describe('ensurePermissions', () => {
  it('treats "always allow" as granted', async () => {
    mockPluginManager.hasPermission.mockResolvedValue(2);
    expect(await ensurePermissions(['p'])).toEqual([]);
    expect(mockPluginManager.requestPermission).not.toHaveBeenCalled();
  });

  it('runs overlapping calls one after the other', async () => {
    let open = 0;
    let maxOpen = 0;
    mockPluginManager.hasPermission.mockResolvedValue(0);
    mockPluginManager.requestPermission.mockImplementation(async () => {
      maxOpen = Math.max(maxOpen, ++open);
      await new Promise(r => setTimeout(r, 5));
      open--;
      return 1;
    });
    const [a, b] = await Promise.all([ensurePermissions(['p']), ensurePermissions(['p'])]);
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(maxOpen).toBe(1);
  });

  it('reports what the user refused', async () => {
    mockPluginManager.hasPermission.mockResolvedValue(0);
    mockPluginManager.requestPermission.mockResolvedValue(0);
    expect(await ensurePermissions(['a', 'b'])).toEqual(['a', 'b']);
  });
});

it('gives every library its own folder', () => {
  expect(
    destinationDir({serverUrl: '', library: 'My Papers', storageRoot: '/sd', folder: 'Document/Calibre'}),
  ).toBe('/sd/Document/Calibre/My Papers');
});
