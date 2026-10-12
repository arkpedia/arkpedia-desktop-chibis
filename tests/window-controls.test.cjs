const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

// Exercise the actual main-process wiring without needing a desktop session.
async function launch() {
  let window, tray, applicationMenu, poll;
  const app = Object.assign(new EventEmitter(), {
    setName() {}, setPath() {}, getPath: () => '/tmp',
    requestSingleInstanceLock: () => true, whenReady: () => Promise.resolve(), quit() {},
  });
  class Window extends EventEmitter {
    constructor(options) {
      super(); window = this; this.options = options; this.minimized = false; this.visible = true; this.calls = [];
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: 'arkchibi://app/' }, setWindowOpenHandler() {}, send: message => this.calls.push(message),
      });
    }
    isDestroyed() { return false; }
    isMinimized() { return this.minimized; }
    isVisible() { return this.visible; }
    minimize() { this.minimized = true; this.calls.push('minimize'); }
    restore() { this.minimized = false; this.calls.push('restore'); }
    show() { this.visible = true; this.calls.push('show'); }
    focus() { this.calls.push('focus'); }
    setAlwaysOnTop() {} setVisibleOnAllWorkspaces() {} setBounds() {}
    getBounds() { return { x: 0, y: 0 }; }
    setIgnoreMouseEvents(value) { this.calls.push(['ignore', value]); }
    async loadURL() { this.calls.push('load'); }
  }
  const ipcMain = new EventEmitter();
  const electron = {
    app, BrowserWindow: Window, ipcMain,
    Tray: class extends EventEmitter { constructor() { super(); tray = this; } setTitle() {} setToolTip() {} setContextMenu(menu) { this.menu = menu; } },
    nativeImage: { createFromDataURL: () => ({ resize: () => ({}) }) },
    Menu: { buildFromTemplate: x => x, setApplicationMenu: x => { applicationMenu = x; } },
    screen: Object.assign(new EventEmitter(), { getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1280, height: 720 } }), getCursorScreenPoint: () => ({ x: 400, y: 400 }) }),
    protocol: { registerSchemesAsPrivileged() {}, handle() {} }, net: {},
    session: { defaultSession: { setPermissionRequestHandler() {}, setPermissionCheckHandler() {} } },
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '../electron/main.cjs'), 'utf8'), {
    require: id => id === 'electron' ? electron : require(id), __dirname: path.join(__dirname, '../electron'),
    process: { argv: [] }, setInterval: fn => { poll = fn; return 1; }, clearInterval() {}, URL, Response,
  });
  await Promise.resolve();
  const trusted = { sender: window.webContents, senderFrame: window.webContents.mainFrame };
  return { app, window, tray, ipcMain, applicationMenu, poll, trusted };
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
    else if (entry === 'menu') applicationMenu[0].submenu[0].click();
    else app.emit(entry);
    assert.equal(window.isMinimized(), false);
    assert.deepEqual(window.calls, ['restore', 'show', 'focus', 'show-controls']);
  });
}
