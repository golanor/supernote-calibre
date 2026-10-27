// Device glue: permissions, storage roots, settings file, downloads, opening files.
// Everything that touches sn-plugin-lib or react-native-blob-util lives here.

import ReactNativeBlobUtil from 'react-native-blob-util';
import {FileUtils, PluginFileAPI, PluginManager} from 'sn-plugin-lib';
import {joinPath, sanitizeName, storageRoots, type StorageRoot} from './paths';

export const PERMISSIONS = {
  internet: 'plugin.permission.INTERNET',
  read: 'plugin.permission.FILE:READ',
  write: 'plugin.permission.FILE:WRITE',
} as const;

const GRANTED_NOW = 1;
const GRANTED_ALWAYS = 2;

function granted(status: number): boolean {
  return status === GRANTED_NOW || status === GRANTED_ALWAYS;
}

// Permission checks run one at a time so overlapping callers never stack dialogs.
let permissionQueue: Promise<unknown> = Promise.resolve();

/**
 * Check and, if needed, request each permission. "Allow this time only" expires when the
 * plugin closes, so call this every time the plugin opens and before every download.
 * Returns the permissions that are still missing.
 */
export function ensurePermissions(
  wanted: string[] = Object.values(PERMISSIONS),
): Promise<string[]> {
  const run = async () => {
    const missing: string[] = [];
    for (const p of wanted) {
      if (granted(await PluginManager.hasPermission(p))) {
        continue;
      }
      if (!granted(await PluginManager.requestPermission(p, describePermission(p)))) {
        missing.push(p);
      }
    }
    return missing;
  };
  const result = permissionQueue.then(run, run);
  permissionQueue = result.catch(() => undefined);
  return result;
}

function describePermission(p: string): string {
  switch (p) {
    case PERMISSIONS.internet:
      return 'Needed to reach your calibre server on the local network.';
    case PERMISSIONS.write:
      return 'Needed to save downloaded books to the SD card or internal storage.';
    default:
      return 'Needed to check which books are already downloaded.';
  }
}

export async function getStorageRoots(): Promise<StorageRoot[]> {
  let external: string[] | null | undefined = null;
  try {
    external = await FileUtils.getExternalDirPath();
  } catch {
    // Undocumented API; fall back to internal storage only.
  }
  return storageRoots(external);
}

// ---------- settings (stored in the plugin's private directory, no permission needed)

export interface Settings {
  serverUrl: string;
  library: string;
  storageRoot: string; // absolute root chosen from getStorageRoots()
  folder: string; // relative folder under the root, e.g. "Document/Calibre"
}

export const DEFAULT_SETTINGS: Settings = {
  serverUrl: '',
  library: '',
  storageRoot: '',
  folder: 'Document/Calibre',
};

async function settingsPath(): Promise<string> {
  const dir = await PluginManager.getPluginDirPath();
  if (!dir) {
    throw new Error('Plugin directory is unavailable');
  }
  return joinPath(dir, 'settings.json');
}

export async function loadSettings(): Promise<Settings> {
  try {
    const path = await settingsPath();
    if (!(await ReactNativeBlobUtil.fs.exists(path))) {
      return {...DEFAULT_SETTINGS};
    }
    const raw = await ReactNativeBlobUtil.fs.readFile(path, 'utf8');
    return {...DEFAULT_SETTINGS, ...JSON.parse(raw)};
  } catch {
    return {...DEFAULT_SETTINGS};
  }
}

export async function saveSettings(s: Settings): Promise<void> {
  await ReactNativeBlobUtil.fs.writeFile(await settingsPath(), JSON.stringify(s), 'utf8');
}

// ---------- downloads

/** `<root>/<folder>/<library>`: book ids are per library, so each library gets its own folder. */
export function destinationDir(s: Settings): string {
  return joinPath(s.storageRoot, s.folder, sanitizeName(s.library));
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    return await ReactNativeBlobUtil.fs.exists(path);
  } catch {
    return false;
  }
}

export interface DownloadHandle {
  promise: Promise<string>;
  cancel(): void;
}

/**
 * Stream `url` to `dir/fileName`. Writes to a ".part" file first and renames on success,
 * so an interrupted download never leaves a truncated book behind.
 */
export function download(
  url: string,
  dir: string,
  fileName: string,
  onProgress: (received: number, total: number) => void,
): DownloadHandle {
  const target = joinPath(dir, fileName);
  const part = `${target}.part`;
  let task: ReturnType<ReturnType<typeof ReactNativeBlobUtil.config>['fetch']> | null = null;
  let cancelled = false;

  const checkCancelled = () => {
    if (cancelled) {
      throw new Error('Cancelled');
    }
  };

  const promise = (async () => {
    if (!(await ReactNativeBlobUtil.fs.exists(dir))) {
      await ReactNativeBlobUtil.fs.mkdir(dir);
    }
    checkCancelled();
    try {
      task = ReactNativeBlobUtil.config({path: part, overwrite: true}).fetch('GET', url);
      task.progress({interval: 750}, onProgress);
      let res;
      try {
        res = await task;
      } catch (e: any) {
        checkCancelled();
        throw new Error(e?.message ?? String(e));
      }
      checkCancelled();
      const status = res.info().status;
      if (status !== 200) {
        throw new Error(`Server answered HTTP ${status}`);
      }
      await removeQuietly(target);
      if (!(await ReactNativeBlobUtil.fs.mv(part, target))) {
        throw new Error(`Could not move the download into ${target}`);
      }
      return target;
    } finally {
      // After a successful move the .part file no longer exists; otherwise drop it.
      await removeQuietly(part);
    }
  })();

  return {
    promise,
    cancel() {
      cancelled = true;
      task?.cancel();
    },
  };
}

async function removeQuietly(path: string): Promise<void> {
  try {
    if (await ReactNativeBlobUtil.fs.exists(path)) {
      await ReactNativeBlobUtil.fs.unlink(path);
    }
  } catch {
    // best effort
  }
}

/** Open in the Supernote reader; the SDK reports failure in the response instead of throwing. */
export async function openInReader(path: string): Promise<void> {
  const res = (await PluginFileAPI.openFile(path, -1)) as {
    success?: boolean;
    result?: boolean;
    error?: {message?: string};
  } | null;
  if (!res?.success || res.result === false) {
    throw new Error(res?.error?.message ?? `Could not open ${path}`);
  }
  await PluginManager.closePluginView();
}

export async function closePlugin(): Promise<void> {
  await PluginManager.closePluginView();
}
