#!/bin/sh
# Installs goui for the Mac, or updates it. Needs no admin password.
#   curl -fsSL https://raw.githubusercontent.com/wyndhamharyata/goui/main/mac/install.sh | sh
# GOUI_TARBALL=path/to/goui-mac.tar.gz installs a local build. GOUI_YES=1 answers yes to every question.
set -eu
url="https://github.com/wyndhamharyata/goui/releases/latest/download/goui-mac.tar.gz"
guide="https://goui.mwyndham.dev/mac#before"
label=com.goui.app
apps="$HOME/Applications"
app="$apps/goui.app"
plist="$HOME/Library/LaunchAgents/$label.plist"
log="$HOME/Library/Logs/goui.log"
bin="$HOME/.local/bin"
domain="gui/$(id -u)"
warning_count=0

# Colours only on a terminal, and never with NO_COLOR set.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  esc=$(printf '\033')
  bold="$esc[1m" dim="$esc[2m" red="$esc[31m" green="$esc[32m" yellow="$esc[33m"
  blue="$esc[34m" magenta="$esc[35m" cyan="$esc[36m" reset="$esc[0m"
  # A blue from the icon's tile, #5b8cff, for the letters, and a lighter one for the shimmer. A terminal without 24-bit colour takes the nearest of its 256.
  case "${COLORTERM:-}" in
  truecolor | 24bit) colour_mode=24 icon_blue="$esc[1;38;2;91;140;255m" shimmer="$esc[1;38;2;190;212;255m" ;;
  *) colour_mode=256 icon_blue="$esc[1;38;5;69m" shimmer="$esc[1;38;5;153m" ;;
  esac
else
  colour_mode=none
  bold="" dim="" red="" green="" yellow="" blue="" magenta="" cyan="" reset="" icon_blue="" shimmer=""
fi

# The icon's tile is one acid, #d4ff3f, its mark is ink, #0b0c0e, and the light in the point is #f2f3f5,
# as scripts/icon-geometry.mjs draws them.
tile_rgb="212;255;63"
tile_256="191"
ink_rgb="11;12;14"
ink_256="232"
light_rgb="242;243;245"
light_256="255"

# The logo in lowercase block letters, five lines tall, one variable per letter and line.
g1="      " g2="▄█▀▀██" g3="██  ██" g4="▀█▄▄██" g5=" ▄▄▄█▀"
o1="      " o2="▄█▀▀█▄" o3="██  ██" o4="▀█▄▄█▀" o5="      "
u1="      " u2="██  ██" u3="██  ██" u4="▀█▄▄██" u5="      "
i1="▀▀" i2="██" i3="██" i4="██" i5="  "

heading() {
  printf '\n  %s%s%s\n' "$bold" "$1" "$reset"
}

passed() {
  printf '  %s✓%s %s\n' "$green" "$reset" "$1"
}

warn() {
  warning_count=$((warning_count + 1))
  printf '  %s!%s %s\n' "$yellow" "$reset" "$1"
  shift
  for line in "$@"; do printf '    %s%s%s\n' "$dim" "$line" "$reset"; done
}

fail() {
  printf '  %s✗ %s%s\n' "$red" "$1" "$reset" >&2
  shift
  for line in "$@"; do printf '    %s\n' "$line" >&2; done
  printf '\n  %sNothing was installed.%s\n\n' "$dim" "$reset" >&2
  exit 1
}

note() {
  printf '  %s•%s %s\n' "$cyan" "$reset" "$1"
  shift
  for line in "$@"; do printf '    %s\n' "$line"; done
}

# Piped from curl, the script's own input is the script, so questions read the terminal.
can_ask() {
  [ -z "${GOUI_YES:-}" ] && { : </dev/tty; } 2>/dev/null
}

# Yes or no, with the default taken on Enter, or with no terminal to ask on.
ask() {
  if [ -n "${GOUI_YES:-}" ]; then return 0; fi
  if ! can_ask; then [ "$2" = y ]; return; fi

  hint="[Y/n]"
  [ "$2" = n ] && hint="[y/N]"
  printf '\n  %s?%s %s %s%s%s ' "$magenta" "$reset" "$1" "$dim" "$hint" "$reset"
  read -r answer </dev/tty || answer=""
  case "${answer:-$2}" in
  [Yy]*) return 0 ;;
  *) return 1 ;;
  esac
}

