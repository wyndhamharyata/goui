#!/bin/sh
# Builds goui.app in .build with the panel and the Mac pages inside it, and signs it ad hoc.
set -eu
cd "$(dirname "$0")/.."
swift build -c release --product goui
app=.build/goui.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources/web/mac"
cp App/Info.plist "$app/Contents/Info.plist"
# The app has the extension's version, as both play the same panel.
version=$(plutil -extract version raw -o - ../../manifest.json)
plutil -insert CFBundleShortVersionString -string "$version" "$app/Contents/Info.plist"
plutil -insert CFBundleVersion -string "$version" "$app/Contents/Info.plist"
cp .build/release/goui "$app/Contents/MacOS/goui"
cp -R ../../src "$app/Contents/Resources/web/src"
cp -R ../web "$app/Contents/Resources/web/mac/web"
cp -R ../../icons "$app/Contents/Resources/web/icons"
# npm run icons draws these from scripts/icon-geometry.mjs, as it draws the extension icons.
iconutil -c icns ../icons/AppIcon.iconset -o "$app/Contents/Resources/AppIcon.icns"
cp ../icons/menu-bar.png ../icons/menu-bar@2x.png "$app/Contents/Resources/"
# install.sh links the goui command from here, so each update brings its own copy.
cp ../goui "$app/Contents/Resources/goui"
# The licence and the notices travel with the app, as the MIT licence asks.
cp ../../LICENSE ../../THIRD_PARTY_NOTICES.md "$app/Contents/Resources/"
codesign --force --sign - "$app"
echo "Built $(pwd)/$app"
