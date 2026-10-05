#!/bin/sh
# Generate the Xcode project that packages dist-safari/ as a Safari Web Extension.
# Needs full Xcode (not just the Command Line Tools). The project references
# dist-safari/ in place, so rebuilding the extension doesn't require regenerating it.
set -eu
cd "$(dirname "$0")/.."
if ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "safari-web-extension-converter not found: install Xcode, then run" >&2
  echo "  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer" >&2
  exit 1
fi
[ -f dist-safari/manifest.json ] || { echo "Run npm run build first" >&2; exit 1; }
xcrun safari-web-extension-converter dist-safari \
  --project-location ../safari \
  --app-name "Localhost Dashboard for Safari" \
  --bundle-identifier dev.localhost-dashboard.safari \
  --swift --macos-only --no-open --force
echo "Open packages/safari/Localhost Dashboard for Safari/Localhost Dashboard for Safari.xcodeproj and Run."
