const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, protocol, net, session } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
// Absolute paths: the tests run this file in a vm whose require resolves from tests/.
const { KEYS, createSettings, topLevel, shouldIgnoreMouse, overlaySupport } = require(path.join(__dirname, 'settings.cjs'));
const support = overlaySupport(process.platform, process.env);
// Wayland gives clients no always-on-top; XWayland does on most compositors. Must precede ready.
if (support.preferX11 && !process.argv.some(arg => arg.startsWith('--ozone-platform'))) app.commandLine.appendSwitch('ozone-platform', 'x11');
const { maxChibis } = require(path.join(__dirname, 'limits.json'));
protocol.registerSchemesAsPrivileged([{ scheme: 'arkchibi', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
// The panel or launcher, one hit box per chibi, and a little slack.
const MAX_REGIONS = maxChibis + 4;
let win, tray, settings, regions = [], dragging = false, hovering = false, ignored = null, timer;
app.setName('Arkpedia Chibis Dev');
app.setPath('userData', path.join(app.getPath('appData'), 'Arkpedia Chibis Dev'));
const trusted = e => win && e.sender === win.webContents && e.senderFrame === win.webContents.mainFrame && e.senderFrame.url.startsWith('arkchibi://app/');
const alive = () => win && !win.isDestroyed();
const show = () => {
  if (!alive()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  win.webContents.send('show-controls');
};
const minimize = () => {
  if (!alive()) return;
  dragging = false;
  win.minimize();
};
const setIgnore = next => {
  if (next === ignored) return;
  ignored = next;
  // forward: the renderer still sees mousemove, so it can report a chibi under the cursor.
  if (next) win.setIgnoreMouseEvents(true, { forward: true });
  else win.setIgnoreMouseEvents(false);
};
const overRegion = () => {
  const point = screen.getCursorScreenPoint(), bounds = win.getBounds();
  const x = point.x - bounds.x, y = point.y - bounds.y;
  return regions.some(r => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
};
const updateMouse = overInteractive => {
  if (!alive() || win.isMinimized() || !win.isVisible()) return;
  const { clickThrough } = settings.get();
  setIgnore(shouldIgnoreMouse({ clickThrough, dragging, overInteractive: clickThrough && overInteractive() }));
};
const applyAlwaysOnTop = () => {
  if (!alive()) return;
  if (settings.get().alwaysOnTop) {
    win.setAlwaysOnTop(true, topLevel(process.platform));
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  } else {
    win.setVisibleOnAllWorkspaces(false);
    win.setAlwaysOnTop(false);
  }
};
const settingItems = () => {
  const current = settings.get();
  return [
    { label: 'Always on top', type: 'checkbox', checked: current.alwaysOnTop, click: () => change('alwaysOnTop', !settings.get().alwaysOnTop) },
    { label: 'Click-through', type: 'checkbox', checked: current.clickThrough, click: () => change('clickThrough', !settings.get().clickThrough) },
  ];
};
// Menus are rebuilt after every change so their checkmarks match the stored settings.
const buildMenus = () => {
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show companion controls', click: show }, { label: 'Minimize companions', click: minimize }, { type: 'separator' }, ...settingItems(), { type: 'separator' }, { label: 'Quit companions', click: () => app.quit() }]));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Arkpedia Chibis Dev', submenu: [{ label: 'Show controls', click: show }, { label: 'Minimize companions', accelerator: 'CommandOrControl+M', click: minimize }, { type: 'separator' }, ...settingItems(), { type: 'separator' }, { role: 'quit' }] }]));
};
const publishSettings = () => { if (alive()) win.webContents.send('settings', settings.get()); };
function change(key, value) {
  if (!settings.set(key, value)) return;
  if (key === 'alwaysOnTop') applyAlwaysOnTop();
  if (key === 'clickThrough') updateMouse(overRegion);
  buildMenus();
  publishSettings();
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  // Launching the app again always brings the controls back. Where click-through cannot see the
  // pointer (Linux Wayland), it also turns click-through off, or the controls could not be clicked.
  app.on('second-instance', () => { if (!support.cursorTracking && settings?.get().clickThrough) change('clickThrough', false); show(); });
  app.on('activate', () => { if (win && (win.isMinimized() || !win.isVisible())) show(); });
  app.whenReady().then(async () => {
    settings = createSettings(path.join(app.getPath('userData'), 'settings.json'));
    const root = path.join(__dirname, '..', 'dist');
    protocol.handle('arkchibi', req => {
      const url = new URL(req.url);
      const file = path.resolve(root, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
      if (url.host !== 'app' || !file.startsWith(root + path.sep)) return new Response('Not found', { status: 404 });
      return net.fetch(pathToFileURL(file).toString());
    });
    session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    const { alwaysOnTop } = settings.get();
    win = new BrowserWindow({ ...screen.getPrimaryDisplay().workArea, title: 'Arkpedia Chibis Dev', transparent: true, frame: false, resizable: false, minimizable: true, maximizable: false, fullscreenable: false, hasShadow: false, alwaysOnTop, skipTaskbar: false, backgroundColor: '#00000000', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false } });
    applyAlwaysOnTop();
    if (process.argv.includes('--window-diagnostics')) {
      for (const event of ['minimize', 'restore', 'show', 'hide']) {
        win.on(event, () => console.log(JSON.stringify({ event, minimized: win.isMinimized(), visible: win.isVisible() })));
      }
    }
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.on('did-finish-load', publishSettings);
    ipcMain.on('regions', (e, value) => {
      if (!trusted(e) || !Array.isArray(value) || value.length > MAX_REGIONS) return;
      regions = value.filter(r => r && ['x','y','width','height'].every(k => Number.isFinite(r[k])) && r.width > 0 && r.height > 0);
    });
    ipcMain.on('dragging', (e, value) => { if (trusted(e) && typeof value === 'boolean') { dragging = value; updateMouse(() => hovering); } });
    // Forwarded mousemove: the renderer reports at once when the cursor enters or leaves a chibi.
    ipcMain.on('hover', (e, value) => { if (trusted(e) && typeof value === 'boolean') { hovering = value; updateMouse(() => value); } });
    ipcMain.on('get-settings', e => { if (trusted(e)) publishSettings(); });
    ipcMain.on('set-setting', (e, key, value) => { if (trusted(e) && KEYS.includes(key) && typeof value === 'boolean') change(key, value); });
    ipcMain.on('minimize', e => { if (trusted(e)) minimize(); });
    ipcMain.on('quit', e => { if (trusted(e)) app.quit(); });
    // The cursor poll is the fallback for platforms or moments without forwarded mousemove.
    timer = setInterval(() => updateMouse(overRegion), 32);
    updateMouse(overRegion);
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAxElEQVR42u2XsRGAIAxFGYHCBSxdgB3cwIEYgm3Su4ILMAR3SpHC884AGkkKi9dwwn8KQjDLthpJzC/Q2MFlfAYyMZOQiG0en2EXmDFgrwSwD4tAaAi+Et4I2Ma3pr6GfSLAEX6WaBIIjOHkdNwtuNuBhnEiKUjMNQLwNLxCAkoC7m14hYSjBDxHeEHCUwLQQQAogdhBIFICqYNAUi0gPgXii1D8NxTfiMS3YhWHkfhxrKIgUVGSiRelaspyFReT/274GQcrK+3h78nFfQAAAABJRU5ErkJggg==').resize({ width: 16, height: 16 });
    tray = new Tray(icon); tray.setTitle('Chibi'); tray.setToolTip('Arkpedia Chibis Dev');
    buildMenus();
    tray.on('click', show);
    screen.on('display-metrics-changed', () => win.setBounds(screen.getPrimaryDisplay().workArea));
    win.on('closed', () => { clearInterval(timer); app.quit(); });
    await win.loadURL('arkchibi://app/');
  });
}
app.on('window-all-closed', () => app.quit());
