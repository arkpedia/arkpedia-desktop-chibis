# Arkpedia Chibis Dev 0.2.0

First release with downloadable packages for all three platforms, built by CI on the `v0.2.0` tag: macOS `.dmg` / `.zip`, Windows NSIS `.exe` / `.zip`, Linux `.AppImage` / `.deb` (`arm64` and `x64` where applicable). Unsigned development previews.

## Overlay modes

Two settings, remembered between launches in `settings.json` and changeable from the picker's **Overlay** box, the tray / menu-bar menu and the app menu.

- **Always on top** (default on): the transparent, frameless overlay covering the primary display's work area stays above every window, on every workspace, and over full-screen apps where the OS allows it. Off: an ordinary window that other windows can cover; bring it back from the taskbar/Dock or tray.
- **Click-through** (default on): clicks on empty space reach the apps below, while a chibi, the picker or the launcher takes the mouse back so it stays draggable. Off: the overlay captures every click.

Per-platform behaviour — macOS `screen-saver` level, topmost on Windows, `_NET_WM_STATE_ABOVE` on Linux X11; Wayland has no always-on-top for apps, so the app runs under XWayland and a relaunch turns click-through back off so you are never locked out. The README's overlay table has the details.

## Chibi rendering

One WebGL context on one full-window canvas now draws every chibi, replacing the per-chibi canvas. Electron drops the oldest of ~16 live contexts, which is what broke the old design above 15 chibis; the limit is now 32. Skeleton data and textures are shared between copies of the same chibi. Texture uploads and every renderer are premultiplied to match spine-ts 3.8's Screen and Multiply blending, and a chibi's size is fixed from its idle pose so reactions with larger bounds do not resize it. `tests/spine-guards.test.mjs` fails if a second context or scene renderer appears.

## Packaging

`electron-builder` targets macOS (`dmg`, `zip`), Windows (`nsis`, `zip`) and Linux (`AppImage`, `deb`), with per-architecture builds. `.github/workflows/release.yml` runs tests and builds all three on every `v*` tag, then attaches the packages plus `SHA256SUMS.txt` to a pre-release. It also builds on pull requests that touch packaging, without publishing.

Validation: 24 focused tests pass (window controls, IPC, settings, framing, renderer guards) and the TypeScript/Vite build is clean. The packages in this release are produced by that CI workflow; runtime execution on each platform has not been re-tested by hand for this version.
