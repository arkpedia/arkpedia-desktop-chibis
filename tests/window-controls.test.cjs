const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { maxChibis } = require('../electron/limits.json');

// Objects made inside the vm belong to another realm; compare plain copies.
const plain = value => JSON.parse(JSON.stringify(value));
const last = (calls, kind) => calls.filter(call => Array.isArray(call) && call[0] === kind).at(-1);
const stored = userData => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));

// Exercise the real main-process wiring: two windows, no desktop session.
async function launch({ platform = 'darwin', env = {}, settings, cursor = { x: 400, y: 400 }, userData: reuse } = {}) {
  let tray, poll;
  const windows = [];
  const userData = reuse ?? fs.mkdtempSync(path.join(os.tmpdir(), 'chibis-test-'));
  if (settings) fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(settings));
  const switches = [];
  const app = Object.assign(new EventEmitter(), {
    setName() {}, setPath() {}, getPath: () => userData, commandLine: { appendSwitch: (...args) => switches.push(args) },
    requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() { this.quits = (this.quits ?? 0) + 1; },
  });
  class Window extends EventEmitter {
    constructor(options) {
      super(); windows.push(this); this.options = options; this.minimized = false; this.visible = true;
      this.calls = []; this.sent = [];
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: 'arkchibi://app/' }, setWindowOpenHandler() {},
        send: (channel, value) => { this.calls.push(channel); this.sent.push([channel, JSON.parse(JSON.stringify(value ?? null))]); },
      });
    }
    isDestroyed() { return false; }
    isMinimized() { return this.minimized; }
    isVisible() { return this.visible; }
    minimize() { this.minimized = true; this.calls.push('minimize'); }
    restore() { this.minimized = false; this.calls.push('restore'); }
    show() { this.visible = true; this.calls.push('show'); }
    focus() { this.calls.push('focus'); }
    setAlwaysOnTop(...args) { this.calls.push(plain(['top', ...args])); }
    setVisibleOnAllWorkspaces(...args) { this.calls.push(plain(['workspaces', ...args])); }
    setBounds() { this.calls.push('setBounds'); }
    getBounds() { return { x: 0, y: 0 }; }
    setIgnoreMouseEvents(...args) { this.calls.push(plain(['ignore', ...args])); }
    async loadURL(url) { this.calls.push(plain(['load', url])); }
  }
  const ipcMain = new EventEmitter();
  const electron = {
    app, BrowserWindow: Window, ipcMain,
    Tray: class extends EventEmitter { constructor() { super(); tray = this; } setTitle() {} setToolTip() {} setContextMenu(menu) { this.menu = menu; } },
    nativeImage: { createFromDataURL: () => ({ resize: () => ({}) }) },
    Menu: { buildFromTemplate: x => x, setApplicationMenu() {} },
    screen: Object.assign(new EventEmitter(), {
      getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }),
      getAllDisplays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }],
      getCursorScreenPoint: () => cursor,
    }),
    protocol: { registerSchemesAsPrivileged() {}, handle() {} }, net: {},
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8'), {
    require: id => id === 'electron' ? electron : require(id), __dirname: path.join(__dirname, '../electron'),
    process: { argv: [], platform, env }, setInterval: fn => { poll = fn; return 1; }, clearInterval() {}, URL, Response,
  });
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
  const [overlay, panel] = windows;
  const frame = window => ({ sender: window.webContents, senderFrame: window.webContents.mainFrame });
  return { app, overlay, panel, windows, ipcMain, trusted: frame(overlay), panelTrusted: frame(panel), poll, item: label => tray.menu.find(entry => entry.label === label), userData, switches, cursor };
}

test('chibis get a frameless full-screen overlay and the picker is a normal window', async () => {
  const { overlay, panel } = await launch();
  assert.equal(overlay.options.transparent, true);
  assert.equal(overlay.options.frame, false);
  assert.equal(overlay.options.skipTaskbar, true, 'the picker owns the taskbar entry');
  assert.equal(overlay.options.width, 1280);
  assert.equal(overlay.options.height, 720);
  assert.notEqual(panel.options.transparent, true);
  assert.equal(panel.options.frame, undefined, 'native frame, so the OS can minimize it');
  assert.equal(panel.options.width, 430);
  assert.ok(panel.calls.some(call => Array.isArray(call) && call[1] === 'arkchibi://app/?role=panel'));
  assert.ok(overlay.calls.some(call => Array.isArray(call) && call[1] === 'arkchibi://app/?role=overlay'));
});

test('minimizing the picker leaves the chibis alone', async () => {
  const { ipcMain, panelTrusted, panel, overlay } = await launch();
  ipcMain.emit('minimize', panelTrusted);
  assert.equal(panel.isMinimized(), true);
  assert.equal(overlay.isMinimized(), false);
  assert.equal(overlay.calls.filter(call => call === 'minimize').length, 0);
});