# The icon is 17 by 10 pixels, as wide as a terminal's tall cells need to look square: the acid tile with
# rounded corners, and the ink mark on it, a ring with the dot in its counter, the stem down the right,
# the level tail and the point with its light.
# Sets kind to 0 for no pixel, 1 for the tile, 2 for the mark and 3 for the light in the point.
find_icon_pixel() {
  kind=1
  case "$2" in
  0 | 9) if [ "$1" -le 2 ] || [ "$1" -ge 14 ]; then kind=0; fi ;;
  1 | 8) if [ "$1" = 0 ] || [ "$1" = 16 ]; then kind=0; fi ;;
  2) if [ "$1" -ge 6 ] && [ "$1" -le 10 ]; then kind=2; fi ;;
  3 | 4) case "$1" in
    5 | 6 | 10 | 11) kind=2 ;;
    8) if [ "$2" = 3 ]; then kind=2; fi ;;
    esac ;;
  5) if [ "$1" -ge 6 ] && [ "$1" -le 11 ]; then kind=2; fi ;;
  6) if [ "$1" -ge 10 ] && [ "$1" -le 11 ]; then kind=2; fi ;;
  7) case "$1" in
    5) kind=3 ;;
    6 | 7 | 8 | 9 | 10 | 11) kind=2 ;;
    esac ;;
  8) if [ "$1" -ge 5 ] && [ "$1" -le 6 ]; then kind=2; fi ;;
  esac
}

# The colour of one pixel, as a foreground (38) or a background (48).
print_pixel_colour() {
  layer=$2
  case "$1" in
  2) rgb=$ink_rgb ansi=$ink_256 ;;
  3) rgb=$light_rgb ansi=$light_256 ;;
  *) rgb=$tile_rgb ansi=$tile_256 ;;
  esac
  [ "$colour_mode" = 24 ] && printf '%s[%s;2;%sm' "$esc" "$layer" "$rgb" || printf '%s[%s;5;%sm' "$esc" "$layer" "$ansi"
}

# One line of the icon, two pixel rows to a character: ▀ in the top colour on the bottom colour.
draw_icon_line() {
  top_row=$(($1 * 2 - 2))
  bottom_row=$((top_row + 1))
  column=0
  while [ "$column" -le 16 ]; do
    find_icon_pixel "$column" "$top_row"
    top=$kind
    find_icon_pixel "$column" "$bottom_row"
    bottom=$kind
    if [ "$colour_mode" = none ]; then
      case "$top$bottom" in
      00) printf ' ' ;;
      0?) printf '▄' ;;
      ?0) printf '▀' ;;
      *) printf '█' ;;
      esac
    elif [ "$top" = 0 ] && [ "$bottom" = 0 ]; then
      printf ' '
    elif [ "$top" = 0 ]; then
      print_pixel_colour "$bottom" 38
      printf '▄%s' "$reset"
    elif [ "$bottom" = 0 ]; then
      print_pixel_colour "$top" 38
      printf '▀%s' "$reset"
    else
      print_pixel_colour "$top" 38
      print_pixel_colour "$bottom" 48
      printf '▀%s' "$reset"
    fi
    column=$((column + 1))
  done
}

# Draws the icon, then the letters: the first shown_count of them, the one at shimmer_index lighter.
draw_logo() {
  shown_count=$1 shimmer_index=$2
  for line in 1 2 3 4 5; do
    printf '    '
    draw_icon_line "$line"
    printf '   '
    index=0
    for letter in g o u i; do
      index=$((index + 1))
      eval "part=\$$letter$line"
      if [ "$index" -gt "$shown_count" ]; then
        printf '%*s ' "$([ $letter = i ] && echo 2 || echo 6)" ""
      elif [ "$index" = "$shimmer_index" ]; then
        printf '%s%s%s ' "$shimmer" "$part" "$reset"
      else
        printf '%s%s%s ' "$icon_blue" "$part" "$reset"
      fi
    done
    printf '\n'
  done
}

