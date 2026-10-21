# Arkpedia Chibis Dev 0.4.0

## The chibis and the picker are separate windows

Until now the picker lived inside the same full-screen overlay as the chibis, which left "minimize" with no good meaning: minimizing the picker had to either hide the chibis too or leave a floating chip behind. Both were wrong.

- **Chibis window**: transparent, frameless, always ready, click-through on empty space, spanning every display. It contains only the chibis. It never minimizes.
- **Picker window**: an ordinary window with a title bar and its own Dock/taskbar entry. Minimizing it is just a normal minimize, and the chibis keep walking.

Reopen the picker from the Dock or taskbar, the tray menu's **Show companion controls**, or by launching the app again. Closing the picker window quits the app.

The **Hide picker** button and the floating **Chibis +** chip are gone; they only existed to work around the single-window design.

## Picker changes

- **Clear all** empties the desktop in one press.
- The footer count now reflects what the overlay actually holds, reported back by the chibis window.
- Adding a chibi sends it straight to the chibis window; the two windows share the catalogue and the settings but nothing else.

## Still true from 0.3.x

One picker row per operator with real outfit names, walking toggles (side to side / up and down, diagonal with both), an overlay spanning every display, the stay-on-one-screen lock, click-through that only engages on chibis, and **Follow across desktops** as its own switch.

The Windows multi-display caveat remains: a single transparent window spanning monitors with different display scaling is a Chromium/Electron weak point. If dragging still stops at the boundary there, the fix is one overlay per display.

## Validation

21 tests pass, covering the two-window split: the overlay stays put when the picker minimizes, only the picker can publish chibi additions or minimize, malformed entries are dropped, the count is bounded, and untrusted frames cannot change settings. TypeScript and the Vite build are clean. A real Electron run with an isolated data directory was used to confirm both windows load (two renderer processes, no crash); macOS packages are ad-hoc signed.
