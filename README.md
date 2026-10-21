# Arkpedia Chibis — desktop companion

Arknights chibis walking on your desktop, for macOS, Windows and Linux. A separate app: no account import, website storage, login, auto-start or automatic updater.

## Download

**[Download the latest release →](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest)** Pick your platform and click the file. No account needed.

| Your computer | File to pick |
|---|---|
| macOS, Apple Silicon (M1–M4) | [`Arkpedia-Chibis-Dev-mac-arm64.dmg`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-mac-arm64.dmg) |
| macOS, Intel | [`Arkpedia-Chibis-Dev-mac-x64.dmg`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-mac-x64.dmg) |
| Windows, most PCs | [`Arkpedia-Chibis-Dev-win-x64.exe`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-win-x64.exe) |
| Windows on ARM | [`Arkpedia-Chibis-Dev-win-arm64.exe`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-win-arm64.exe) |
| Linux, x86-64 | [`Arkpedia-Chibis-Dev-linux-x86_64.AppImage`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-linux-x86_64.AppImage) |
| Linux, ARM64 | [`Arkpedia-Chibis-Dev-linux-arm64.AppImage`](https://github.com/arkpedia/arkpedia-desktop-chibis/releases/latest/download/Arkpedia-Chibis-Dev-linux-arm64.AppImage) |

Filenames never change between versions, so any of those links keeps working after a release: it always serves the newest build. Each platform also has a portable `.zip` (macOS, Windows) and a `.deb` (Linux) with the same naming, plus `SHA256SUMS.txt` on the release page.

The builds are unsigned development previews. On **macOS** the app is ad-hoc signed but not notarized, so Gatekeeper blocks the first launch: open **System Settings → Privacy & Security**, click **Open Anyway** next to *Arkpedia Chibis Dev*, and confirm. macOS 15 and later removed the old right-click → **Open** shortcut; from a terminal, `xattr -dr com.apple.quarantine "/Applications/Arkpedia Chibis Dev.app"` also works. On **Windows**, SmartScreen shows an unknown-publisher warning → **More info** → **Run anyway**.

## Using it

Search for an operator or outfit and press +. Up to **32** chibis walk independently. Drag a chibi to place it; tap it for its native reaction. Hover or focus it for size, pause and remove controls. Arrow keys move a focused chibi; Escape removes it. **−** minimizes the companion to the taskbar or Dock; **Hide picker** keeps the chibis walking behind a small **Chibis +** launcher. Placements reset when the app quits. Artwork loads from pinned public Arkpedia SD assets, so the first load needs internet.

## Overlay modes

Both are remembered between launches (`settings.json` in the app's user-data folder) and can be changed from the picker's **Overlay** box, the tray / menu-bar menu, and the app menu. The tray menu also has **Quit companions**.

- **Always on top** (default on): the transparent, frameless overlay covering the primary display's work area stays above every window and on every workspace / Space, including over full-screen apps where the OS allows it. Off: it is an ordinary window that other windows can cover; bring it back from the taskbar/Dock or the tray.
- **Click-through** (default on): clicks on empty space go to the apps below. When the cursor is over a chibi, the picker or the launcher, the overlay takes the mouse back so you can drag or tap it. Off: the overlay captures every click on the screen (useful for playing with chibis without hitting the apps below).

| | macOS | Windows | Linux X11 | Linux Wayland |
|---|---|---|---|---|
| Always on top | `screen-saver` level, all Spaces, over full-screen apps | topmost (`screen-saver`), over the taskbar | `_NET_WM_STATE_ABOVE`, honoured by most window managers | Wayland has no always-on-top for apps. The app runs under XWayland (`--ozone-platform=x11`), where GNOME and KDE usually honour it; some compositors may not |
| Click-through | forwarded mouse moves plus a cursor poll | forwarded mouse moves plus a cursor poll | cursor poll (no forwarding on Linux) | Pass-through works, but the app cannot see the pointer over native Wayland windows, so chibis may not respond while it is on. Launching the app again shows the controls **and turns click-through off**, so you are never locked out |
| Tray | menu bar | notification area | needs a StatusNotifier / AppIndicator host (GNOME: the AppIndicator extension) | same |

On Linux a compositing window manager is needed for transparency. Without a tray host, use the picker's **Overlay** box, or relaunch the app to show the controls.

## How chibis are drawn

Every chibi is drawn by **one WebGL context on one full-window canvas**. Browsers and Electron keep only about 16 live WebGL contexts and drop the oldest, which is why one canvas per chibi breaks above 15. `tests/spine-guards.test.mjs` fails if a second context or scene renderer appears. Copies of the same chibi share their skeleton data and textures.

A chibi's size is set once, from its visible idle pose, and does not change when it plays a reaction with larger bounds. Art may extend past the hit box instead of being shrunk to fit.

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