test('empty space always passes through; a chibi under the cursor takes the mouse back', async () => {
  const { ipcMain, trusted, poll, overlay, cursor } = await launch();
  ipcMain.emit('regions', trusted, [{ x: 380, y: 380, width: 50, height: 50 }]);
  poll(); assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', false]);
  cursor.x = 10; poll(); assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', true, { forward: true }]);
  ipcMain.emit('hover', trusted, true); assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', false]);
  ipcMain.emit('hover', trusted, false); assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', true, { forward: true }]);
  ipcMain.emit('dragging', trusted, true); assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', false]);
  poll(); assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', false], 'a held chibi keeps the mouse');
});

test('the picker cannot publish hit regions', async () => {
  const { ipcMain, trusted, panelTrusted, poll, overlay, cursor } = await launch();
  cursor.x = 400; cursor.y = 400;
  ipcMain.emit('regions', panelTrusted, [{ x: 380, y: 380, width: 50, height: 50 }]);
  poll();
  assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', true, { forward: true }]);
  ipcMain.emit('regions', trusted, [{ x: 380, y: 380, width: 50, height: 50 }]);
  poll();
  assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', false]);
});

test('settings default, persist, and drive the menus', async () => {
  const { item, userData, overlay } = await launch();
  assert.equal(item('Always on top').checked, true);
  assert.equal(item('Clicks pass through chibis').checked, false);
  assert.equal(item('Walk side to side').checked, true);
  assert.equal(item('Walk up and down').checked, false);
  assert.equal(item('Keep chibis on their screen').checked, true);
  assert.deepEqual(last(overlay.calls, 'top'), ['top', true, 'screen-saver']);
  assert.deepEqual(last(overlay.calls, 'workspaces'), ['workspaces', true, { visibleOnFullScreen: true }]);

  item('Walk up and down').click();
  assert.equal(stored(userData).walkVertical, true);
  item('Follow across desktops').click();
  assert.equal(stored(userData).followSpaces, false);
  assert.deepEqual(last(overlay.calls, 'workspaces'), ['workspaces', false]);
});

test('adding and clearing chibis travels from the picker to the overlay only', async () => {
  const { ipcMain, trusted, panelTrusted, overlay, panel } = await launch();
  const entry = { id: 'char_1#1', name: 'Amiya', model: { skeleton: 'https://a/skel', atlas: 'https://a/atlas', textures: { 'a.png': 'https://a/png' }, premultipliedAlpha: true } };
  ipcMain.emit('add-chibi', panelTrusted, entry);
  assert.deepEqual(overlay.sent.filter(([channel]) => channel === 'added').at(-1), ['added', entry]);
  ipcMain.emit('add-chibi', trusted, entry);
  assert.equal(overlay.sent.filter(([channel]) => channel === 'added').length, 1, 'the overlay cannot add chibis');
  ipcMain.emit('add-chibi', panelTrusted, { id: 'bad' });
  assert.equal(overlay.sent.filter(([channel]) => channel === 'added').length, 1, 'malformed entries are dropped');
  ipcMain.emit('clear-chibis', panelTrusted);
  assert.ok(overlay.sent.some(([channel]) => channel === 'clear-chibis'));
  assert.equal(panel.sent.filter(([channel]) => channel === 'added').length, 0);
});

test('the overlay reports its chibi count to the picker, within bounds', async () => {
  const { ipcMain, trusted, panelTrusted, panel } = await launch();
  ipcMain.emit('count', trusted, 3);
  assert.deepEqual(panel.sent.filter(([channel]) => channel === 'count').at(-1), ['count', 3]);
  ipcMain.emit('count', trusted, maxChibis + 1);
  ipcMain.emit('count', panelTrusted, 2);
  assert.equal(panel.sent.filter(([channel]) => channel === 'count').length, 1);
});

test('the picker can request the restored count after missing the startup report', async () => {
  const first = await launch();
  first.ipcMain.emit('chibis-changed', first.trusted, ['char_1#1', 'char_2#1']);
  const { ipcMain, trusted, panelTrusted, panel } = await launch({ userData: first.userData });
  ipcMain.emit('get-count', panelTrusted);
  assert.deepEqual(last(panel.sent, 'count'), ['count', 0]);
  ipcMain.emit('get-chibis', trusted);
  ipcMain.emit('count', trusted, 2);
  // Startup reports precede the picker subscription; a reload loses them too.
  panel.sent.length = 0;
  ipcMain.emit('get-count', panelTrusted);
  assert.deepEqual(panel.sent, [['count', 2]]);
  for (const invalid of [-1, maxChibis + 1, 1.5, '3', NaN]) ipcMain.emit('count', trusted, invalid);
  ipcMain.emit('count', panelTrusted, 9);
  ipcMain.emit('get-count', panelTrusted);
  assert.deepEqual(last(panel.sent, 'count'), ['count', 2]);
  panel.sent.length = 0;
  ipcMain.emit('get-count', trusted);
  ipcMain.emit('get-count', { sender: {}, senderFrame: { url: 'arkchibi://app/' } });
  assert.deepEqual(panel.sent, []);
  ipcMain.emit('count', trusted, 0);
  panel.sent.length = 0;
  ipcMain.emit('get-count', panelTrusted);
  assert.deepEqual(panel.sent, [['count', 0]], 'clearing updates the retained count');
});

