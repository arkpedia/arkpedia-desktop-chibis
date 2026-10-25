# Arkpedia Chibis Dev 0.3.2

## Minimize means minimize again

0.3.0 made `−` collapse the picker into the floating **Chibis +** chip, which left a small window on screen instead of sending the app to the Dock (macOS) or taskbar (Windows). `−` is a real minimize again: the window leaves the screen, and you restore it from the Dock/taskbar, the tray menu, or by launching the app again.

**Hide picker** still does the other thing — it puts the picker away behind the **Chibis +** chip and leaves the chibis walking. That is the way to keep the desktop clean without telling the OS to minimize anything.

## Windows: overlay bounds re-applied after load

Windows can clamp a frameless window that is created larger than a single monitor. The overlay now re-applies its full multi-display bounds once the page has loaded, on top of the existing display-added/removed/metrics handling.

This is a mitigation, not a guarantee: a single transparent window spanning monitors with **different display scaling** is a weak point in Chromium/Electron, because the window has one scale factor while the pointer and the second monitor have another. If dragging still stops at the boundary on a mixed-scaling setup, the honest fix is one overlay window per display, with chibis handed between them — a larger refactor, not a patch.

## Validation

27 tests pass and the TypeScript/Vite build is clean. macOS bundles are ad-hoc signed; Windows and Linux packages come from CI and were not executed on those platforms here.
