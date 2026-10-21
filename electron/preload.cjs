const { contextBridge, ipcRenderer } = require('electron');
const subscribe = (channel, read) => callback => {
  const listener = (_event, value) => callback(read(value));
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld('companion', {
  regions: value => ipcRenderer.send('regions', value),
  dragging: value => ipcRenderer.send('dragging', value),
  hover: value => ipcRenderer.send('hover', value),
  minimize: () => ipcRenderer.send('minimize'),
  quit: () => ipcRenderer.send('quit'),
  onAdded: subscribe('added', value => value),
  onClear: subscribe('clear-chibis', () => undefined),
  // Only the known boolean modes cross the bridge.
  onSettings: subscribe('settings', value => ({
    alwaysOnTop: value?.alwaysOnTop === true,
    followSpaces: value?.followSpaces !== false,
    clickChibis: value?.clickChibis === true,
    walkHorizontal: value?.walkHorizontal !== false,
    walkVertical: value?.walkVertical === true,
    lockToScreen: value?.lockToScreen !== false,
  })),
  onDisplays: subscribe('displays', value => Array.isArray(value) ? value : []),
  requestDisplays: () => ipcRenderer.send('get-displays'),
  requestSettings: () => ipcRenderer.send('get-settings'),
  addChibi: entry => ipcRenderer.send('add-chibi', entry),
  clearChibis: () => ipcRenderer.send('clear-chibis'),
  reportCount: count => ipcRenderer.send('count', count),
  onCount: subscribe('count', value => Number(value) || 0),
  setSetting: (key, value) => ipcRenderer.send('set-setting', key, value),
});