test('untrusted frames cannot change settings, minimize or add chibis', async () => {
  const { ipcMain, panel, overlay, userData, panelTrusted } = await launch();
  const rogue = { sender: {}, senderFrame: { url: 'arkchibi://app/' } };
  ipcMain.emit('set-setting', rogue, 'alwaysOnTop', false);
  ipcMain.emit('set-setting', rogue, 'frame', false);
  ipcMain.emit('minimize', rogue);
  ipcMain.emit('add-chibi', rogue, { id: 'x', name: 'x', model: { skeleton: 'a', atlas: 'b', textures: {} } });
  assert.equal(fs.existsSync(path.join(userData, 'settings.json')), false);
  assert.equal(panel.isMinimized(), false);
  assert.equal(overlay.sent.filter(([channel]) => channel === 'added').length, 0);
  // The picker its own frame is trusted.
  ipcMain.emit('minimize', panelTrusted);
  assert.equal(panel.isMinimized(), true);
});

test('launching again restores the picker, not the overlay', async () => {
  const { app, panel, overlay } = await launch();
  panel.minimize();
  panel.calls = [];
  app.emit('second-instance');
  assert.equal(panel.isMinimized(), false);
  assert.deepEqual(panel.calls, ['restore', 'show', 'focus']);
  assert.equal(overlay.calls.includes('minimize'), false);
});

test('Linux Wayland runs under XWayland and keeps click-through', async () => {
  const x11 = await launch({ platform: 'linux', env: { XDG_SESSION_TYPE: 'x11' } });
  assert.deepEqual(x11.switches, []);
  const { switches, overlay } = await launch({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' } });
  assert.deepEqual(switches, [['ozone-platform', 'x11']]);
  assert.deepEqual(last(overlay.calls, 'ignore'), ['ignore', true, { forward: true }]);
});

test('active chibis are saved and restored, unless remembering is off', async () => {
  const first = await launch();
  first.ipcMain.emit('get-chibis', first.trusted);
  assert.deepEqual(first.overlay.sent.filter(([channel]) => channel === 'chibis').at(-1), ['chibis', []]);
  first.ipcMain.emit('chibis-changed', first.trusted, ['char_1#1', 'char_2#1']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(first.userData, 'chibis.json'), 'utf8')), ['char_1#1', 'char_2#1']);

  const second = await launch({ userData: first.userData });
  second.ipcMain.emit('get-chibis', second.trusted);
  assert.deepEqual(second.overlay.sent.filter(([channel]) => channel === 'chibis').at(-1), ['chibis', ['char_1#1', 'char_2#1']]);

  second.ipcMain.emit('set-setting', second.panelTrusted, 'rememberChibis', false);
  second.ipcMain.emit('chibis-changed', second.trusted, ['char_3#1']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(second.userData, 'chibis.json'), 'utf8')), ['char_1#1', 'char_2#1'], 'not overwritten');
  second.ipcMain.emit('get-chibis', second.trusted);
  assert.deepEqual(second.overlay.sent.filter(([channel]) => channel === 'chibis').at(-1), ['chibis', []]);
});

test('the overlay reports every display in its own coordinates', async () => {
  const { ipcMain, trusted, overlay } = await launch();
  ipcMain.emit('get-displays', trusted);
  assert.deepEqual(overlay.sent.filter(([channel]) => channel === 'displays').at(-1), ['displays', [{ x: 0, y: 0, width: 1280, height: 720, primary: true }]]);
});

test('a damaged settings file falls back to defaults', async () => {
  const { item } = await launch({ settings: { alwaysOnTop: 'yes', clickChibis: 'no', extra: 1 } });
  assert.equal(item('Always on top').checked, true);
  assert.equal(item('Clicks pass through chibis').checked, false);
});

test('the picker alone can request updates, library changes and desktop services',async()=>{
  const {ipcMain,trusted,panelTrusted,panel,overlay}=await launch();
  ipcMain.emit('get-updates',trusted);ipcMain.emit('get-services',trusted);
  assert.equal(panel.sent.some(([channel])=>channel==='updates'||channel==='services'),false);
  ipcMain.emit('get-updates',panelTrusted);ipcMain.emit('get-services',panelTrusted);
  assert.equal(last(panel.sent,'updates')[1].status,'idle');assert.equal(last(panel.sent,'services')[1].loginSupported,false);
  ipcMain.emit('get-surfaces',panelTrusted);assert.equal(overlay.sent.some(([channel])=>channel==='surfaces'),false);
  ipcMain.emit('get-surfaces',trusted);assert.deepEqual(last(overlay.sent,'surfaces'),['surfaces',[]]);
  for(const channel of ['library-import','library-export','library-clear','library-download','update-action'])ipcMain.emit(channel,trusted,'install');
});
