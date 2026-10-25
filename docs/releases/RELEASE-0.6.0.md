# Arkpedia Chibis Dev 0.6.0

## The chibis now rest on real furniture

A sitting chibi gets the **Black Retro Chair**; a sleeping one gets the **Porcelain Bed**. These are the same two pieces the website already uses, with the same unmodified game-client renders and the same silhouette masks, and they come from `arkpedia-sd-assets` at a pinned commit rather than being drawn by the app.

The assets live in a new `furniture/` directory there (PR arkpedia/arkpedia-sd-assets#56): the two PNGs, the two SVG masks, and a manifest recording the upstream revision, SHA-256s and the 160×180 box geometry. The app pins the commit, so the files cannot change under it.

## Making the poses line up

Chibi `Sit` animations lower the hips below standing ground and `Sleep` is authored above the mattress, so drawing them at the standing anchor puts the character through the chair or above the bed. The stage now lifts those poses onto the furniture — 25% of the pose height for sitting, 13% for sleeping — which is the same correction the website applies. The furniture itself sits behind the chibi canvas and follows the chibi's position, size and facing; it is never interactive, so click-through and dragging behave exactly as before.

Verified by driving a real Electron run and screenshotting both rests: the chibi seats on the chair and lies on the bed with her head on the pillow.

## Validation

24 tests pass, including the furniture geometry (160×118 image at 56 / 62 px in a 160×180 box, scaling with the chibi). TypeScript and the Vite build are clean; the macOS bundles are ad-hoc signed.
