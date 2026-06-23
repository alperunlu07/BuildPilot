//! Desktop-side persisted preferences (launch-at-login first-run default) and
//! the OS auto-start registration. Port of the Electron `src/state.ts`.
//!
//! Auto-start is handled by `tauri-plugin-autostart`, which registers the app
//! with the OS (Login Items on macOS, the Run registry key on Windows, an
//! XDG autostart .desktop entry on Linux). The plugin is configured with the
//! `--hidden` arg so a login launch stays in the tray instead of popping a
//! window (see `main.rs` startup logic).

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_autostart::ManagerExt;

use crate::config::desktop_state_file;

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
struct DesktopState {
    /// Whether we've completed the one-time first-run setup (enabling launch at
    /// login by default). Lets the user later turn it off without us flipping
    /// it back on every boot.
    #[serde(default)]
    initialized: bool,
}

fn read() -> DesktopState {
    std::fs::read_to_string(desktop_state_file())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn write(state: &DesktopState) {
    let path = desktop_state_file();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(path, json);
    }
}

/// Register/unregister the app with the OS so it starts automatically at login.
pub fn set_launch_at_login(app: &AppHandle, enabled: bool) {
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(err) = result {
        eprintln!("Failed to update launch-at-login: {err}");
    }
}

pub fn is_launch_at_login(app: &AppHandle) -> bool {
    app.autolaunch().is_enabled().unwrap_or(false)
}

/// On the very first run, opt the user into launch-at-login (the whole point of
/// a tray app) — but only once, so a later opt-out sticks.
pub fn apply_first_run_defaults(app: &AppHandle) {
    let state = read();
    if !state.initialized {
        set_launch_at_login(app, true);
        write(&DesktopState { initialized: true });
    }
}
