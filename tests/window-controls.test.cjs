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
// Exercise the actual main-process wiring without needing a desktop session.
async function launch({ platform = 'darwin', env = {}, settings, cursor = { x: 400, y: 400 } } = {}) {
  let window, tray, applicationMenu, poll;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'chibis-test-'));
  if (settings) fs.writeFileSync(path.join(userData, 'settings.json'), JSON.stringify(settings));
  const switches = [];
  const app = Object.assign(new EventEmitter(), {
    setName() {}, setPath() {}, getPath: () => userData, commandLine: { appendSwitch: (...args) => switches.push(args) },
    requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {},
  });
  class Window extends EventEmitter {
    constructor(options) {
      super(); window = this; this.options = options; this.minimized = false; this.visible = true; this.calls = []; this.sent = [];
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
    setBounds() {}
    getBounds() { return { x: 0, y: 0 }; }
    setIgnoreMouseEvents(...args) { this.calls.push(plain(['ignore', ...args])); }
    async loadURL() { this.calls.push('load'); }
  }
  const ipcMain = new EventEmitter();
  const electron = {
    app, BrowserWindow: Window, ipcMain,
    Tray: class extends EventEmitter { constructor() { super(); tray = this; } setTitle() {} setToolTip() {} setContextMenu(menu) { this.menu = menu; } },
    nativeImage: { createFromDataURL: () => ({ resize: () => ({}) }) },
    Menu: { buildFromTemplate: x => x, setApplicationMenu: x => { applicationMenu = x; } },
    screen: Object.assign(new EventEmitter(), { getPrimaryDisplay: () => ({ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }), getAllDisplays: () => [{ id: 1, workArea: { x: 0, y: 0, width: 1280, height: 720 } }], getCursorScreenPoint: () => cursor }),
    protocol: { registerSchemesAsPrivileged() {}, handle() {} }, net: {},
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8'), {
    require: id => id === 'electron' ? electron : require(id), __dirname: path.join(__dirname, '../electron'),
    process: { argv: [], platform, env }, setInterval: fn => { poll = fn; return 1; }, clearInterval() {}, URL, Response,
  });
  await Promise.resolve();
  const trusted = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  const menu = () => tray.menu;
  const item = label => menu().find(entry => entry.label === label);
  return { app, window, tray, ipcMain, applicationMenu: () => applicationMenu, menu, item, poll, trusted, userData, switches, cursor };
}

test('minimize keeps the same loaded window and leaves a taskbar entry', async () => {
  const { window, ipcMain, trusted, poll } = await launch();
  assert.equal(window.options.minimizable, true);
  assert.equal(window.options.skipTaskbar, false);
  ipcMain.emit('minimize', trusted);
  assert.equal(window.isMinimized(), true);
  const count = window.calls.length; poll(); assert.equal(window.calls.length, count);
  assert.equal(window.calls.filter(x => x === 'load').length, 1);
});

test('untrusted frames and other windows cannot minimize the companion', async () => {
  const { window, ipcMain, trusted } = await launch();
  ipcMain.emit('minimize', { ...trusted, sender: {} });
  ipcMain.emit('minimize', { ...trusted, senderFrame: { url: 'arkchibi://app/' } });
  trusted.senderFrame.url = 'https://example.com/'; ipcMain.emit('minimize', trusted);
  assert.equal(window.isMinimized(), false);
});

test('refocusing a visible app does not reopen the hidden picker', async () => {
  const { app, window } = await launch();
  window.calls = [];
  app.emit('activate');
  assert.deepEqual(window.calls, []);
});

for (const entry of ['activate', 'second-instance', 'tray', 'menu']) {
  test(`${entry} restores an existing window without reloading chibis`, async () => {
    const { app, window, tray, applicationMenu } = await launch();
    window.minimize(); window.calls = [];
    if (entry === 'tray') tray.emit('click');
    else if (entry === 'menu') applicationMenu()[0].submenu[0].click();
    else app.emit(entry);
    assert.equal(window.isMinimized(), false);
    assert.deepEqual(window.calls, ['restore', 'show', 'focus', 'show-controls']);
  });
}

const last = (calls, kind) => calls.filter(call => Array.isArray(call) && call[0] === kind).at(-1);
const stored = userData => JSON.parse(fs.readFileSync(path.join(userData, 'settings.json'), 'utf8'));

test('defaults: always on top at the per-OS level, on every workspace, click-through on', async () => {
  for (const [platform, level] of [['darwin', 'screen-saver'], ['win32', 'screen-saver'], ['linux', 'floating']]) {
    const { window, item } = await launch({ platform });
    assert.equal(window.options.alwaysOnTop, true);
    assert.deepEqual(last(window.calls, 'top'), ['top', true, level]);
    assert.deepEqual(last(window.calls, 'workspaces'), ['workspaces', true, { visibleOnFullScreen: true }]);
    assert.deepEqual(last(window.calls, 'ignore'), ['ignore', true, { forward: true }]);
    assert.equal(item('Always on top').checked, true);
    assert.equal(item('Click-through').checked, true);
  }
});

test('always on top off makes a normal window and is remembered', async () => {
  const { window, item, menu, userData } = await launch();
  item('Always on top').click();
  assert.deepEqual(last(window.calls, 'top'), ['top', false]);
  assert.deepEqual(last(window.calls, 'workspaces'), ['workspaces', false]);
  assert.equal(item('Always on top').checked, false, 'menu rebuilt with the new state');
  assert.ok(window.calls.some(call => call === 'settings'), 'renderer told');
  assert.deepEqual(stored(userData), { alwaysOnTop: false, clickThrough: true, walkHorizontal: true, walkVertical: false, lockToScreen: true });
  assert.ok(menu().some(entry => entry.label === 'Quit companions'));
  const again = await launch({ settings: stored(userData) });
  assert.equal(again.window.options.alwaysOnTop, false);
  assert.deepEqual(last(again.window.calls, 'top'), ['top', false]);
});

