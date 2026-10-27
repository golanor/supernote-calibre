/**
 * Plugin entry: PluginHost runs this on install and on every restart.
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {PluginManager} from 'sn-plugin-lib';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

// One toolbar button in NOTE and DOC; button ids must stay stable across versions.
PluginManager.registerButton(1, ['NOTE', 'DOC'], {
  id: 100,
  name: 'calibre',
  icon: Image.resolveAssetSource(require('./assets/icon.png')).uri,
  showType: 1,
});
