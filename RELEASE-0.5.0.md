# Arkpedia Chibis Dev 0.5.0

## Settings moved out of the list

The picker's overlay and walking options used to sit under the operator list, eating the space the list actually needs. They now live behind a **gear button** in the picker's header: the list fills the window, and one click swaps it for the settings view (and the arrow swaps back). The footer keeps only the chibi count.

The **Quit** and **−** buttons are gone, because the title bar already provides both: closing the picker quits the app, and the OS minimize puts the picker away while the chibis keep walking. **Remove every chibi from the desktop** moved into the settings view.

## The chibis sleep, sit and perform

Between walks, a chibi now chooses a resting behaviour from the animations its model actually has:

- **sit** — loops for a few seconds (35% of rests)
- **sleep** — a longer loop (20%)
- **special** — plays once, then back to idle (17%)
- **idle** — plain Relax, the remaining rests

A tap still interrupts with the native reaction, and walking still wins over any rest. Models without sit or sleep simply skip those branches.

## Remember my chibis

**Settings → Remember my chibis** (on by default) saves the set currently on the desktop to `chibis.json` in the app's user-data folder and restores it at the next launch, in the same order, skipping anything no longer in the catalogue. Turn it off and nothing is saved or restored; the existing file is left untouched.

## Validation

23 tests pass, including the new persistence round-trip (save, relaunch with the same profile, restore) and the remember-off case, plus the resting-pose priority in the framing logic. TypeScript and the Vite build are clean, and a real Electron run with an isolated profile confirmed both windows load.
