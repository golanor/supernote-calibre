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

/** Strip characters that FAT/exFAT SD cards reject, collapse whitespace, cap the length. */
export function sanitizeName(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .replace(/[. ]+$/, '');
  return (cleaned || 'untitled').slice(0, MAX_NAME).trim();
}

/** "Title - First Author.epub" */
export function bookFileName(book: Book, format: string): string {
  const author = book.authors[0];
  const stem = author ? `${book.title} - ${author}` : book.title;
  return `${sanitizeName(stem)}.${format.toLowerCase()}`;
}

/** Data files keep their own name, prefixed with the book title so they stay grouped. */
export function dataFileName(book: Book, name: string): string {
  return sanitizeName(`${book.title} - ${name}`);
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