# The letters come in one by one, then a light runs across them twice. A pipe or NO_COLOR gets the still logo.
show_logo() {
  printf '\n'
  if [ ! -t 1 ] || [ -z "$icon_blue" ]; then
    draw_logo 4 0
    return
  fi

  # The cursor hides while the logo moves, and comes back even on Control-C.
  printf '%s[?25l' "$esc"
  trap 'printf "%s[?25h" "$esc"' EXIT
  trap 'exit 130' INT
  # Each frame: the letters shown and the lighter letter. The icon stands still.
  for frame in "1 0" "2 0" "3 0" "4 0" "4 1" "4 2" "4 3" "4 4" \
    "4 0" "4 1" "4 2" "4 3" "4 4"; do
    set -- $frame
    draw_logo "$1" "$2"
    sleep 0.07
    printf '%s[5A' "$esc"
  done

  draw_logo 4 0
  printf '%s[?25h' "$esc"
}

# Prints -1, 0 or 1 as the first version is older, the same or newer.
compare_versions() {
  awk -v a="$1" -v b="$2" 'BEGIN {
    n = split(a, x, "."); m = split(b, y, "."); if (m > n) n = m
    for (i = 1; i <= n; i++) { if (x[i] + 0 < y[i] + 0) { print -1; exit } if (x[i] + 0 > y[i] + 0) { print 1; exit } }
    print 0
  }'
}

read_version() {
  plutil -extract CFBundleShortVersionString raw -o - "$1/Contents/Info.plist" 2>/dev/null || echo "unknown"
}

# The name of the Mac's default output, as System Information lists it.
read_output_name() {
  system_profiler SPAudioDataType 2>/dev/null | awk '/^        [^ ].*:$/ { name = $0 } /Default Output Device: Yes/ { print name; exit }' | sed 's/^ *//; s/:$//'
}

show_logo
printf '\n    %sfor the Mac%s  %sEvery ear hears differently.%s\n' "$bold" "$reset" "$dim" "$reset"

heading "Checking this Mac"
[ "$(uname -s)" = Darwin ] || fail "goui for the Mac needs macOS." "The goui extension works on any system in Chrome or Brave: https://goui.mwyndham.dev"

macos=$(sw_vers -productVersion)
[ "${macos%%.*}" -ge 26 ] || fail "goui needs macOS 26 or later. This Mac runs macOS $macos." \
  "Update in System Settings, General, Software Update, or use the goui extension in Chrome or Brave."
passed "macOS $macos"

# hw.optional.arm64 tells Apple silicon apart even from a shell running under Rosetta.
[ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] || fail "goui needs Apple silicon. This Mac has an Intel chip." \
  "The goui extension in Chrome or Brave works on Intel."
passed "Apple silicon"

for other in eqMac SoundSource "Boom 3D" FxSound; do
  if pgrep -xq "$other"; then
    warn "$other is running." "Two system EQs stack their curves. Quit one before using goui."
  fi
done

output=$(read_output_name)
case "$output" in
*AirPods* | *Beats*)
  warn "Sound goes to $output." "Spatial Audio and head tracking stop while goui plays. Turn Spatial Audio off" "in Control Center, or quit goui while using them." ;;
"") ;;
*) passed "Sound goes to $output" ;;
esac

if [ "$warning_count" -gt 0 ] && ! ask "Carry on with $([ "$warning_count" = 1 ] && echo "this warning" || echo "these warnings")?" n; then
  can_ask || printf '\n  %sWith no terminal to ask on, run it again with GOUI_YES=1 to carry on.%s' "$dim" "$reset"
  printf '\n  %sNothing was installed.%s\n\n' "$dim" "$reset"
  exit 1
fi

unpacked=$(mktemp -d)
trap 'rm -rf "$unpacked"; [ -t 1 ] && [ -n "$icon_blue" ] && printf "%s[?25h" "$esc"' EXIT

heading "Getting goui"
if [ -n "${GOUI_TARBALL:-}" ]; then
  tar -xzf "$GOUI_TARBALL" -C "$unpacked" || fail "$GOUI_TARBALL is not a goui tarball."
  passed "Unpacked $GOUI_TARBALL"
