# supernote-calibre

A [Supernote](https://supernote.com) plugin that connects to a [calibre](https://calibre-ebook.com) Content Server on your local network. It lets you search and browse your library and download books, and the data files attached to them, to the device's **SD card** or internal storage. PDF and EPUB downloads can be opened in the reader straight from the plugin.

Built with React Native 0.79.2, the [Supernote plugin SDK](https://docs.supernote.com/en) (`sn-plugin-lib`) and [`react-native-blob-util`](https://github.com/RonRadtke/react-native-blob-util).

## Features

- Connect to `http://<host>:<port>`, with a library picker for multi-library servers.
- Search with calibre's own syntax (`author:knuth`, `tags:physics`, `title:"…"`), sort by newest, title or author, and page through results with Prev/Next. There is no scrolling, which keeps the e-ink screen quiet.
- Book page: every format with its size, plus the book's **data files** (calibre's per-book `data/` folder).
- Downloads go to `<storage>/<folder>/<library>`. The default is `<SD card>/Document/Calibre/<library>`. Each download is written to a `.part` file and renamed when it finishes, so a cancelled download leaves nothing behind.
- File names: `Title - First Author [id].ext` and `Title [id] - attachment.ext` for data files. The calibre id keeps books with the same title apart. Characters that FAT/exFAT reject are replaced, and long titles are shortened without touching the id or the extension.
- Opens PDF, EPUB, CBZ, XPS and FB2 in the Supernote reader.

## calibre server setup

In calibre, open **Preferences → Sharing over the net** and click **Start server**. Then:

- Note the port (default 8080), and allow it through the computer's firewall.
- Optionally tick "Run server automatically when calibre starts".
- The plugin currently supports servers **without** authentication.

Or run it headless: `calibre-server --port 8080 /path/to/library`.

## Install

1. Build `build/outputs/SupernoteCalibre.snplg` (below), or download it from the releases.
2. Copy it to the `MyStyle` folder on the Supernote.
3. Go to **Settings → Apps → Plugins → Add Plugin** and select it.
4. A **calibre** button appears in the NOTE and DOC toolbars. On first open, enter the server address, tap **Connect**, choose where to save, and tap **Save**.

The plugin asks for three permissions: **internet**, **file read** and **file write**. If you choose "Allow this time only", it asks again the next time it opens.

## Plain HTTP

Android blocks unencrypted HTTP for many apps by default. The plugin runs inside Supernote's PluginHost, so PluginHost's network policy decides whether `http://192.168.x.x` is allowed. If **Connect** fails with "Network request failed", put calibre behind HTTPS with a certificate the device trusts, for example a reverse proxy such as Caddy on a hostname you control.

## Build

You need Node ≥ 18, JDK 21 and the Android SDK (platform 35, build-tools 35.0.0, NDK 27.1.12297006). `react-native-blob-util` contains native code, so `buildPlugin.sh` compiles an APK and puts it inside the plugin package.

```bash
npm ci
export JAVA_HOME=/path/to/jdk21 ANDROID_HOME=/path/to/android-sdk
./buildPlugin.sh        # → build/outputs/SupernoteCalibre.snplg
```

Keep `pluginID` in `PluginConfig.json` unchanged. The device uses it to recognise updates to the same plugin.

## Tests

```bash
npm test                # unit tests (client, file names, paths)
npm run typecheck && npm run lint

# integration test against a real calibre-server (Linux calibre build in ~/opt/calibre):
scripts/calibre-test-server.sh ~/opt/calibre 8099 &
CALIBRE_URL=http://127.0.0.1:8099 npx jest calibre.integration
```

## Layout

| Path | What |
|---|---|
| `index.js` | Plugin entry: SDK init and toolbar button registration |
| `App.tsx` | Screen routing and permission checks on every open |
| `src/calibre.ts` | calibre Content Server client (no device APIs, unit-tested) |
| `src/paths.ts` | File names, path joining, storage roots |
| `src/device.ts` | Permissions, SD card detection, settings file, downloads, opening files |
| `src/screens.tsx`, `src/ui.tsx` | Settings, library and book screens; e-ink styling |

SD card detection uses `FileUtils.getExternalDirPath()`. `sn-plugin-lib` exports it, but the SDK documentation does not cover it.

## License

MIT
