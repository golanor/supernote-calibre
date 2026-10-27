// Pure helpers for file names and destination paths (no device APIs).

import type {Book} from './calibre';

/** Formats the Supernote readers open with PluginFileAPI.openFile. */
export const OPENABLE_FORMATS = new Set(['pdf', 'epub', 'cbz', 'xps', 'fb2']);

const INTERNAL_ROOT = '/storage/emulated/0';
// Internal storage allows 255 bytes per name and exFAT 255 UTF-16 units. 200 UTF-8 bytes
// fits both, with room for the ".part" and ".old" names used while downloading.
const MAX_BYTES = 200;
const MAX_SUFFIX_BYTES = 140;
const MAX_LABEL_BYTES = 100;

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

/** Length in UTF-8 bytes. */
export function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

/** Longest prefix of whole characters that fits in `maxBytes` UTF-8 bytes. */
function truncateBytes(s: string, maxBytes: number): string {
  let out = '';
  let n = 0;
  for (const ch of s) {
    n += utf8Length(ch);
    if (n > maxBytes) {
      break;
    }
    out += ch;
  }
  return out;
}

function trimRight(s: string): string {
  return s.replace(/[. ]+$/, '');
}

/** Short stable hash (FNV-1a, base 36) to tell apart names that sanitizing made equal. */
function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    // eslint-disable-next-line no-bitwise
    h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, '0');
}

/** Strip characters that FAT/exFAT SD cards reject, collapse whitespace, cap the length. */
export function sanitizeName(name: string, maxBytes = MAX_BYTES): string {
  // Truncate before trimming so a cut never leaves a trailing dot or space.
  return trimEnds(truncateBytes(trimEnds(clean(name)), maxBytes)) || 'untitled';
}

/**
 * `<prefix><suffix>.<ext>` within MAX_BYTES: only the prefix is shortened, so the suffix
 * (which makes the name unique) and the extension survive.
 */
function composeName(prefix: string, suffix: string, ext: string): string {
  const e = ext ? sanitizeName(ext, 16).toLowerCase() : '';
  const tail = `${trimRight(truncateBytes(suffix, MAX_SUFFIX_BYTES))}${e ? `.${e}` : ''}`;
  return `${sanitizeName(prefix, MAX_BYTES - utf8Length(tail))}${tail}`;
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
 * (e.g. "vol1/notes.pdf"). When sanitizing or shortening changes the name, a hash of the
 * original path is added, so "vol1/notes.pdf" and "vol1_notes.pdf" stay distinct.
 */
export function dataFileName(book: Book, name: string): string {
  const [stem, ext] = splitExt(name);
  let label = trimEnds(clean(stem));
  if (label !== stem || utf8Length(label) > MAX_LABEL_BYTES) {
    label = `${trimRight(truncateBytes(label, MAX_LABEL_BYTES))} ~${shortHash(name)}`.trim();
  }
  return composeName(book.title, ` [${book.id}] - ${label}`, ext);
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
