#!/bin/sh
# Builds the tarball from this checkout and installs it over ~/Applications/goui.app, as a user's update would.
set -eu
cd "$(dirname "$0")/.."
App/make-tarball.sh
GOUI_YES=1 GOUI_TARBALL="$(pwd)/.build/goui-mac.tar.gz" sh ../install.sh
