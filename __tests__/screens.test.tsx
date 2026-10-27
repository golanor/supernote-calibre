import React from 'react';
import ReactTestRenderer, {act} from 'react-test-renderer';
import {Pressable, Text} from 'react-native';
import type {Book, CalibreClient, SearchPage} from '../src/calibre';

const mockDevice = {
  ensurePermissions: jest.fn(),
  getStorageRoots: jest.fn(),
  fileExists: jest.fn(),
  download: jest.fn(),
  openInReader: jest.fn(),
};
jest.mock('../src/device', () => ({
  PERMISSIONS: {internet: 'i', read: 'r', write: 'w'},
  destinationDir: () => '/sd/Document/Calibre/L',
  ensurePermissions: (...a: unknown[]) => mockDevice.ensurePermissions(...a),
  getStorageRoots: (...a: unknown[]) => mockDevice.getStorageRoots(...a),
  fileExists: (...a: unknown[]) => mockDevice.fileExists(...a),
  download: (...a: unknown[]) => mockDevice.download(...a),
  openInReader: (...a: unknown[]) => mockDevice.openInReader(...a),
}));

import {BookScreen, LibraryScreen, SettingsScreen} from '../src/screens';

const settings = {serverUrl: 'http://nas:8080', library: 'L', storageRoot: '/sd', folder: 'Document/Calibre'};
const book = (id: number, title = `Book ${id}`): Book => ({
  id,
  title,
  authors: ['A'],
  formats: [{format: 'pdf', size: 10}],
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(r => (resolve = r));
  return {promise, resolve};
}

const texts = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map(t => [].concat(t.props.children).join(''));

const pressButton = (r: ReactTestRenderer.ReactTestRenderer, label: string) => {
  // Press the Pressable the user taps; a disabled Button gives it no onPress.
  const pressable = r.root
    .findAllByType(Pressable)
    .find(n => texts({root: n} as any).includes(label));
  if (!pressable) {
    throw new Error(`no button ${label}`);
  }
  pressable.props.onPress?.();
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDevice.ensurePermissions.mockResolvedValue([]);
  mockDevice.fileExists.mockResolvedValue(false);
  mockDevice.getStorageRoots.mockResolvedValue([
    {label: 'Internal', root: '/storage/emulated/0', removable: false},
  ]);
});

it('LibraryScreen ignores responses that arrive after a newer request', async () => {
  const pages: Record<string, ReturnType<typeof deferred<SearchPage>>> = {
    timestamp: deferred(),
    title: deferred(),
  };
  const client = {
    search: jest.fn((_lib: string, o: {sort: string}) => pages[o.sort].promise),
    books: jest.fn(async (_lib: string, ids: number[]) => ids.map(id => book(id))),
  } as unknown as CalibreClient;

  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <LibraryScreen
        client={client}
        settings={settings}
        onOpenBook={() => {}}
        onSettings={() => {}}
        onClose={() => {}}
      />,
    );
  });
  await act(async () => pressButton(r, 'Title'));
  await act(async () => pages.title.resolve({total: 1, offset: 0, bookIds: [2]}));
  await act(async () => pages.timestamp.resolve({total: 1, offset: 0, bookIds: [1]}));
  expect(texts(r)).toContain('Book 2');
  expect(texts(r)).not.toContain('Book 1');
  await act(async () => r.unmount());
});

it('BookScreen starts only one download for a double tap', async () => {
  const perm = deferred<string[]>();
  mockDevice.ensurePermissions.mockReturnValue(perm.promise);
  mockDevice.download.mockReturnValue({promise: new Promise(() => {}), cancel: jest.fn()});
  const client = {
    dataFiles: jest.fn(async () => []),
    formatUrl: () => 'http://nas:8080/get/pdf/1/L',
    dataFileUrl: () => '',
  } as unknown as CalibreClient;

  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <BookScreen client={client} settings={settings} book={book(1)} onBack={() => {}} />,
    );
  });
  await act(async () => {
    pressButton(r, 'Download');
    pressButton(r, 'Download');
  });
  await act(async () => perm.resolve([]));
  expect(mockDevice.ensurePermissions).toHaveBeenCalledTimes(1);
  expect(mockDevice.download).toHaveBeenCalledTimes(1);
  await act(async () => r.unmount());
});

describe('SettingsScreen', () => {
  const render = async (initial = settings) => {
    const onSave = jest.fn();
    const client = {
      baseUrl: 'http://other:8080',
      libraryInfo: jest.fn(async () => ({libraries: [{id: 'X', name: 'X'}], defaultLibrary: 'X'})),
    };
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      r = ReactTestRenderer.create(
        <SettingsScreen initial={initial} makeClient={() => client as any} onSave={onSave} />,
      );
    });
    return {r, onSave};
  };

  it('replaces a saved storage root that no longer exists (removed SD card)', async () => {
    const {r, onSave} = await render({...settings, storageRoot: '/storage/GONE-0000'});
    await act(async () => pressButton(r, 'Save'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({storageRoot: '/storage/emulated/0'}));
  });

  it('requires Connect after the address changes', async () => {
    const {r, onSave} = await render();
    const input = r.root.findAll(n => n.props.keyboardType === 'url')[0];
    await act(async () => input.props.onChangeText('other:8080'));
    await act(async () => pressButton(r, 'Save'));
    expect(onSave).not.toHaveBeenCalled();
    await act(async () => pressButton(r, 'Connect'));
    await act(async () => pressButton(r, 'Save'));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({serverUrl: 'http://other:8080', library: 'X'}),
    );
  });
});
