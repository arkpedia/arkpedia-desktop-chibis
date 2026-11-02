# Arkpedia Chibis Dev 0.8.0

## Choose each companion’s pose

Open a chibi’s gear button to choose from that exact model’s native animations. A chosen animation stays in place, overriding wandering and gravity. Loop it, replay it, or turn looping off to hold its final pose. Choose Automatic to return to the usual routine.

Each copy has its own settings: fixed placement, facing, size, vertical offset and props. Settings and dragged positions restore independently when Remember my chibis is enabled, including duplicate operators. Existing ID-only saves still load.

## Sit on a window edge

Choose Sit if the model provides it, turn off Chair / bed, and drag the companion into place. Adjust Vertical offset if needed. Manual placement works on every platform; it does not follow a window when that window moves. Existing automatic window-edge detection remains Windows-only.

Chair / bed controls the added resting furniture. Detached scenery can be hidden during idle and walking. Special poses retain their authored props because some models incorporate the character itself into those attachments; connected costume parts remain intact.

## Corrected chibi framing

Oversized detached decorations no longer change the character’s reference scale or centering. The correction is calculated from model geometry, so it also applies to future imports. A scan of 954 walking models identified the same four outliers as the website: Rosmontis’s An Airy Dream, Dur-nar’s default model, and the Młynar epoque_28 and Beehunter kitchen_4 outfits. All 954 models parsed successfully.

## Validation

All 52 tests, TypeScript and the production renderer build pass. Renderer checks cover independent duplicate companions, Rosmontis and Amiya sitting, furniture/scenery controls, gravity override, seated dragging, replay and restoration. CI and package builds run on macOS, Windows and Linux. Native OS window following is not added by this release; physical window-edge behavior was not newly verified.

Builds remain unsigned development previews. Installed Windows NSIS builds and supported Linux AppImages can use Settings to check, download, and explicitly install this update; other formats use manual downloads.
