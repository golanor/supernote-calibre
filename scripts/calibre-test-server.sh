#!/usr/bin/env bash
# Build a throwaway calibre library and serve it for __tests__/calibre.integration.test.ts.
#   scripts/calibre-test-server.sh [calibre bin dir] [port]
# Then: CALIBRE_URL=http://127.0.0.1:<port> npx jest calibre.integration
set -euo pipefail
BIN=${1:-$HOME/opt/calibre}
PORT=${2:-8099}
WORK=$(mktemp -d)
LIB=$WORK/library
export QT_QPA_PLATFORM=offscreen

printf 'Chapter one.\n\nSome text.\n' > "$WORK/book.txt"
"$BIN/ebook-convert" "$WORK/book.txt" "$WORK/book.epub" --title "Test Book" --authors "Ada Tester" >/dev/null
"$BIN/ebook-convert" "$WORK/book.txt" "$WORK/book.pdf" --title "Test Book" --authors "Ada Tester" >/dev/null

id=$("$BIN/calibredb" add --with-library "$LIB" "$WORK/book.epub" | grep -o '[0-9]\+' | tail -1)
"$BIN/calibredb" add_format --with-library "$LIB" "$id" "$WORK/book.pdf"
printf 'Other.\n' > "$WORK/other.txt"
"$BIN/calibredb" add --with-library "$LIB" --title "Another Book" --authors "Bob Other" "$WORK/other.txt" >/dev/null

# Data files live in a "data" folder inside the book's directory.
book_dir=$(dirname "$(find "$LIB" -name '*.epub' | head -1)")
mkdir -p "$book_dir/data"
printf 'data file contents\n' > "$book_dir/data/notes v2.txt"

echo "library: $LIB"
exec "$BIN/calibre-server" --listen-on 127.0.0.1 --port "$PORT" "$LIB"
