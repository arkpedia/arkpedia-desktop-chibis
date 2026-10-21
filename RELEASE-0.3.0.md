# Arkpedia Chibis Dev 0.3.0

Unsigned development preview. Packages for macOS, Windows and Linux are built by CI on the `v0.3.0` tag.

## One chibi per operator, real outfit names

The picker listed an operator's base and Elite 2 chibis as two separate rows, and outfit rows carried their internal ids (`Aak · nian#4`). Both are fixed: the catalogue now has **one row per operator** (the Elite 2 model when it exists, otherwise the base one) and outfits use their real names (`Aak · Doctor of Faces`). That drops the list from 1352 rows to 954 without losing any outfit.

## Walking directions

Two remembered toggles, in the picker's **Walking** box, the tray menu and the app menu:

- **Side to side** (default on)
- **Up and down** (default off)

With both on, a chibi picks a point anywhere on its screen and walks there in a straight line, so it moves diagonally at the same speed as a straight walk. With both off it stays put. Arrow keys still nudge a focused chibi.

## Every display

The overlay used to cover only the primary display's work area, so chibis could not be dragged to another screen. It now spans the union of all displays' work areas and follows displays being added, removed, moved or resized. Drag a chibi to any screen.

- **Stay on one screen** (default on) keeps each chibi walking within the display it is currently on. Dragging always crosses screens; the lock only constrains walking.
- Off, a chibi may pick a target on another display and walk there.

## The minus button collapses the controls

`−` and **Hide picker** now put the picker away behind the **Chibis +** chip and leave the chibis walking, instead of minimising the whole window. Minimising the app is still available from the tray and app menus.

## Click-through hardening

- The window accepts the first click, so a tap on a chibi or a picker button no longer gets swallowed by window activation.
- A drag released outside the window, or interrupted by the window losing focus, no longer leaves click-through stuck off (the window capturing every click until restart).
- The per-chibi controls (size, pause, remove) no longer intercept taps while they are invisible; they take the mouse only while hovered or focused.

## Validation

26 tests pass, including new coverage for the walking-axis defaults, their persistence and the multi-display layout handed to the renderer. TypeScript and the Vite build are clean. The macOS, Windows and Linux packages are produced by the same CI workflow as 0.2.0, with the macOS bundles ad-hoc signed so Gatekeeper reports an unverified developer rather than a damaged app.
