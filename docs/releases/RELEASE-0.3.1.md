# Arkpedia Chibis Dev 0.3.1

Two corrections to how the overlay behaves, on top of the 0.3.0 catalog and walking work.

## Click-through means two different things

0.3.0 had one **Click-through** switch that turned the whole overlay into a click magnet when off. That was the wrong shape:

- **Empty space always passes clicks through.** There is no longer a mode where the overlay captures clicks on the desktop; the window only takes the mouse back while the cursor is over a chibi, the picker or the launcher.
- **Clicks pass through chibis** is a new, separate switch (default off). On, a chibi stops taking the mouse at all: clicking it reaches the app underneath, and the picker and launcher still work. It is the decoration mode — drag and tap stop working while it is on.

## Chibis follow you across desktops

Following across macOS Spaces was previously a side effect of **Always on top**, so turning that off also stranded the chibis on one desktop. It is now its own remembered switch, **Follow across desktops** (default on), in the picker, the tray menu and the app menu. It also re-asserts the "join all Spaces" flag after a restore, which macOS can otherwise drop.

Windows has no equivalent: a window lives on its virtual desktop. On Linux the behaviour depends on the window manager, and XWayland does not expose it.

## Validation

27 tests pass, including the new pass-through and desktops toggles. TypeScript and the Vite build are clean. macOS bundles are ad-hoc signed; Windows and Linux packages come from the same CI workflow and were not executed on those platforms.
