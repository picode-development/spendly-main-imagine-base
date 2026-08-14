import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';

import App from './App';
import { widgetTaskHandler } from './src/widget-task-handler';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

// Runs headless when Android asks the widget to redraw (adds, resizes,
// periodic updates) — no UI is mounted in that case, only this handler.
registerWidgetTaskHandler(widgetTaskHandler);
