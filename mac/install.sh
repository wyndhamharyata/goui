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
  # The goui blue, #5b8cff, and a lighter one for the shimmer. A terminal without 24-bit colour takes the nearest of its 256.
  case "${COLORTERM:-}" in
  truecolor | 24bit) colour_mode=24 goui_blue="$esc[1;38;2;91;140;255m" shimmer="$esc[1;38;2;190;212;255m" ;;
  *) colour_mode=256 goui_blue="$esc[1;38;5;69m" shimmer="$esc[1;38;5;153m" ;;
  esac
else
  colour_mode=none
  bold="" dim="" red="" green="" yellow="" blue="" magenta="" cyan="" reset="" goui_blue="" shimmer=""
fi

# The icon's tile fades from #4a7ae0 to #8f52d8, as scripts/icon-geometry.mjs draws it. One colour per pixel row.
tile_rgb="74;122;224 82;118;223 89;113;222 97;109;221 105;104;220 112;100;220 120;95;219 128;91;218 135;86;217 143;82;216"
tile_256="68 68 62 62 62 62 98 98 98 98"

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

# The icon is 17 by 10 pixels, as wide as a terminal's tall cells need to look square: a tile with
# rounded corners and four white bars, two pixels wide, that stand on row 8.
# Sets kind to 0 for no pixel, 1 for the tile and 2 for a bar.
find_icon_pixel() {
  kind=1
  case "$2" in
  0 | 9) if [ "$1" -le 2 ] || [ "$1" -ge 14 ]; then kind=0; fi ;;
  1 | 8) if [ "$1" = 0 ] || [ "$1" = 16 ]; then kind=0; fi ;;
  esac
  case "$1" in
  3 | 4) bar=$bar1 ;;
  6 | 7) bar=$bar2 ;;
  9 | 10) bar=$bar3 ;;
  12 | 13) bar=$bar4 ;;
  *) return 0 ;;
  esac
  if [ "$kind" = 1 ] && [ "$2" -ge $((8 - bar)) ] && [ "$2" -lt 8 ]; then kind=2; fi
}

# The colour of one pixel, as a foreground (38) or a background (48).
print_pixel_colour() {
  row=$2 layer=$3
  if [ "$1" = 2 ]; then
    [ "$colour_mode" = 24 ] && printf '%s[%s;2;255;255;255m' "$esc" "$layer" || printf '%s[%s;5;231m' "$esc" "$layer"
    return
  fi

  # The row's colour is item row + 1 of the list.
  set -- $([ "$colour_mode" = 24 ] && echo "$tile_rgb" || echo "$tile_256")
  shift "$row"
  [ "$colour_mode" = 24 ] && printf '%s[%s;2;%sm' "$esc" "$layer" "$1" || printf '%s[%s;5;%sm' "$esc" "$layer" "$1"
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
      11) printf '█' ;;
      1?) printf '▀' ;;
      ?1) printf '▄' ;;
      *) printf ' ' ;;
      esac
    elif [ "$top" = 0 ] && [ "$bottom" = 0 ]; then
      printf ' '
    elif [ "$top" = 0 ]; then
      print_pixel_colour "$bottom" "$bottom_row" 38
      printf '▄%s' "$reset"
    elif [ "$bottom" = 0 ]; then
      print_pixel_colour "$top" "$top_row" 38
      printf '▀%s' "$reset"
    else
      print_pixel_colour "$top" "$top_row" 38
      print_pixel_colour "$bottom" "$bottom_row" 48
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
        printf '%s%s%s ' "$goui_blue" "$part" "$reset"
      fi
    done
    printf '\n'
  done
}

# The letters come in one by one, then a light runs across them twice. A pipe or NO_COLOR gets the still logo.
show_logo() {
  printf '\n'
  if [ ! -t 1 ] || [ -z "$goui_blue" ]; then
    set_icon_bars
    draw_logo 4 0
    return
  fi

  # The cursor hides while the logo moves, and comes back even on Control-C.
  printf '%s[?25l' "$esc"
  trap 'printf "%s[?25h" "$esc"' EXIT
  trap 'exit 130' INT
  # Each frame: the letters shown, the lighter letter, and the four bar heights. The bars bounce, then settle.
  for frame in "1 0 1 1 1 1" "2 0 2 3 2 3" "3 0 3 5 4 5" "4 0 5 6 6 7" \
    "4 1 6 4 7 5" "4 2 3 7 5 6" "4 3 5 5 3 7" "4 4 7 3 6 4" "4 0 4 6 4 6" \
    "4 1 6 5 7 5" "4 2 3 7 4 7" "4 3 5 4 6 5" "4 4 3 6 5 7"; do
    set -- $frame
    bar1=$3 bar2=$4 bar3=$5 bar4=$6
    draw_logo "$1" "$2"
    sleep 0.07
    printf '%s[5A' "$esc"
  done

  set_icon_bars
  draw_logo 4 0
  printf '%s[?25h' "$esc"
}

