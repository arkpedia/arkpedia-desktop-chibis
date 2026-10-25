// Remembered preferences. Only known keys with validated values survive a read, so a
// damaged or hand-edited file can never put the window in an unknown state.
const fs = require('node:fs');
const path = require('node:path');

const DEFAULTS = Object.freeze({ alwaysOnTop: true, followSpaces: true, clickChibis: false, walkHorizontal: true, walkVertical: false, lockToScreen: true, rememberChibis: true, fpsLimit: 60, launchAtLogin: false, gravity: false, windowEdges: false });
const KEYS = Object.keys(DEFAULTS);
const validSetting = (key, value) => KEYS.includes(key) && (key === 'fpsLimit' ? [15, 30, 60].includes(value) : typeof value === 'boolean');

function normalize(value) {
  const result = { ...DEFAULTS };
  if (value && typeof value === 'object') for (const key of KEYS) if (validSetting(key, value[key])) result[key] = value[key];
  return result;
}

function createSettings(file) {
  let current;
  try { current = normalize(JSON.parse(fs.readFileSync(file, 'utf8'))); }
  catch { current = normalize(null); }
  const save = () => {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const temporary = `${file}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, JSON.stringify(current, null, 2));
      fs.renameSync(temporary, file);
    } catch { /* Settings stay in memory for this session. */ }
  };
  return {
    get: () => ({ ...current }),
    /** Returns true when the value was accepted and changed. */
    set(key, value) {
      if (!validSetting(key, value) || current[key] === value) return false;
      current = { ...current, [key]: value };
      save();
      return true;
    },
  };
}

/** macOS: screen-saver sits above the Dock, menu bar and other apps' floating panels.
 * Windows: any level but normal is HWND_TOPMOST; screen-saver also keeps it over the taskbar.
 * Elsewhere floating is the widely supported level. */
const topLevel = platform => platform === 'darwin' || platform === 'win32' ? 'screen-saver' : 'floating';

/** Empty space always passes clicks through to the apps below. The mouse is taken back only
 * while the cursor is over something interactive (chibi, picker, launcher) or a chibi is held;
 * "clicks pass through chibis" simply stops the chibis from counting as interactive. */
const shouldIgnoreMouse = ({ dragging, overInteractive }) => !dragging && !overInteractive;

/** What the overlay can rely on per platform.
 * - macOS, Windows: forwarded mousemove and a global cursor position, so click-through can still
 *   hand a chibi under the cursor back its mouse input.
 * - Linux X11: no forwarding, but the global cursor poll works, so the same behaviour holds.
 * - Linux Wayland: no client may set always-on-top or read the global pointer. The app runs under
 *   XWayland (ozone x11), where most compositors honour always-on-top, but the pointer is unknown
 *   while it is over native Wayland windows, so click-through cannot hit-test chibis reliably. */
function overlaySupport(platform, env = {}) {
  if (platform !== 'linux') return { session: null, preferX11: false, cursorTracking: true, forwardedMouse: platform === 'darwin' || platform === 'win32' };
  const wayland = env.XDG_SESSION_TYPE === 'wayland' || (!!env.WAYLAND_DISPLAY && env.XDG_SESSION_TYPE !== 'x11');
  return { session: wayland ? 'wayland' : 'x11', preferX11: wayland, cursorTracking: !wayland, forwardedMouse: false };
}

module.exports = { DEFAULTS, KEYS, validSetting, normalize, createSettings, topLevel, shouldIgnoreMouse, overlaySupport };
