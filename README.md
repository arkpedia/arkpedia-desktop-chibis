# Arkpedia Chibis — development preview

A separate Windows/macOS companion. It has no account import, website storage, production routes, login, auto-start, or automatic updater. Its native transparent window stays on top independently of the browser, so minimizing a browser does not stop the companions.

## Try it

- macOS Apple Silicon: unzip `releases/Arkpedia-Chibis-Dev-0.1.1-mac-arm64.zip`, then open **Arkpedia Chibis Dev.app**.
- Intel macOS: use `releases/Arkpedia-Chibis-Dev-0.1.1-mac-x64.zip`.
- Windows x64: unzip `releases/Arkpedia-Chibis-Dev-0.1.1-win-x64.zip`, then open **Arkpedia Chibis Dev.exe**.
- Windows ARM64: use `releases/Arkpedia-Chibis-Dev-0.1.1-win-arm64.zip`.
- These are unsigned development builds. Native execution was checked on macOS; Windows needs testing on a Windows machine.

Search for an operator or outfit and press +. Up to eight chibis can walk independently. Drag a chibi to place it; tap for its native reaction. Hover or focus it for size, pause, and remove controls. Arrow keys move a focused chibi; Escape removes it. **−** minimizes the entire companion to the Windows taskbar or macOS Dock, preserving your chibis and settings until you quit. Click its taskbar/Dock icon to restore it. The tray/menu-bar entry and app menu also offer **Show companion controls** and **Minimize companions**; Ctrl+M (Windows) or Cmd+M (macOS) minimizes it too. **Hide picker** keeps the chibis walking and leaves a compact **Chibis +** launcher with its own minimize button. Quit exits the whole companion.

Transparent space passes clicks through to the desktop and other apps. The first preview uses the primary display work area. Chibis walk horizontally at their chosen height. Placements reset when the app closes. Artwork loads from pinned public Arkpedia SD assets, so the first load requires internet.

## Develop

Node 24+, `npm ci`, `npm run build`, `npm start`.

Run `node --test tests/window-controls.test.cjs` for focused window lifecycle and IPC checks. Launch with `--window-diagnostics` to print native minimize/restore events without exposing renderer data.

`npm run package:mac` builds Apple Silicon macOS; `npm run package:win` builds Windows x64. To build all four release ZIPs use `npm run build && npx electron-builder --mac zip --win zip --arm64 --x64 --publish never`.

The catalogue is a snapshot of **arkpedia-data dev**, revision `268c22db9787b90ca8c70e7e5cf2b1ea5a053fe1`, at `source/data/chibi-art.json`. Metadata is in `src/catalogue-source.json`. There is no production website integration. ZIPs are standalone development-preview releases. Changing this app cannot change the website.

Renderer code runs sandboxed with context isolation and no Node integration. IPC accepts only bounded hit regions, drag state, minimize, and quit requests from the local main frame. Remote navigation, new windows, and permission requests are denied. Only pinned HTTPS artwork is fetched; the application JavaScript is bundled locally.

## Credits

Arknights characters and artwork belong to their respective owners. Rendering uses the Arkpedia Spine 3.8 adapter and the unmodified Spine runtime. Preserve `public/SPINE-LICENSE.txt` and the notices in `src/lib/vendor/spine-3.8` when redistributing. The runtime license remains applicable.
