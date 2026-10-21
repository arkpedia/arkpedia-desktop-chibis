const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, protocol, net, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
// Absolute paths: the tests run this file in a vm whose require resolves from tests/.
const { KEYS, createSettings, topLevel, shouldIgnoreMouse, overlaySupport } = require(path.join(__dirname, 'settings.cjs'));
const support = overlaySupport(process.platform, process.env);
// Wayland gives clients no always-on-top; XWayland does on most compositors. Must precede ready.
if (support.preferX11 && !process.argv.some(arg => arg.startsWith('--ozone-platform'))) app.commandLine.appendSwitch('ozone-platform', 'x11');
const { maxChibis } = require(path.join(__dirname, 'limits.json'));
protocol.registerSchemesAsPrivileged([{ scheme: 'arkchibi', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
// One hit box per chibi, plus a little slack. The picker is a separate window and never a region.
const MAX_REGIONS = maxChibis + 4;
// win: the frameless, click-through overlay the chibis live in. panel: the ordinary picker window.
let win, panel, tray, settings, regions = [], dragging = false, hovering = false, ignored = null, timer;
app.setName('Arkpedia Chibis Dev');
// A data directory override keeps a test or portable copy from fighting the installed one.
app.setPath('userData', process.env.ARKPEDIA_CHIBIS_DATA || path.join(app.getPath('appData'), 'Arkpedia Chibis Dev'));
// The picker restores whatever was on the desktop last time, when "Remember my chibis" is on.
const CHIBIS_FILE = path.join(app.getPath('userData'), 'chibis.json');
const readChibis = () => {
  try {
    const value = JSON.parse(fs.readFileSync(CHIBIS_FILE, 'utf8'));
    return Array.isArray(value) ? value.filter(id => typeof id === 'string' && id.length <= 200).slice(0, maxChibis) : [];
  } catch { return []; }
};
const writeChibis = ids => {
  try {
    fs.mkdirSync(path.dirname(CHIBIS_FILE), { recursive: true });
    fs.writeFileSync(CHIBIS_FILE, JSON.stringify(ids.slice(0, maxChibis)));
  } catch { /* the session still works without restoring next time */ }
};
const frameOf = w => w && !w.isDestroyed() && w.webContents && w.webContents.mainFrame;
const fromWindow = (e, w) => !!w && !w.isDestroyed() && e.sender === w.webContents && e.senderFrame === w.webContents.mainFrame && e.senderFrame.url.startsWith('arkchibi://app/');
const trusted = e => fromWindow(e, win) || fromWindow(e, panel);
const alive = () => win && !win.isDestroyed();
const panelAlive = () => panel && !panel.isDestroyed();
// The overlay spans every display's work area, so a chibi can be dragged from one screen to
// another. Rects travel to the renderer in window coordinates for hit tests and walking.
const workAreas = () => screen.getAllDisplays().map(display => display.workArea);
const unionBounds = () => {
  const areas = workAreas();
  const left = Math.min(...areas.map(area => area.x)), top = Math.min(...areas.map(area => area.y));
  const right = Math.max(...areas.map(area => area.x + area.width)), bottom = Math.max(...areas.map(area => area.y + area.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};
const publishDisplays = () => {
  if (!alive()) return;
  const origin = win.getBounds();
  const primary = screen.getPrimaryDisplay().id;
  win.webContents.send('displays', screen.getAllDisplays().map(display => ({
    x: display.workArea.x - origin.x,
    y: display.workArea.y - origin.y,
    width: display.workArea.width,
    height: display.workArea.height,
    primary: display.id === primary,
  })));
};
const publishSettings = () => {
  const value = settings.get();
  for (const target of [win, panel]) if (frameOf(target)) target.webContents.send('settings', value);
};
// The picker window is the only thing that minimizes: the chibis keep walking on the desktop.
const show = () => {
  if (!panelAlive()) return;
  if (panel.isMinimized()) panel.restore();
  panel.show();
  panel.focus();
};
const minimize = () => { if (panelAlive()) panel.minimize(); };
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
  setIgnore(shouldIgnoreMouse({ dragging, overInteractive: overInteractive() }));
};
// Joining every Space is separate from the always-on-top z-order: a user may want the chibis
// on every desktop without pinning them above other windows, or the other way round.
const applySpaces = () => {
  if (!alive()) return;
  if (settings.get().followSpaces) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  else win.setVisibleOnAllWorkspaces(false);
};
const applyAlwaysOnTop = () => {
  if (!alive()) return;
  if (settings.get().alwaysOnTop) win.setAlwaysOnTop(true, topLevel(process.platform));
  else win.setAlwaysOnTop(false);
};
const settingItems = () => {
  const current = settings.get();
  return [
    { label: 'Always on top', type: 'checkbox', checked: current.alwaysOnTop, click: () => change('alwaysOnTop', !settings.get().alwaysOnTop) },
    { label: 'Follow across desktops', type: 'checkbox', checked: current.followSpaces, click: () => change('followSpaces', !settings.get().followSpaces) },
    { label: 'Clicks pass through chibis', type: 'checkbox', checked: current.clickChibis, click: () => change('clickChibis', !settings.get().clickChibis) },
    { type: 'separator' },
    { label: 'Walk side to side', type: 'checkbox', checked: current.walkHorizontal, click: () => change('walkHorizontal', !settings.get().walkHorizontal) },
    { label: 'Walk up and down', type: 'checkbox', checked: current.walkVertical, click: () => change('walkVertical', !settings.get().walkVertical) },
    { label: 'Keep chibis on their screen', type: 'checkbox', checked: current.lockToScreen, click: () => change('lockToScreen', !settings.get().lockToScreen) },
    { type: 'separator' },
    { label: 'Remember my chibis', type: 'checkbox', checked: current.rememberChibis, click: () => change('rememberChibis', !settings.get().rememberChibis) },
  ];
};
// Menus are rebuilt after every change so their checkmarks match the stored settings.
const buildMenus = () => {
  tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Show companion controls', click: show }, { label: 'Minimize picker', click: minimize }, { type: 'separator' }, ...settingItems(), { type: 'separator' }, { label: 'Quit companions', click: () => app.quit() }]));
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'Arkpedia Chibis Dev', submenu: [{ label: 'Show controls', click: show }, { label: 'Minimize picker', accelerator: 'CommandOrControl+M', click: minimize }, { type: 'separator' }, ...settingItems(), { type: 'separator' }, { role: 'quit' }] }]));
};
function change(key, value) {
  if (!settings.set(key, value)) return;
  if (key === 'alwaysOnTop') applyAlwaysOnTop();
  if (key === 'followSpaces') applySpaces();
  buildMenus();
  publishSettings();
}
/** The picker owns the catalogue and sends whole entries; accept only a bounded, plain shape. */
function cleanEntry(value) {
  if (!value || typeof value !== 'object') return null;
  const { id, name, model } = value;
  if (typeof id !== 'string' || !id || id.length > 200) return null;
  if (typeof name !== 'string' || !name || name.length > 200) return null;
  if (!model || typeof model !== 'object' || typeof model.skeleton !== 'string' || typeof model.atlas !== 'string') return null;
  if (!model.textures || typeof model.textures !== 'object') return null;
  const textures = {};
  const entries = Object.entries(model.textures);
  if (entries.length > 32) return null;
  for (const [key, url] of entries) if (typeof url === 'string') textures[key] = url;
  return { id, name, model: { skeleton: model.skeleton, atlas: model.atlas, textures, premultipliedAlpha: model.premultipliedAlpha === true } };
}
if (!app.requestSingleInstanceLock()) app.quit();
else {
  // Launching the app again brings the picker back; the chibis were never gone.
  app.on('second-instance', () => show());
  app.on('activate', () => { if (!panelAlive() || panel.isMinimized() || !panel.isVisible()) show(); });
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
    const webPreferences = { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, backgroundThrottling: false };
    win = new BrowserWindow({ ...unionBounds(), title: 'Arkpedia Chibis Dev', transparent: true, frame: false, resizable: false, acceptFirstMouse: true, minimizable: false, maximizable: false, fullscreenable: false, hasShadow: false, alwaysOnTop, skipTaskbar: true, backgroundColor: '#00000000', webPreferences });
    panel = new BrowserWindow({ width: 430, height: 780, minWidth: 360, minHeight: 480, title: 'Arkpedia Chibis', backgroundColor: '#0e1a20', show: true, webPreferences });
    applyAlwaysOnTop();
    applySpaces();
    if (process.argv.includes('--window-diagnostics')) {
      for (const event of ['minimize', 'restore', 'show', 'hide']) {
        panel.on(event, () => console.log(JSON.stringify({ event, minimized: panel.isMinimized(), visible: panel.isVisible() })));
        win.on(event, () => console.log(JSON.stringify({ event: `overlay:${event}`, minimized: win.isMinimized(), visible: win.isVisible() })));
      }
    }
    for (const target of [win, panel]) {
      target.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      target.webContents.on('will-navigate', e => e.preventDefault());
    }
    // Windows can clamp a frameless window created larger than one monitor; re-applying the
    // bounds once the page is up makes the overlay cover every display on those systems.
    win.webContents.on('did-finish-load', () => { publishSettings(); publishDisplays(); if (alive()) win.setBounds(unionBounds()); });
    panel.webContents.on('did-finish-load', publishSettings);
    ipcMain.on('regions', (e, value) => {
      if (!fromWindow(e, win) || !Array.isArray(value) || value.length > MAX_REGIONS) return;
      regions = value.filter(r => r && ['x','y','width','height'].every(k => Number.isFinite(r[k])) && r.width > 0 && r.height > 0);
    });
    ipcMain.on('dragging', (e, value) => { if (fromWindow(e, win) && typeof value === 'boolean') { dragging = value; updateMouse(() => hovering); } });
    // Forwarded mousemove: the renderer reports at once when the cursor enters or leaves a chibi.
    ipcMain.on('hover', (e, value) => { if (fromWindow(e, win) && typeof value === 'boolean') { hovering = value; updateMouse(() => value); } });
    ipcMain.on('get-settings', e => { if (trusted(e)) publishSettings(); });
    ipcMain.on('get-displays', e => { if (fromWindow(e, win)) publishDisplays(); });
    ipcMain.on('get-chibis', e => { if (fromWindow(e, win)) win.webContents.send('chibis', settings.get().rememberChibis ? readChibis() : []); });
    ipcMain.on('chibis-changed', (e, ids) => {
      if (!fromWindow(e, win) || !Array.isArray(ids)) return;
      const clean = ids.filter(id => typeof id === 'string' && id.length <= 200).slice(0, maxChibis);
      if (settings.get().rememberChibis) writeChibis(clean);
    });
    ipcMain.on('set-setting', (e, key, value) => { if (trusted(e) && KEYS.includes(key) && typeof value === 'boolean') change(key, value); });
    ipcMain.on('add-chibi', (e, value) => {
      const entry = fromWindow(e, panel) ? cleanEntry(value) : null;
      if (entry && alive()) win.webContents.send('added', entry);
    });
    ipcMain.on('clear-chibis', e => { if (fromWindow(e, panel) && alive()) win.webContents.send('clear-chibis'); });
    ipcMain.on('count', (e, value) => { if (fromWindow(e, win) && panelAlive() && Number.isInteger(value) && value >= 0 && value <= maxChibis) panel.webContents.send('count', value); });
    ipcMain.on('minimize', e => { if (fromWindow(e, panel)) minimize(); });
    ipcMain.on('quit', e => { if (trusted(e)) app.quit(); });
    // The cursor poll is the fallback for platforms or moments without forwarded mousemove.
    timer = setInterval(() => updateMouse(overRegion), 32);
    updateMouse(overRegion);
    const icon = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAxElEQVR42u2XsRGAIAxFGYHCBSxdgB3cwIEYgm3Su4ILMAR3SpHC884AGkkKi9dwwn8KQjDLthpJzC/Q2MFlfAYyMZOQiG0en2EXmDFgrwSwD4tAaAi+Et4I2Ma3pr6GfSLAEX6WaBIIjOHkdNwtuNuBhnEiKUjMNQLwNLxCAkoC7m14hYSjBDxHeEHCUwLQQQAogdhBIFICqYNAUi0gPgXii1D8NxTfiMS3YhWHkfhxrKIgUVGSiRelaspyFReT/274GQcrK+3h78nFfQAAAABJRU5ErkJggg==').resize({ width: 16, height: 16 });
    tray = new Tray(icon); tray.setTitle('Chibi'); tray.setToolTip('Arkpedia Chibis Dev');
    buildMenus();
    tray.on('click', show);
    const fitToDisplays = () => { if (!alive()) return; win.setBounds(unionBounds()); publishDisplays(); };
    screen.on('display-added', fitToDisplays);
    screen.on('display-removed', fitToDisplays);
    screen.on('display-metrics-changed', fitToDisplays);
    // A drag that ends outside the window never delivers pointerup here; without this the
    // window would keep capturing every click (click-through stuck off) until it restarts.
    // macOS can drop the "join all Spaces" flag when a window is restored; re-assert it
    // without re-running the process-type transform that would blink the Dock.
    win.on('restore', () => { if (settings.get().followSpaces) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true }); });
    const release = () => { dragging = false; hovering = false; updateMouse(overRegion); };
    win.on('blur', release);
    win.on('hide', release);
    const quit = () => { clearInterval(timer); app.quit(); };
    win.on('closed', quit);
    panel.on('closed', quit);
    await win.loadURL('arkchibi://app/?role=overlay');
    await panel.loadURL('arkchibi://app/?role=panel');
  });
}
app.on('window-all-closed', () => app.quit());
