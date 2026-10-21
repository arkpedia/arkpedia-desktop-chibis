// Ad-hoc sign the macOS bundle after packing.
//
// electron-builder skips signing when no Developer ID is configured. That leaves the
// Electron binary's own linker signature in place, and it does not seal our asar,
// Info.plist or frameworks: Gatekeeper then refuses the download as "damaged" rather
// than offering the usual unverified-developer override. Signing ad-hoc (`codesign -s -`)
// gives a valid, self-consistent bundle, which is what an unsigned preview needs.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
};
