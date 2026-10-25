# Arkpedia Chibis Dev 0.6.1

## Restored chibis are counted correctly

With **Remember my chibis** enabled, reopening the app restored the desktop companions but could leave the picker saying **No chibis yet**. The overlay restored before the picker started listening for its count.

The picker now requests the current count as soon as it subscribes, so its footer and the maximum-chibi limit reflect the companions already on the desktop. Reloading the picker also retrieves the current count.

## Repository cleanup

Release notes now live in `docs/releases/`, with an index linked from the main README.

## Validation

All 25 tests pass, including regression coverage for startup count synchronization, clearing companions, and invalid or unauthorized count messages. TypeScript and the Vite production build pass. Native Electron GUI behavior has not been manually re-tested for this patch; macOS, Windows and Linux packages are built by the release workflow.
