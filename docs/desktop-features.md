# Desktop features and platform support

## Updates

Settings → App updates checks the GitHub release feed only when requested.
Checking does not download or install anything. Supported builds offer a
separate Download button, progress, then Restart and install. Nothing is
installed automatically when quitting. Errors remain retryable, with a manual
download link as a fallback. Updates use the configured GitHub repository and
electron-updater's integrity checks; signature verification is not disabled.

| Build | In-app check | Download and install |
|---|---|---|
| Installed Windows NSIS build | Yes | In app |
| Linux AppImage | Yes | In app |
| macOS development build | Yes | Manual download; current builds are ad-hoc signed |
| Linux .deb or unpackaged development build | Yes | Manual download / package manager |

The release workflow now uploads updater metadata (`latest*.yml`) and
blockmaps alongside installers. The first release containing this updater must
be installed manually by existing 0.6.1 users; subsequent compatible releases
can be installed from within the app. Installing against a future release has
not been tested end to end in this change.

## Launch at login

Off by default. Supported for installed Windows/macOS apps and Linux AppImages.
Windows/macOS use the operating system's login-item API. Linux AppImages use an
XDG autostart entry in the user's configuration directory, removed when opted
out. Development builds and .deb installs do not offer this toggle. macOS may
reject registration for an ad-hoc signed build; the app reports OS rejection.
No startup configuration changes are made just by opening the app.

## Gravity and window edges

Gravity works on all platforms. Window-edge detection currently supports
Windows only, via a hidden PowerShell helper and user32/DWM geometry APIs.
The helper runs only when window-edge detection is enabled, skips the app's
own windows, minimized and cloaked windows, and clips occluded edge segments.
It collects rectangles only and does not transmit them to a server.

PowerShell script policy is respected; the app does not bypass it. If the
helper cannot run, Settings reports an error and floor gravity remains usable.
Window sampling is periodic, so moving windows can take about 750 ms to update.

## Offline library and model packs

Models are cached in the user-data `library/` directory. Download selected
models to make their skeletons, atlases, textures, and the shared furniture
available offline. The catalogue's Downloaded badge means its required files
are present. The cache has a 1 GB total limit, including imported files, and a
64 MB per-file limit. Clear downloaded cache retains imported packs; imported
packs can be removed separately. Active models already loaded in memory remain
until removed, but cannot be restored after their pack is deleted.

Export downloaded pack writes a new folder inside the directory you select.
Import model pack selects that folder, validates the manifest and file paths,
and copies it into the app's private library. Existing source files are not
modified. Pack import rejects paths outside `assets/`, unknown extra resources,
unsupported file extensions, and files exceeding the limits. No scripts are
executed from packs.

A pack contains `manifest.json` and an `assets/` directory. Example:

```json
{
  "version": 1,
  "entries": [{
    "name": "My companion",
    "kind": "operator",
    "brand": "",
    "model": {
      "skeleton": "assets/companion.skel",
      "atlas": "assets/companion.atlas",
      "textures": {"companion.png": "assets/companion.png"},
      "premultipliedAlpha": false
    }
  }]
}
```

`kind` may be `operator`, `outfit`, `enemy`, or `illustration`. Texture keys must
match the page names inside the atlas; values are paths in the pack. Skeletons
must be compatible with the bundled Spine 3.8 runtime, in binary `.skel` or
Spine JSON `.json` format. Custom shaders and Live2D Cubism formats are not
supported. Imported models use the same animation selection and size controls
as existing companions; models with no walk animation remain in their idle
animation while moving.

The built-in catalogue includes operators, outfits and **189 enemy models** already
published in the SD asset repository. Select **Enemies** in the model-type filter.
The enemy resources are pinned to SD commit `6f3cfd431aeb1475e7654cb9c019e176b238c01a`.
Their original manifest hashes, source revisions, animation names and name-table
hashes are recorded in `src/enemy-catalogue-source.json`. All files were hash-checked
and all animation tracks parsed/applied with the bundled Spine runtime before import.
187 display names match exact IDs in the website data; two retain their source IDs.
Thirteen models have no native movement track and retain their idle pose while moving.
This is the existing SD enemy inventory, not the complete game's enemy roster. Its
source is Ark-Models; no new direct-client extraction was needed for these files.
Built-in animated illustrations remain a later expansion.

To reproduce the enemy catalogue against that immutable manifest and asset checkout:

```sh
node scripts/sync-enemy-catalogue.mjs manifest.json <SD-commit> /path/to/SD /path/to/arkpedia/data
```

## Catalogue metadata

The 25 outfit-brand names were joined to the existing catalogue by exact skin
ID, using a snapshot of the website's `data/skins.json`. Its SHA-256 is recorded
in `src/catalogue-metadata-source.json`. This adds
metadata without changing existing model URLs or the catalogue's asset pins.
To refresh against an available Arkpedia data directory:

```sh
node scripts/sync-catalogue-metadata.cjs /path/to/arkpedia/data
```
