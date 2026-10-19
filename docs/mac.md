# goui for the Mac

The macOS application processes all system audio through a menu bar interface matching the browser
extension. Requires Apple silicon and macOS 26 or later.

```bash
curl -fsSL https://raw.githubusercontent.com/wyndhamharyata/goui/main/mac/install.sh | sh
```

The user-space installer deploys `goui.app` to `~/Applications`, registers a login item, and
launches the application without requiring administrative privileges. On initial execution, grant
the macOS system audio recording permission. Audio is processed live in memory with zero local disk
persistence.

## Operation & Menu Bar Controls

- **Interface:** Left-click the menu bar icon to toggle the main panel. Right-click to access engine
  restart, panel reload, panel width toggles, update configurations, and active Sets.
- **Sets Menu:** Select any saved Set directly from the context menu to swap active profiles
  without opening the main UI.
- **Device Routing:** Automatically tracks changes to the default macOS system output device. To
  avoid signal degradation, disable competing audio routing software (e.g., eqMac, SoundSource).
- **CoreAudio Constraints:** Spatial Audio and hardware head-tracking on AirPods and Beats devices
  are bypassed while goui processes active system audio.

## Updates & CLI

- **Auto-Updates:** Panel assets update automatically in the background. Engine binary updates
  trigger a menu bar notification (**Update to …**) and re-prompt for macOS audio permissions.
  GitHub release checks run twice daily with zero telemetry transmission.
- **Command-Line Tool:** Execute operations directly via the `goui` executable:

```bash
goui [start | stop | restart | set "name" | logs | rollback | uninstall]
```

## Storage & Resources

- Configuration state and preset files persist in `~/Library/Application Support/goui`.
- **Documentation:** [goui.mwyndham.dev/mac](https://goui.mwyndham.dev/mac)
- **Engine Architecture:** [`mac/engine/README.md`](../mac/engine/README.md)
