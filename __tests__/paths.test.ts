import {
  bookFileName,
  dataFileName,
  extension,
  formatSize,
  isOpenable,
  joinPath,
  sanitizeName,
  storageRoots,
} from '../src/paths';

const book = {id: 1, title: 'Quantum: Codes / Errors?', authors: ['A. Kitaev', 'B. Other'], formats: []};

describe('file names', () => {
  it('removes characters FAT rejects and trims dots and spaces', () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(sanitizeName('  ..hidden. ')).toBe('hidden');
    expect(sanitizeName('\u0001')).toBe('untitled');
    expect(sanitizeName('x'.repeat(300))).toHaveLength(120);
  });
  it('keeps non-Latin titles', () => {
    expect(sanitizeName('ספר בעברית')).toBe('ספר בעברית');
  });
  it('names books "Title - First Author.ext"', () => {
    expect(bookFileName(book, 'EPUB')).toBe('Quantum_ Codes _ Errors_ - A. Kitaev.epub');
    expect(bookFileName({...book, authors: []}, 'pdf')).toBe('Quantum_ Codes _ Errors_.pdf');
  });
  it('prefixes data files with the title', () => {
    expect(dataFileName(book, 'notes.pdf')).toBe('Quantum_ Codes _ Errors_ - notes.pdf');
  });
  it('detects formats the reader can open', () => {
    expect(extension('a.b.PDF')).toBe('pdf');
    expect(extension('.bashrc')).toBe('');
    expect(isOpenable('x.epub')).toBe(true);
    expect(isOpenable('x.mobi')).toBe(false);
  });
});

describe('paths and storage', () => {
  it('joins without doubled slashes', () => {
    expect(joinPath('/storage/ABCD-1234/', '/Document/Calibre/', 'x.pdf')).toBe(
      '/storage/ABCD-1234/Document/Calibre/x.pdf',
    );
    expect(joinPath('/a', '', 'b')).toBe('/a/b');
  });
  it('lists the SD card first and always offers internal storage', () => {
    expect(storageRoots(['/storage/ABCD-1234/', '/storage/emulated/0'])).toEqual([
      {label: 'SD card', root: '/storage/ABCD-1234', removable: true},
      {label: 'Internal', root: '/storage/emulated/0', removable: false},
    ]);
    expect(storageRoots(null)).toEqual([
      {label: 'Internal', root: '/storage/emulated/0', removable: false},
    ]);
  });
  it('formats sizes', () => {
    expect(formatSize(null)).toBe('');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(25 * 1024 * 1024)).toBe('25 MB');
  });
});
