import React, {useCallback, useEffect, useRef, useState} from 'react';
import {FlatList, Pressable, ScrollView, Text, View} from 'react-native';
import {CalibreClient, type Book, type DataFile, type SortField} from './calibre';
import {
  destinationDir,
  download,
  ensurePermissions,
  fileExists,
  getStorageRoots,
  openInReader,
  PERMISSIONS,
  type DownloadHandle,
  type Settings,
} from './device';
import {bookFileName, dataFileName, formatSize, isOpenable, joinPath, type StorageRoot} from './paths';
import {Button, Field, Header, Message, styles} from './ui';

const PAGE_SIZE = 12;

function errorText(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/network request failed/i.test(msg)) {
    return `${msg}. If the server address starts with http://, Android may be blocking plain HTTP; see the README.`;
  }
  return msg;
}

// ---------------------------------------------------------------- settings

export function SettingsScreen(props: {
  initial: Settings;
  makeClient: (url: string) => CalibreClient;
  onSave: (s: Settings) => void;
  onCancel?: () => void;
}) {
  const [s, setS] = useState<Settings>(props.initial);
  const [libraries, setLibraries] = useState<{id: string; name: string}[]>([]);
  const [roots, setRoots] = useState<StorageRoot[]>([]);
  const [msg, setMsg] = useState<{text: string; error?: boolean} | null>(null);
  const [busy, setBusy] = useState(false);
  // The address the current library choice was read from; Save needs it to match the field.
  const [connectedUrl, setConnectedUrl] = useState(
    props.initial.serverUrl && props.initial.library ? props.initial.serverUrl : '',
  );

  useEffect(() => {
    getStorageRoots().then(r => {
      setRoots(r);
      // Fall back to the first root when the saved one (e.g. a removed SD card) is gone.
      setS(prev =>
        r.some(x => x.root === prev.storageRoot) ? prev : {...prev, storageRoot: r[0].root},
      );
    });
    // Already configured: list the server's libraries so the choice can be changed
    // without reconnecting. Failures are silent; Connect reports them.
    if (connectedUrl) {
      try {
        props
          .makeClient(connectedUrl)
          .libraryInfo()
          .then(info => setLibraries(info.libraries))
          .catch(() => undefined);
      } catch {
        // unusable saved address
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    setMsg({text: 'Connecting…'});
    try {
      if ((await ensurePermissions([PERMISSIONS.internet])).length) {
        throw new Error('Internet permission was not granted');
      }
      const client = props.makeClient(s.serverUrl);
      const info = await client.libraryInfo();
      setLibraries(info.libraries);
      setS(prev => ({
        ...prev,
        serverUrl: client.baseUrl,
        library: info.libraries.some(l => l.id === prev.library) ? prev.library : info.defaultLibrary,
      }));
      setConnectedUrl(client.baseUrl);
      setMsg({text: `Connected: ${info.libraries.length} librar${info.libraries.length === 1 ? 'y' : 'ies'}`});
    } catch (e) {
      setMsg({text: errorText(e), error: true});
    } finally {
      setBusy(false);
    }
  };

  const connected = !!s.serverUrl && s.serverUrl === connectedUrl;
  const canSave = !!(connected && s.library && s.storageRoot && s.folder.trim());

  return (
    <ScrollView style={styles.screen} keyboardShouldPersistTaps="handled">
      <Header title="calibre settings">
        {props.onCancel && <Button label="Back" onPress={props.onCancel} />}
      </Header>
      <Field
        label="Server address (e.g. 192.168.1.20:8080)"
        value={s.serverUrl}
        onChangeText={t => setS({...s, serverUrl: t})}
        keyboardType="url"
      />
      <Button label="Connect" onPress={connect} disabled={busy || !s.serverUrl.trim()} />
      <Message text={msg?.text ?? null} error={msg?.error} />
      {!connected && !!s.serverUrl.trim() && !busy && (
        <Message text="Tap Connect to check this address before saving." />
      )}

      {libraries.length > 1 && (
        <>
          <Text style={styles.section}>Library</Text>
          {libraries.map(l => (
            <View key={l.id} style={styles.choice}>
              <Button
                label={l.name}
                primary={s.library === l.id}
                onPress={() => setS({...s, library: l.id})}
              />
            </View>
          ))}
        </>
      )}

      <Text style={styles.section}>Save downloads to</Text>
      {roots.map(r => (
        <View key={r.root} style={styles.choice}>
          <Button
            label={`${r.label} (${r.root})`}
            primary={s.storageRoot === r.root}
            onPress={() => setS({...s, storageRoot: r.root})}
          />
        </View>
      ))}
      {roots.length > 0 && !roots.some(r => r.removable) && (
        <Message text="No SD card detected; downloads will go to internal storage." />
      )}
      <Field label="Folder" value={s.folder} onChangeText={t => setS({...s, folder: t})} />

      <Button label="Save" primary onPress={() => props.onSave(s)} disabled={!canSave} />
      <View style={styles.spacer} />
    </ScrollView>
  );
}

// ---------------------------------------------------------------- library list

const SORTS: {field: SortField; label: string}[] = [
  {field: 'timestamp', label: 'Newest'},
  {field: 'title', label: 'Title'},
  {field: 'author_sort', label: 'Author'},
];

export function LibraryScreen(props: {
  client: CalibreClient;
  settings: Settings;
  onOpenBook: (b: Book) => void;
  onSettings: () => void;
  onClose: () => void;
}) {
  const {client, settings} = props;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortField>('timestamp');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [books, setBooks] = useState<Book[]>([]);
  const [msg, setMsg] = useState<{text: string; error?: boolean} | null>(null);
  const activeQuery = useRef('');
  const latestRequest = useRef(0);

  const load = useCallback(
    async (q: string, off: number, srt: SortField) => {
      // Only the most recent request may update the screen; slower older ones are dropped.
      const request = ++latestRequest.current;
      const isLatest = () => request === latestRequest.current;
      setMsg({text: 'Loading…'});
      try {
        const page = await client.search(settings.library, {
          query: q,
          offset: off,
          num: PAGE_SIZE,
          sort: srt,
        });
        const found = await client.books(settings.library, page.bookIds);
        if (!isLatest()) {
          return;
        }
        setBooks(found);
        setTotal(page.total);
        setOffset(off);
        setMsg(page.total === 0 ? {text: 'No books found.'} : null);
      } catch (e) {
        if (isLatest()) {
          // Don't leave the previous results on screen under an error for a new request.
          setBooks([]);
          setTotal(0);
          setOffset(0);
          setMsg({text: errorText(e), error: true});
        }
      }
    },
    [client, settings.library],
  );

  useEffect(() => {
    load('', 0, 'timestamp');
  }, [load]);

  const search = () => {
    activeQuery.current = query;
    load(query, 0, sort);
  };

  const last = Math.min(offset + PAGE_SIZE, total);

  return (
    <View style={styles.screen}>
      <Header title="calibre">
        <Button label="Settings" onPress={props.onSettings} />
        <Button label="Close" onPress={props.onClose} />
      </Header>
      <View style={styles.row}>
        <View style={styles.flex1}>
          <Field
            label="Search (calibre syntax, e.g. author:knuth)"
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={search}
            returnKeyType="search"
          />
        </View>
        <Button label="Search" primary onPress={search} />
      </View>
      <View style={styles.row}>
        {SORTS.map(o => (
          <Button
            key={o.field}
            label={o.label}
            primary={sort === o.field}
            onPress={() => {
              setSort(o.field);
              load(activeQuery.current, 0, o.field);
            }}
          />
        ))}
      </View>
      <Message text={msg?.text ?? null} error={msg?.error} />
      <FlatList
        style={styles.list}
        data={books}
        keyExtractor={b => String(b.id)}
        renderItem={({item}) => (
          <Pressable style={styles.listItem} onPress={() => props.onOpenBook(item)}>
            <Text style={styles.itemTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <Text style={styles.itemSub} numberOfLines={1}>
              {[item.authors.join(', '), item.formats.map(f => f.format.toUpperCase()).join(' · ')]
                .filter(Boolean)
                .join('  —  ')}
            </Text>
          </Pressable>
        )}
      />
      {total > 0 && (
        <View style={[styles.row, styles.pager]}>
          <Button
            label="◀ Prev"
            disabled={offset === 0}
            onPress={() => load(activeQuery.current, Math.max(0, offset - PAGE_SIZE), sort)}
          />
          <Text style={styles.itemSub}>
            {offset + 1}–{last} of {total}
          </Text>
          <Button
            label="Next ▶"
            disabled={last >= total}
            onPress={() => load(activeQuery.current, offset + PAGE_SIZE, sort)}
          />
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------- one book

interface Item {
  key: string;
  label: string;
  size: number | null;
  url: string;
  fileName: string;
}

export function BookScreen(props: {
  client: CalibreClient;
  settings: Settings;
  book: Book;
  onBack: () => void;
}) {
  const {client, settings, book} = props;
  const dir = destinationDir(settings);
  const [dataFiles, setDataFiles] = useState<DataFile[]>([]);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [progress, setProgress] = useState<{key: string; text: string} | null>(null);
  const [msg, setMsg] = useState<{text: string; error?: boolean} | null>(null);
  const handle = useRef<DownloadHandle | null>(null);
  const busy = useRef(false);

  const formats: Item[] = book.formats.map(f => ({
    key: `fmt:${f.format}`,
    label: f.format.toUpperCase(),
    size: f.size,
    url: client.formatUrl(settings.library, book.id, f.format),
    fileName: bookFileName(book, f.format),
  }));
  const extras: Item[] = dataFiles.map(d => ({
    key: `data:${d.relpath}`,
    label: d.name,
    size: d.size,
    url: client.dataFileUrl(settings.library, book.id, d.relpath),
    fileName: dataFileName(book, d.name),
  }));
  const all = [...formats, ...extras];
  const allKey = all.map(i => i.key).join('|');

  useEffect(() => {
    client
      .dataFiles(settings.library, book.id)
      .then(setDataFiles)
      .catch(() => setDataFiles([]));
  }, [client, settings.library, book.id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(
        all.map(async i => [i.key, await fileExists(joinPath(dir, i.fileName))] as const),
      );
      if (alive) {
        setPresent(Object.fromEntries(entries));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allKey, dir]);

  useEffect(() => () => handle.current?.cancel(), []);

  const start = async (item: Item) => {
    // A ref, not state: a second tap before the next render must see the first one.
    if (busy.current) {
      return;
    }
    busy.current = true;
    setMsg(null);
    setProgress({key: item.key, text: 'Checking permissions…'});
    try {
      const missing = await ensurePermissions([PERMISSIONS.internet, PERMISSIONS.write]);
      if (missing.length) {
        setMsg({text: `Permission not granted: ${missing.join(', ')}`, error: true});
        return;
      }
      setProgress({key: item.key, text: 'Starting…'});
      handle.current = download(item.url, dir, item.fileName, (received, total) => {
        const pct = total > 0 ? ` (${Math.round((100 * received) / total)}%)` : '';
        setProgress({key: item.key, text: `${formatSize(received)}${pct}`});
      });
      const path = await handle.current.promise;
      setPresent(p => ({...p, [item.key]: true}));
      setMsg({text: `Saved to ${path}`});
    } catch (e) {
      setMsg({text: `Download failed: ${errorText(e)}`, error: true});
    } finally {
      handle.current = null;
      busy.current = false;
      setProgress(null);
    }
  };

  const renderItem = (item: Item) => {
    const downloading = progress?.key === item.key;
    const have = present[item.key];
    const path = joinPath(dir, item.fileName);
    return (
      <View key={item.key} style={styles.listItem}>
        <Text style={styles.itemTitle}>
          {item.label}
          {item.size !== null ? `  ·  ${formatSize(item.size)}` : ''}
          {have ? '  ·  on device' : ''}
        </Text>
        <View style={[styles.row, styles.actions]}>
          {downloading ? (
            <>
              <Text style={styles.itemSub}>{progress?.text}</Text>
              <Button label="Cancel" onPress={() => handle.current?.cancel()} />
            </>
          ) : (
            <>
              <Button
                label={have ? 'Download again' : 'Download'}
                primary={!have}
                disabled={!!progress}
                onPress={() => start(item)}
              />
              {have && isOpenable(item.fileName) && (
                <Button
                  label="Open"
                  primary
                  disabled={!!progress}
                  onPress={() =>
                    openInReader(path).catch(e => setMsg({text: errorText(e), error: true}))
                  }
                />
              )}
            </>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.screen}>
      <Header title={book.title}>
        <Button label="Back" onPress={props.onBack} disabled={!!progress} />
      </Header>
      {book.authors.length > 0 && <Text style={styles.itemSub}>{book.authors.join(', ')}</Text>}
      <Text style={styles.itemSub}>Saving to {dir}</Text>
      <Message text={msg?.text ?? null} error={msg?.error} />
      <Text style={styles.section}>Formats</Text>
      {formats.length ? formats.map(renderItem) : <Message text="No book files." />}
      {extras.length > 0 && (
        <>
          <Text style={styles.section}>Data files</Text>
          {extras.map(renderItem)}
        </>
      )}
      <View style={styles.spacer} />
    </ScrollView>
  );
}
