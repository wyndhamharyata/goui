#!/bin/sh
# Builds goui.app in .build and signs it ad hoc.
set -eu
cd "$(dirname "$0")/.."
swift build -c release --product goui
app=.build/goui.app
rm -rf "$app"
mkdir -p "$app/Contents/MacOS"
cp App/Info.plist "$app/Contents/Info.plist"
cp .build/release/goui "$app/Contents/MacOS/goui"
codesign --force --sign - "$app"
echo "Built $(pwd)/$app"
