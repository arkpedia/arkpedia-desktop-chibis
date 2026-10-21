# Arkpedia Chibis — desktop companion

Arknights chibis walking on your desktop, for macOS, Windows and Linux. A separate app: no account import, website storage, login, auto-start or automatic updater.

## Download

**[Download the latest release →](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest)** Pick your platform and click the file. No account needed.

| Your computer | File to pick |
|---|---|
| macOS, Apple Silicon (M1–M4) | [`Arkpedia-Chibis-Dev-mac-arm64.dmg`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-mac-arm64.dmg) |
| macOS, Intel | [`Arkpedia-Chibis-Dev-mac-x64.dmg`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-mac-x64.dmg) |
| Windows 10/11, 64-bit (x86-64) | [`Arkpedia-Chibis-Dev-win-x64.exe`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-win-x64.exe) |
| Windows on ARM | [`Arkpedia-Chibis-Dev-win-arm64.exe`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-win-arm64.exe) |
| Linux, x86-64 | [`Arkpedia-Chibis-Dev-linux-x86_64.AppImage`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-linux-x86_64.AppImage) |
| Linux, ARM64 | [`Arkpedia-Chibis-Dev-linux-arm64.AppImage`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-linux-arm64.AppImage) |

There is no 32-bit Windows build: Electron no longer ships 32-bit Windows binaries, so Windows 10/11 64-bit or ARM64 are the only targets. The combined `Arkpedia-Chibis-Dev-win.exe` installer picks the right one automatically.

Filenames never change between versions, so any of those links keeps working after a release: it always serves the newest build. Each platform also has a portable `.zip` (macOS, Windows) and a `.deb` (Linux) with the same naming, plus `SHA256SUMS.txt` on the release page.

The builds are unsigned development previews. On **macOS** the app is ad-hoc signed but not notarized, so Gatekeeper blocks the first launch: open **System Settings → Privacy & Security**, click **Open Anyway** next to *Arkpedia Chibis Dev*, and confirm. macOS 15 and later removed the old right-click → **Open** shortcut; from a terminal, `xattr -dr com.apple.quarantine "/Applications/Arkpedia Chibis Dev.app"` also works. On **Windows**, SmartScreen shows an unknown-publisher warning → **More info** → **Run anyway**.

## Using it

The app runs as **two windows**: the chibis live in a transparent, click-through overlay, and the picker is an ordinary window with a title bar. Search for an operator or outfit in the picker and press +. Up to **32** chibis walk independently; drag one to place it, tap it for its native reaction, hover or focus it for size, pause and remove controls. Arrow keys move a focused chibi; Escape removes it. **Clear all** empties the desktop.

Because the picker is just a window, minimizing it leaves the chibis walking; reopen it from the Dock/taskbar, the tray menu's **Show companion controls**, or by launching the app again. Closing the picker window quits the app, so there are no in-window quit or minimize buttons — the title bar already has them.

Between walks a chibi sits, sleeps, idles or plays its special animation, chosen from whatever the model provides. **Settings → Remember my chibis** (on by default) saves the current set and restores it on the next launch; **Settings → Remove every chibi from the desktop** clears it. Artwork loads from pinned public Arkpedia SD assets, so the first load needs internet.

## Overlay modes

