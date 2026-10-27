import {
  bookFileName,
  dataFileName,
  extension,
  formatSize,
  isOpenable,
  joinPath,
  sanitizeName,
  storageRoots,
  utf8Length,
} from '../src/paths';

const book = {id: 1, title: 'Quantum: Codes / Errors?', authors: ['A. Kitaev', 'B. Other'], formats: []};

describe('file names', () => {
  it('removes characters FAT rejects and trims dots and spaces', () => {
    expect(sanitizeName('a/b\\c:d*e?f"g<h>i|j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(sanitizeName('  ..hidden. ')).toBe('hidden');
    expect(sanitizeName('\u0001')).toBe('untitled');
    expect(sanitizeName('x'.repeat(300))).toHaveLength(200);
  });
  it('keeps non-Latin titles', () => {
    expect(sanitizeName('ספר בעברית')).toBe('ספר בעברית');
  });
  it('names books "Title - First Author [id].ext"', () => {
    expect(bookFileName(book, 'EPUB')).toBe('Quantum_ Codes _ Errors_ - A. Kitaev [1].epub');
    expect(bookFileName({...book, authors: []}, 'pdf')).toBe('Quantum_ Codes _ Errors_ [1].pdf');
  });
  it('keeps same-titled books apart', () => {
    const a = {id: 1, title: 'Collected Papers', authors: ['A. Author'], formats: []};
    expect(bookFileName(a, 'pdf')).not.toBe(bookFileName({...a, id: 2}, 'pdf'));
  });
  it('names data files "Title [id] - name", keeping sub-folders distinct', () => {
    expect(dataFileName(book, 'notes.pdf')).toBe('Quantum_ Codes _ Errors_ [1] - notes.pdf');
    expect(dataFileName(book, 'vol1/notes.pdf')).not.toBe(dataFileName(book, 'vol2/notes.pdf'));
  });
  it('shortens only the title, never the id, attachment name or extension', () => {
    const long = {...book, title: 'T'.repeat(300)};
    const f = bookFileName(long, 'pdf');
    expect(utf8Length(f)).toBeLessThanOrEqual(200);
    expect(f.endsWith(' [1].pdf')).toBe(true);
    const d = dataFileName(long, 'appendix.pdf');
    expect(utf8Length(d)).toBeLessThanOrEqual(200);
    expect(d.endsWith(' [1] - appendix.pdf')).toBe(true);
    expect(isOpenable(d)).toBe(true);
  });
  it('never ends in a dot or space after truncation', () => {
    const n = sanitizeName('a'.repeat(199) + '. ' + 'b'.repeat(10));
    expect(n.endsWith('.')).toBe(false);
    expect(n.endsWith(' ')).toBe(false);
    expect(n.length).toBeLessThanOrEqual(200);
    const d = dataFileName(book, 'n'.repeat(99) + '. x.pdf');
    expect(d).not.toMatch(/[. ]\.pdf$/);
  });
  it('caps names by UTF-8 bytes, not characters', () => {
    const cjk = {...book, title: '量'.repeat(110)};
    const f = bookFileName(cjk, 'pdf');
    expect(utf8Length(f)).toBeLessThanOrEqual(200);
    expect(utf8Length(`${f}.part`)).toBeLessThanOrEqual(255);
    expect(f.endsWith(' [1].pdf')).toBe(true);
    expect(f).not.toContain('\ufffd');
  });
  it('adds no extension to extensionless data files', () => {
    expect(dataFileName(book, 'README')).toBe('Quantum_ Codes _ Errors_ [1] - README');
  });
  it('keeps data files distinct when sanitizing or shortening would merge them', () => {
    const b = {id: 1, title: 'Book', authors: [], formats: []};
    expect(dataFileName(b, 'a/b.pdf')).not.toBe(dataFileName(b, 'a_b.pdf'));
    expect(dataFileName(b, 'a_b.pdf')).toBe('Book [1] - a_b.pdf');
    const long1 = dataFileName(b, 'x'.repeat(120) + 'a.pdf');
    const long2 = dataFileName(b, 'x'.repeat(120) + 'b.pdf');
    expect(long1).not.toBe(long2);
    expect(long1.endsWith('.pdf')).toBe(true);
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
