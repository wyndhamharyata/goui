#!/bin/sh
# Builds goui.app and packs it as .build/goui-mac.tar.gz, the file a release carries for install.sh.
set -eu
cd "$(dirname "$0")/.."
App/make-app.sh
# No AppleDouble files or extended attributes, which would break the signature once unpacked.
COPYFILE_DISABLE=1 tar --no-mac-metadata --no-xattrs -czf .build/goui-mac.tar.gz -C .build goui.app
echo "Packed $(pwd)/.build/goui-mac.tar.gz, $(du -h .build/goui-mac.tar.gz | cut -f1)"