# The bar heights of the icon itself, 0.4, 0.62, 0.48 and 0.7 of its 10 pixels.
set_icon_bars() {
  bar1=4 bar2=6 bar3=5 bar4=7
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
printf '\n    %sfor the Mac%s  %sDifferent ear, different head, different sound.%s\n' "$bold" "$reset" "$dim" "$reset"

heading "Checking this Mac"
[ "$(uname -s)" = Darwin ] || fail "goui for the Mac needs macOS." "On Chrome or Brave, the goui extension works on any system: https://goui.mwyndham.dev"

macos=$(sw_vers -productVersion)
[ "${macos%%.*}" -ge 26 ] || fail "goui needs macOS 26 or newer. This Mac runs macOS $macos." \
  "goui is built for macOS 26 and newer only." \
  "Update in System Settings, General, Software Update, or use the goui extension in Chrome or Brave."
passed "macOS $macos"

# hw.optional.arm64 tells Apple silicon apart even from a shell running under Rosetta.
[ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] || fail "goui needs a Mac with Apple silicon. This Mac has an Intel chip." \
  "goui is built for M1 and newer only for now. The goui extension in Chrome or Brave works here."
passed "Apple silicon"

for other in eqMac SoundSource "Boom 3D" FxSound; do
  if pgrep -xq "$other"; then
    warn "$other is running." "Two system EQs at once stack their curves. Quit one of them once goui is in."
  fi
done

output=$(read_output_name)
case "$output" in
*AirPods* | *Beats*)
  warn "The sound goes to $output." "Spatial Audio and head tracking drop out while goui plays. Turn Spatial Audio off" "for them in Control Center, or quit goui while you use it." ;;
"") ;;
*) passed "Sound goes to $output" ;;
esac

if [ "$warning_count" -gt 0 ] && ! ask "Carry on with $([ "$warning_count" = 1 ] && echo "this warning" || echo "these warnings")?" n; then
  can_ask || printf '\n  %sWith no terminal to ask on, run it again with GOUI_YES=1 to carry on.%s' "$dim" "$reset"
  printf '\n  %sNothing was installed.%s\n\n' "$dim" "$reset"
  exit 1
fi

unpacked=$(mktemp -d)
trap 'rm -rf "$unpacked"; [ -t 1 ] && [ -n "$goui_blue" ] && printf "%s[?25h" "$esc"' EXIT

heading "Getting goui"
if [ -n "${GOUI_TARBALL:-}" ]; then
  tar -xzf "$GOUI_TARBALL" -C "$unpacked" || fail "$GOUI_TARBALL is not a goui tarball."
  passed "Unpacked $GOUI_TARBALL"
else
  curl -fsSL "$url" | tar -xzf - -C "$unpacked" || fail "The download failed." "Check the connection and run the line again. The releases are at" "https://github.com/wyndhamharyata/goui/releases"
  passed "Downloaded the latest release"
fi
[ -x "$unpacked/goui.app/Contents/MacOS/goui" ] || fail "The download holds no goui.app."

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
note "goui EQs every sound this Mac plays, from the menu bar." "It follows the Mac's default output, and one EQ covers every app."
note "Spatial Audio and head tracking on AirPods and Beats drop out" "while goui plays. goui plays the sound in between, so macOS skips them."
note "macOS asks to let goui record the audio of this Mac. Press Allow." "goui EQs the sound on its way to you and keeps none of it."
note "goui is not signed by Apple yet, so a full update asks for that" "permission again."
note "Your settings stay in ~/Library/Application Support/goui," "through updates and after goui uninstall."
if ! ask "$plan goui $new_version now?" y; then
  printf '\n  %sNothing was installed.%s\n\n' "$dim" "$reset"
  exit 1
fi

heading "Installing"
# The running app holds its files, so it stops before the new one goes in.
if launchctl print "$domain/$label" >/dev/null 2>&1; then
  launchctl bootout "$domain/$label" 2>/dev/null || true
  while launchctl print "$domain/$label" >/dev/null 2>&1; do sleep 0.2; done
  passed "Stopped the running goui"
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
passed "Started goui, and set it to start at login"

printf '\n  %s%s♪ goui %s is in.%s\n' "$bold" "$green" "$new_version" "$reset"
printf '\n  1. The goui panel opens under its menu bar item. Press the power button.\n'
printf '  2. When macOS asks to record the audio of this Mac, press %sAllow%s.\n' "$bold" "$reset"
printf '  3. Play something.\n'
printf '\n  %sRead more:%s %s%s%s\n' "$bold" "$reset" "$cyan" "$guide" "$reset"
printf '\n  %sgoui start · stop · restart · logs · uninstall%s\n' "$dim" "$reset"
case ":$PATH:" in
*":$bin:"*) ;;
*) printf '  %s!%s The goui command is in %s, which is not on your PATH. Add it, or run %s/goui.\n' "$yellow" "$reset" "$bin" "$bin" ;;
esac
printf '\n'
