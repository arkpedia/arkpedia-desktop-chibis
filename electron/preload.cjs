const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('companion', {
  regions: value => ipcRenderer.send('regions', value),
  dragging: value => ipcRenderer.send('dragging', value),
  quit: () => ipcRenderer.send('quit'),
  onShow: callback => { const listener = () => callback(); ipcRenderer.on('show-controls', listener); return () => ipcRenderer.removeListener('show-controls', listener); },
});
