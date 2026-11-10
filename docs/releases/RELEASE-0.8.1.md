# Arkpedia Chibis Dev 0.8.1

## Faster cached model loading

Loading a model that is already cached no longer scans every file in the library. Newly downloaded assets still update the downloaded-only filter and library size immediately.

## Reliable library limits

Importing a model pack while a chibi downloads assets now shares the same 1 GB quota check. If the two operations would exceed the limit, the later write is rejected without exceeding the quota. Failed imports clean up their temporary files, and a deleted cache file can be downloaded again without counting its old size twice.

## Validation

All 56 tests pass, including concurrent import/download, cached-read, deleted-cache recovery and failed-import cleanup regressions. CI and package builds run on macOS, Windows and Linux.

Builds remain unsigned development previews. Installed Windows NSIS builds and supported Linux AppImages can use Settings to check, download, and explicitly install this update; other formats use manual downloads.