else
  curl -fsSL "$url" | tar -xzf - -C "$unpacked" || fail "Download failed." "Check the connection and try again. Releases: https://github.com/wyndhamharyata/goui/releases"
  passed "Downloaded the latest release"
fi
[ -x "$unpacked/goui.app/Contents/MacOS/goui" ] || fail "The download has no goui.app."

new_version=$(read_version "$unpacked/goui.app")
if [ -d "$app" ]; then
  old_version=$(read_version "$app")
  case $(compare_versions "$old_version" "$new_version") in
  -1) plan="Update" change="$old_version → $bold$new_version" ;;
  0) plan="Reinstall" change="$new_version, the same version" ;;
  *) plan="Downgrade" change="$old_version → $bold$new_version" ;;
  esac
else
  plan="Install" change="$bold$new_version"
fi
printf '  %s→%s %s goui %s%s\n' "$blue" "$reset" "$plan" "$change" "$reset"

heading "Before you install"
note "goui EQs every sound on this Mac, from the menu bar." "One EQ covers every app. It follows the default output."
note "Spatial Audio and head tracking on AirPods and Beats stop" "while goui plays. goui processes the audio before the output."
note "macOS asks to let goui record audio. Press Allow." "goui EQs the sound on its way out and keeps none of it."
note "goui is not signed by Apple yet, so a full update asks for" "that permission again."
note "Settings stay in ~/Library/Application Support/goui," "through updates and after goui uninstall."
if ! ask "$plan goui $new_version now?" y; then
  printf '\n  %sNothing was installed.%s\n\n' "$dim" "$reset"
  exit 1
fi

heading "Installing"
# The running app holds its files, so it stops before the new one goes in.
if launchctl print "$domain/$label" >/dev/null 2>&1; then
  launchctl bootout "$domain/$label" 2>/dev/null || true
  while launchctl print "$domain/$label" >/dev/null 2>&1; do sleep 0.2; done
  passed "Stopped goui"
fi

mkdir -p "$apps" "$bin" "$(dirname "$plist")" "$(dirname "$log")"
rm -rf "$app"
mv "$unpacked/goui.app" "$app"
passed "Put goui.app in ~/Applications"
ln -sf "$app/Contents/Resources/goui" "$bin/goui"
passed "Linked the goui command in ~/.local/bin"

# A crash starts goui again. Quit from its menu stays quit until the next login.
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$app/Contents/MacOS/goui</string>
  </array>
  <key>LimitLoadToSessionType</key>
  <string>Aqua</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>$log</string>
  <key>StandardErrorPath</key>
  <string>$log</string>
</dict>
</plist>
PLIST
# An update through this script brings the release's own web files, so the ones beside the app go away.
rm -rf "$HOME/Library/Application Support/goui/web" "$HOME/Library/Application Support/goui/web.previous"
rm -f "$HOME/Library/Application Support/goui/web-version"
# The app opens its panel once when it finds this, so the menu bar item is easy to spot.
mkdir -p "$HOME/Library/Application Support/goui"
: > "$HOME/Library/Application Support/goui/just-installed"
launchctl bootstrap "$domain" "$plist"
passed "Started goui. It starts at login."

printf '\n  %s%sgoui %s installed.%s\n' "$bold" "$green" "$new_version" "$reset"
printf '\n  1. The panel opens under the menu bar item. Press the power button.\n'
printf '  2. macOS asks to record audio. Press %sAllow%s.\n' "$bold" "$reset"
printf '  3. Play something.\n'
printf '\n  %sRead more:%s %s%s%s\n' "$bold" "$reset" "$cyan" "$guide" "$reset"
printf '\n  %sgoui set "name" · start · stop · restart · logs · rollback · uninstall%s\n' "$dim" "$reset"
case ":$PATH:" in
*":$bin:"*) ;;
*) printf '  %s!%s The goui command is in %s, not on your PATH. Add it or run %s/goui.\n' "$yellow" "$reset" "$bin" "$bin" ;;
esac
printf '\n'
