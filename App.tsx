/**
 * Plugin UI: settings → library list → book page.
 *
 * @format
 */

import React, {useEffect, useMemo, useState} from 'react';
import {StatusBar, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import {CalibreClient, type Book} from './src/calibre';
import {
  closePlugin,
  ensurePermissions,
  getStorageRoots,
  loadSettings,
  saveSettings,
  type Settings,
} from './src/device';
import {BookScreen, LibraryScreen, SettingsScreen} from './src/screens';
import {Message, styles} from './src/ui';

const LIFECYCLE_START = 2;
const RECHECK_AFTER_MS = 3000;

type Route = {name: 'loading'} | {name: 'settings'} | {name: 'library'} | {name: 'book'; book: Book};

function makeClient(url: string): CalibreClient {
  return new CalibreClient(url, (u, init) => fetch(u, init));
}

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [route, setRoute] = useState<Route>({name: 'loading'});

  useEffect(() => {
    // "Allow this time only" grants expire when the plugin closes, so ask on mount (before
    // the library's first request) and again whenever the plugin returns to the foreground.
    // The start event can also arrive right after mount; skip it then so the user is never
    // asked twice in a row.
    let lastCheck = Date.now();
    Promise.all([loadSettings(), getStorageRoots(), ensurePermissions()]).then(([s, roots]) => {
      setSettings(s);
      // A saved root that is no longer mounted (SD card removed) sends the user to settings,
      // which falls back to an available root.
      const ready = s.serverUrl && s.library && roots.some(r => r.root === s.storageRoot);
      setRoute(ready ? {name: 'library'} : {name: 'settings'});
    });
    const sub = PluginManager.registerPluginLifeListener({
      onMsg(msg: any) {
        if (msg?.state === LIFECYCLE_START && Date.now() - lastCheck > RECHECK_AFTER_MS) {
          lastCheck = Date.now();
          ensurePermissions();
        }
      },
    });
    return () => sub.remove();
  }, []);

  const client = useMemo(() => {
    try {
      return settings?.serverUrl ? makeClient(settings.serverUrl) : null;
    } catch {
      return null; // unusable address: the settings screen is shown instead
    }
  }, [settings?.serverUrl]);

  let body: React.ReactNode;
  if (route.name === 'loading' || !settings) {
    body = (
      <View style={styles.screen}>
        <Message text="Loading…" />
      </View>
    );
  } else if (route.name === 'settings' || !client) {
    body = (
      <SettingsScreen
        initial={settings}
        makeClient={makeClient}
        onCancel={client ? () => setRoute({name: 'library'}) : undefined}
        onSave={async s => {
          await saveSettings(s);
          setSettings(s);
          setRoute({name: 'library'});
        }}
      />
    );
  } else if (route.name === 'book') {
    body = (
      <BookScreen
        client={client}
        settings={settings}
        book={route.book}
        onBack={() => setRoute({name: 'library'})}
      />
    );
  } else {
    body = (
      <LibraryScreen
        client={client}
        settings={settings}
        onOpenBook={book => setRoute({name: 'book', book})}
        onSettings={() => setRoute({name: 'settings'})}
        onClose={closePlugin}
      />
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" backgroundColor="#ffffff" />
      {body}
    </View>
  );
}

export default App;
