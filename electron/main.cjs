const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, protocol, net, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
protocol.registerSchemesAsPrivileged([{ scheme: 'arkchibi', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
let win, tray, regions = [], dragging = false, ignored = false, timer;
app.setName('Arkpedia Chibis Dev');
app.setPath('userData', path.join(app.getPath('appData'), 'Arkpedia Chibis Dev'));
const trusted = e => win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && e.senderFrame.url.startsWith('arkchibi://app/');
const show = () => {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('show-controls');
};
const minimize = () => {
  if (!win || win.isDestroyed()) return;
  dragging = false;
  win.minimize();
};
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', show);
  app.on('activate', () => { if (win && (win.isMinimized() || !win.isVisible())) show(); });
  app.whenReady().then(async () => {
    const root = path.join(__dirname, '..', 'dist');
    protocol.handle('arkchibi', req => {
      const url = new URL(req.url);
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (url.host !== 'app' || !file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    win = new BrowserWindow({ ...screen.getPrimaryDisplay().workArea, title: 'Arkpedia Chibis Dev', transparent: true, frame: false, resizable: false, minimizable: true, maximizable: false, fullscreenable: false, hasShadow: false, alwaysOnTop: true, skipTaskbar: false, backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    win.setAlwaysOnTop(true, 'floating');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (process.argv.includes('--window-diagnostics')) {
      for (const event of ['minimize', 'restore', 'show', 'hide']) {
        win.on(event, () => console.log(JSON.stringify({ event, minimized: win.isMinimized(), visible: win.isVisible() })));
      }
    }
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    ipcMain.on('regions', (e, value) => {
      if (!trusted(e) || !Array.isArray(value) || value.length > 32) return;
      regions = value.filter(r => r && ['x','y','width','height'].every(k => Number.isFinite(r[k])) && r.width > 0 && r.height > 0);
    });
    ipcMain.on('dragging', (e, value) => { if (trusted(e) && typeof value === 'boolean') dragging = value; });
    ipcMain.on('minimize', e => { if (trusted(e)) minimize(); });
    ipcMain.on('quit', e => { if (trusted(e)) app.quit(); });
    timer = setInterval(() => {
      if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
      const point = screen.getCursorScreenPoint(), bounds = win.getBounds();
      const x = point.x - bounds.x, y = point.y - bounds.y;
      const next = !dragging && !regions.some(r => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
      if (next !== ignored) { ignored = next; win.setIgnoreMouseEvents(next, { forward: true }); }
    }, 32);
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==').resize({ width: 16, height: 16 });
    tray = new Tray(icon); tray.setTitle('Chibi'); tray.setToolTip('Arkpedia Chibis Dev');
    tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show companion controls', click: show }, { label: 'Minimize companions', click: minimize }, { type: 'separator' }, { label: 'Quit companions', click: () => app.quit() }]));
    tray.on('click', show);
    screen.on('display-metrics-changed', () => win.setBounds(screen.getPrimaryDisplay().workArea));
    Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Arkpedia Chibis Dev', submenu: [{ label: 'Show controls', click: show }, { label: 'Minimize companions', accelerator: 'CommandOrControl+M', click: minimize }, { type: 'separator' }, { role: 'quit' }] }]));
    win.on('closed', () => { clearInterval(timer); app.quit(); });
    await win.loadURL('arkchibi://app/');
  });
}
app.on('window-all-closed', () => app.quit());
