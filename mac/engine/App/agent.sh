#!/bin/sh
# Starts goui.app as a LaunchAgent, or stops it and removes the agent. Flags after start go to the app.
# A crash starts it again. Quit from the menu stays quit.
set -eu
cd "$(dirname "$0")/.."
label=com.goui.app
plist="$HOME/Library/LaunchAgents/$label.plist"
log="$HOME/Library/Logs/goui.log"
domain="gui/$(id -u)"

command="${1:-}"
[ $# -gt 0 ] && shift
arguments=""
for argument in "$@"; do arguments="$arguments
    <string>$argument</string>"; done

case "$command" in
start)
  launchctl bootout "$domain/$label" 2>/dev/null || true
  # bootout returns before the old app has gone, and bootstrap fails while it is still there.
  while launchctl print "$domain/$label" >/dev/null 2>&1; do sleep 0.2; done
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(pwd)/.build/goui.app/Contents/MacOS/goui</string>$arguments
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
  launchctl bootstrap "$domain" "$plist"
  echo "Started. The log is $log"
  ;;
stop)
  launchctl bootout "$domain/$label" 2>/dev/null || true
  rm -f "$plist"
  echo "Stopped and removed the agent."
  ;;
*)
  echo "Usage: App/agent.sh start [--page mac/web/checks/bridge.html] | stop" >&2
  exit 2
  ;;
esac