test('click-through: transparent space passes through, a chibi under the cursor does not', async () => {
  const { window, ipcMain, trusted, poll, cursor } = await launch();
  ipcMain.emit('regions', trusted, [{ x: 380, y: 380, width: 50, height: 50 }]);
  poll(); assert.deepEqual(last(window.calls, 'ignore'), ['ignore', false]);
  cursor.x = 10; poll(); assert.deepEqual(last(window.calls, 'ignore'), ['ignore', true, { forward: true }]);
  // Forwarded mousemove reports a chibi before the next poll.
  ipcMain.emit('hover', trusted, true); assert.deepEqual(last(window.calls, 'ignore'), ['ignore', false]);
  ipcMain.emit('hover', trusted, false); assert.deepEqual(last(window.calls, 'ignore'), ['ignore', true, { forward: true }]);
  ipcMain.emit('dragging', trusted, true); assert.deepEqual(last(window.calls, 'ignore'), ['ignore', false]);
  poll(); assert.deepEqual(last(window.calls, 'ignore'), ['ignore', false], 'held chibi keeps the mouse');
});

test('walking axes default to horizontal only and are remembered', async () => {
  const { item, userData } = await launch();
  assert.equal(item('Walk side to side').checked, true);
  assert.equal(item('Walk up and down').checked, false);
  item('Walk up and down').click();
  assert.deepEqual(stored(userData), { alwaysOnTop: true, clickThrough: true, walkHorizontal: true, walkVertical: true, lockToScreen: true });
  item('Walk side to side').click();
  assert.deepEqual(stored(userData), { alwaysOnTop: true, clickThrough: true, walkHorizontal: false, walkVertical: true, lockToScreen: true });
});

test('the overlay covers every display and reports their layout in window coordinates', async () => {
  const { window, ipcMain, trusted } = await launch();
  assert.equal(window.options.width, 1280);
  assert.equal(window.options.height, 720);
  ipcMain.emit('get-displays', trusted);
  assert.deepEqual(window.sent.at(-1), ['displays', [{ x: 0, y: 0, width: 1280, height: 720, primary: true }]]);
});

test('click-through off captures the mouse everywhere, at once and on every poll', async () => {
  const { window, ipcMain, trusted, poll, userData } = await launch({ cursor: { x: 5, y: 5 } });
  assert.deepEqual(last(window.calls, 'ignore'), ['ignore', true, { forward: true }]);
  ipcMain.emit('set-setting', trusted, 'clickThrough', false);
  assert.deepEqual(last(window.calls, 'ignore'), ['ignore', false]);
  const count = window.calls.length; poll(); ipcMain.emit('hover', trusted, false);
  assert.equal(window.calls.length, count, 'nothing re-enables pass-through');
  assert.equal(stored(userData).clickThrough, false);
  ipcMain.emit('set-setting', trusted, 'clickThrough', true);
  assert.deepEqual(last(window.calls, 'ignore'), ['ignore', true, { forward: true }]);
});

test('settings IPC accepts only known boolean keys from the app frame', async () => {
  const { window, ipcMain, trusted, userData } = await launch();
  ipcMain.emit('set-setting', trusted, 'alwaysOnTop', 'no');
  ipcMain.emit('set-setting', trusted, 'frame', false);
  ipcMain.emit('set-setting', { ...trusted, sender: {} }, 'alwaysOnTop', false);
  assert.equal(fs.existsSync(path.join(userData, 'settings.json')), false);
  assert.equal(last(window.calls, 'top')[1], true);
});

test('a damaged settings file falls back to defaults', async () => {
  const { window } = await launch({ settings: { alwaysOnTop: 'yes', clickThrough: false, extra: 1 } });
  assert.equal(window.options.alwaysOnTop, true);
  assert.deepEqual(last(window.calls, 'ignore'), ['ignore', false]);
});

test('hit regions for every chibi at the limit are accepted', async () => {
  assert.ok(maxChibis > 15, 'the shared WebGL stage lifts the 15-context ceiling');
  const { window, ipcMain, trusted, poll, cursor } = await launch({ cursor: { x: 5, y: 5 } });
  const regions = Array.from({ length: maxChibis + 1 }, (_, i) => ({ x: i * 20, y: 0, width: 10, height: 10 }));
  ipcMain.emit('regions', trusted, regions);
  cursor.x = maxChibis * 20 + 5; poll();
  assert.deepEqual(last(window.calls, 'ignore'), ['ignore', false], 'the last chibi is still grabbable');
});

test('Linux Wayland runs under XWayland and a relaunch turns click-through back off', async () => {
  const x11 = await launch({ platform: 'linux', env: { XDG_SESSION_TYPE: 'x11' } });
  assert.deepEqual(x11.switches, []);
  const { app, switches, window, userData } = await launch({ platform: 'linux', env: { XDG_SESSION_TYPE: 'wayland', WAYLAND_DISPLAY: 'wayland-0' } });
  assert.deepEqual(switches, [['ozone-platform', 'x11']]);
  app.emit('second-instance');
  assert.deepEqual(last(window.calls, 'ignore'), ['ignore', false]);
  assert.equal(stored(userData).clickThrough, false);
  assert.ok(window.calls.includes('show-controls'));
});
