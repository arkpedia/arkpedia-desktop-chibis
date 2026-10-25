# Arkpedia Chibis Dev 0.4.1

## Chibis are the same size now

Each chibi's artwork was scaled to fit its square hit box **both ways**: height and width. Any chibi whose idle pose is wider than it is tall — a wide weapon, a cape, a banner, a chair — got scaled down until the width fit, so the character itself came out visibly smaller than its neighbours while every hit box stayed the same size.

The scale now comes from the idle pose's **height only**. Width no longer shrinks anything; wide art overhangs the hit box, which the app already documented as intended. Measured over a 40-model sample with the real idle bounds: on-screen chibi height used to range from **83 px to 120.5 px**; it is **120.5 px for every model** now.

Nothing else changed: the hit box is still the square you drag, the size buttons still scale an individual chibi up or down, and reactions still play at the size set from the idle pose.

## Validation

The framing test now asserts that a wide pose keeps the same scale as a narrow one and overflows the box. 21 tests pass, TypeScript and the Vite build are clean, and the macOS bundles are ad-hoc signed.
