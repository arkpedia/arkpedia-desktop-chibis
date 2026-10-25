# Arkpedia Chibis Dev 0.1.1

Standalone development-preview ZIPs in `releases/`; no website integration or automatic update. Unzip the complete archive and launch the `.app` or `.exe`. Builds are unsigned.

- The minus button minimizes all companions to the Windows taskbar or macOS Dock.
- Restore from the taskbar/Dock, tray/menu-bar menu, or app menu without recreating your chibis.
- Hide picker keeps chibis walking; the compact launcher also has a minimize button.
- Ctrl+M / Cmd+M minimizes the app. Quit ends the session.

Validation: TypeScript and Vite build passed; seven focused IPC/window lifecycle checks passed. The packaged macOS ARM64 app emitted native `minimize` (`minimized: true`, `visible: false`) and `restore` events; the added 12F chibi survived restoration. Both picker and compact launcher minimize controls were exercised. Hide picker retained the running chibi. Test app was quit afterwards.

Windows x64 and ARM64 archives built successfully and their PE architecture headers were checked. All four packages contain the current main/preload files and version 0.1.1; ZIP integrity and SHA-256 checksums were verified. Windows and Intel macOS runtime execution remain untested.

Files: `releases/SHA256SUMS-0.1.1.txt`, `releases/release-0.1.1.json`, and `releases/companion-0.1.1-controls.png`.

The platform behavior uses Electron's [documented BrowserWindow minimization and taskbar support](https://www.electronjs.org/docs/latest/api/browser-window/). Packages are local downloadable release artifacts; this standalone repository has no configured remote publisher.
