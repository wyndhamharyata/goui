#!/bin/sh
# Starts goui.app as a LaunchAgent, or stops it and removes the agent.
# A crash starts it again. Quit from the menu stays quit.
set -eu
cd "$(dirname "$0")/.."
label=com.goui.app
plist="$HOME/Library/LaunchAgents/$label.plist"
log="$HOME/Library/Logs/goui.log"
domain="gui/$(id -u)"

case "${1:-}" in
start)
  launchctl bootout "$domain/$label" 2>/dev/null || true
  cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>$label</string>
  <key>ProgramArguments</key>
  <array>
    <string>$(pwd)/.build/goui.app/Contents/MacOS/goui</string>
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
  echo "Usage: App/agent.sh start|stop" >&2
  exit 2
  ;;
esac
