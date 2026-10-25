# Arkpedia Chibis Dev 0.7.0

## More companions and offline use

- **189 enemy models** are now built in. Choose **Enemies** in the model-type filter, search by name, then add them like any other companion.
- Download selected models for offline use. Settings shows progress and storage use, with model-pack import/export, imported-pack removal and downloaded-cache clearing.
- Browse with saved model-type, outfit-brand and downloaded-only filters. Search supports multiple words.

The enemy files already existed in the chibi asset repository. This release pins that inventory and preserves its source hashes; it does not add the entire game's enemy roster or claim a new direct-client extraction. Two enemies retain source IDs where no exact display-name match exists. Thirteen lack native movement clips and keep their idle animation while moving. Animated illustrations can be imported where compatible; a built-in illustration catalogue is still pending.

## Desktop controls

- Choose a **15, 30 or 60 FPS** limit to reduce rendering work.
- Enable **Launch at login** if you want companions to start with your computer. It stays off by default.
- Optional **Gravity** lets companions fall to the display floor. Windows also supports **Stand on window edges** using locally read window geometry.

## In-app updates

Settings can check for releases, download an update with progress, and offer an explicit **Restart and install** action on installed Windows NSIS builds and Linux AppImages. macOS development builds, Windows portable ZIPs and other unsupported formats link to manual downloads. Checking does not download or install automatically.

This is the first release with updater support. Users on 0.6.1 need to download 0.7.0 manually once. Builds remain unsigned development previews; macOS builds are ad-hoc signed, not notarized.

## Credits and validation

The app now includes an unofficial fan-project notice, game-asset credits, application licensing terms and bundled third-party license texts in Settings and the repository.

All 46 tests, TypeScript and the production web build pass. Every enemy skeleton, atlas page and texture matches its recorded hash; all 189 models and their animation tracks parse and apply with the bundled runtime. The feature PR passed CI and packaging on macOS, Windows and Linux. A real future-version updater installation and native landing alignment still need platform testing.
