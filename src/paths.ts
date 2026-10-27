// Pure helpers for file names and destination paths (no device APIs).

import type {Book} from './calibre';

/** Formats the Supernote readers open with PluginFileAPI.openFile. */
export const OPENABLE_FORMATS = new Set(['pdf', 'epub', 'cbz', 'xps', 'fb2']);

const INTERNAL_ROOT = '/storage/emulated/0';
const MAX_NAME = 120;

export function isOpenable(fileName: string): boolean {
  return OPENABLE_FORMATS.has(extension(fileName));
}

export function extension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  return dot > 0 ? fileName.slice(dot + 1).toLowerCase() : '';
}

function clean(name: string): string {
  return (
    name
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
  );
}

/** Drop leading dots and trailing dots/spaces, which FAT/exFAT reject or mangle. */
function trimEnds(name: string): string {
  return name.trim().replace(/^\.+/, '').replace(/[. ]+$/, '');
}

/** Strip characters that FAT/exFAT SD cards reject, collapse whitespace, cap the length. */
export function sanitizeName(name: string, max = MAX_NAME): string {
  // Truncate before trimming so a cut never leaves a trailing dot or space.
  return trimEnds(trimEnds(clean(name)).slice(0, max)) || 'untitled';
}

/**
 * `<prefix><suffix>.<ext>` within MAX_NAME: only the prefix is shortened, so the suffix
 * (which makes the name unique) and the extension always survive.
 */
function composeName(prefix: string, suffix: string, ext: string): string {
  const e = sanitizeName(ext, 10).toLowerCase();
  const s = clean(suffix).slice(0, 60);
  const tail = `${s}${e ? `.${e}` : ''}`;
  return `${sanitizeName(prefix, Math.max(1, MAX_NAME - tail.length))}${tail}`;
}

function splitExt(name: string): [string, string] {
  const ext = extension(name);
  return ext ? [name.slice(0, -(ext.length + 1)), ext] : [name, ''];
}

/** "Title - First Author [12].epub"; the calibre id keeps same-titled books apart. */
export function bookFileName(book: Book, format: string): string {
  const author = book.authors[0];
  const prefix = author ? `${book.title} - ${author}` : book.title;
  return composeName(prefix, ` [${book.id}]`, format);
}

/**
 * "Title [12] - notes.pdf". `name` is the data file's path inside the book's data folder
 * (e.g. "vol1/notes.pdf"); sub-folders become part of the name so files don't collide.
 */
export function dataFileName(book: Book, name: string): string {
  const [stem, ext] = splitExt(name);
  return composeName(book.title, ` [${book.id}] - ${trimEnds(clean(stem))}`, ext);
}

export function joinPath(...parts: string[]): string {
  return parts
    .filter(p => p.length > 0)
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

export interface StorageRoot {
  label: string;
  root: string;
  removable: boolean;
}

/** Internal storage plus every external mount the SDK reports (first one labelled "SD card"). */
export function storageRoots(externalDirs: string[] | null | undefined): StorageRoot[] {
  const external = (externalDirs ?? [])
    .filter(d => typeof d === 'string' && d.length > 0 && !d.startsWith(INTERNAL_ROOT))
    .map((root, i) => ({
      label: i === 0 ? 'SD card' : `External ${i + 1}`,
      root: root.replace(/\/+$/, ''),
      removable: true,
    }));
  return [...external, {label: 'Internal', root: INTERNAL_ROOT, removable: false}];
}

export function formatSize(bytes: number | null): string {
  if (bytes === null) {
    return '';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[u]}`;
}