Clicks on empty space always go to the apps below; the overlay only takes the mouse back over a chibi, the picker or the launcher. The remaining options are remembered between launches (`settings.json` in the app's user-data folder) and can be changed from the picker's **Settings** (the gear button), the tray / menu-bar menu, and the app menu. The tray menu also has **Quit companions**.

- **Always on top** (default on): the overlay stays above every window. Off: it is an ordinary window that other windows can cover; bring it back from the taskbar/Dock or the tray.
- **Follow across desktops** (default on): the chibis appear on every Space / workspace, including over full-screen apps where the OS allows it. Off: they stay on the desktop they were opened on. Independent of always-on-top.
- **Clicks pass through chibis** (default off): the chibis stop taking the mouse entirely, so a click anywhere — including on a chibi — reaches the app underneath. The picker and launcher still work. Turn it off again to drag or tap chibis.

| | macOS | Windows | Linux X11 | Linux Wayland |
|---|---|---|---|---|
| Always on top | `screen-saver` level | topmost (`screen-saver`), over the taskbar | `_NET_WM_STATE_ABOVE`, honoured by most window managers | Wayland has no always-on-top for apps. The app runs under XWayland (`--ozone-platform=x11`), where GNOME and KDE usually honour it; some compositors may not |
| Follow across desktops | `canJoinAllSpaces` plus `fullScreenAuxiliary`; macOS may briefly hide the Dock icon while it switches process type | not applicable; a window is visible on its virtual desktop | `sticky` where the window manager supports it | compositor-dependent; not exposed to XWayland clients |
| Taking the mouse back over a chibi | forwarded mouse moves plus a cursor poll | forwarded mouse moves plus a cursor poll | cursor poll (no forwarding on Linux) | the app cannot see the pointer over native Wayland windows, so chibis may not respond; relaunching shows the controls |
| Tray | menu bar | notification area | needs a StatusNotifier / AppIndicator host (GNOME: the AppIndicator extension) | same |

On Linux a compositing window manager is needed for transparency. Without a tray host, use the picker's **Settings** (gear), or relaunch the app to show the picker.

## Walking and screens

Chibis wander left and right by default. **Settings** (gear) → **Walking**, the tray menu and the app menu add **up and down**; with both on a chibi picks a point anywhere and walks there in a straight line, so it moves diagonally without speeding up. Both off leaves them standing where they are. The axes are remembered between launches.

The overlay covers every display's work area, so you can drag a chibi from one screen to another. **Stay on one screen** (default on) keeps each chibi walking within the screen it is currently on; turn it off and a chibi may wander onto another display. Dragging works either way, so the lock only constrains walking.

## How chibis are drawn

Every chibi is drawn by **one WebGL context on one full-window canvas**. Browsers and Electron keep only about 16 live WebGL contexts and drop the oldest, which is why one canvas per chibi breaks above 15. `tests/spine-guards.test.mjs` fails if a second context or scene renderer appears. Copies of the same chibi share their skeleton data and textures.

A chibi's size is set once, from the **height** of its visible idle pose, and does not change when it plays a reaction with larger bounds. Width is deliberately ignored: a wide weapon, cape or banner must not make the character smaller than the others, so the art may extend past its square hit box instead of being shrunk to fit.

Texture pages are uploaded premultiplied (`src/lib/spine/premultipliedTexture.ts`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL`) and every skeleton is drawn with `premultipliedAlpha = true`, because spine-ts 3.8 blends Screen and Multiply slots as premultiplied either way. The guard test also holds every renderer to this.

## Develop

Node 24+.

```sh
npm ci
npm test        # window/IPC/settings logic, framing math, renderer guards; no GUI
npm run build   # TypeScript check + Vite build into dist/
npm start       # runs the app (downloads the Electron binary on first run)
```

Launch with `--window-diagnostics` to print native minimize/restore events. Packages go to `releases/`:

```sh
npm run package:mac     # dmg + zip, arm64 + x64 (on macOS)
npm run package:win     # nsis + zip, x64 + arm64 (on Windows)
npm run package:linux   # AppImage + deb, x64 + arm64 (on Linux)
```

`.github/workflows/ci.yml` runs tests and the build on macOS, Windows and Ubuntu for every pull request. `.github/workflows/release.yml` packages all three on a `v*` tag and attaches them, with `SHA256SUMS.txt`, to a GitHub Release.

Renderer code runs sandboxed with context isolation and no Node integration. IPC accepts only bounded hit regions, drag/hover state, the two boolean settings, minimize and quit requests from the local main frame. Remote navigation, new windows and permission requests are denied. Only pinned HTTPS artwork is fetched; the application JavaScript is bundled locally.

## Artwork and catalogue

`src/catalogue.json` is a snapshot of the website's chibi catalogue (`arkpedia/arkpedia-data`, dev, `source/data/chibi-art.json` at the revision in `src/catalogue-source.json`). Every model it lists is served from [arkpedia/arkpedia-sd-assets](https://github.com/arkpedia/arkpedia-sd-assets) at one immutable commit; the app bundles no artwork. See that repository's `README.md`, `LICENSE` and `NOTICE.md` for provenance and terms. Changing this app cannot change the website.

## Credits

Arknights is developed by Hypergryph ([鹰角网络](https://www.hypergryph.com/)) and Studio Montagne. Hypergryph publishes it in mainland China, [Yostar](https://www.yostar.co.jp/) publishes the worldwide release (global, Japanese and Korean), and [Gryphline](https://www.gryphline.com/), Hypergryph's global publishing brand, publishes the Traditional Chinese server in Taiwan and other Hypergryph titles. Character names, artwork, Spine models and game data belong to Hypergryph, Yostar and their rights holders. This desktop companion is an unofficial fan project: it is not affiliated with, endorsed by or licensed by any of them, and it grants no rights to that material.

Rendering uses the unmodified Spine Runtimes 3.8 (spine-ts WebGL); preserve `public/SPINE-LICENSE.txt` and the notices in `src/lib/vendor/spine-3.8` when redistributing. The Spine Runtimes License remains applicable.

The app code is all rights reserved for now (`UNLICENSED` in package.json): this repository being public lets people read and download it, but grants no licence to reuse it. A licence will be chosen separately.
