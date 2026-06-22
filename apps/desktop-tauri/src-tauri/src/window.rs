//! The main dashboard window. It loads the BuildPilot web SPA from the server's
//! own origin (an external URL), so navigation, lazy creation, and the
//! close-to-tray behaviour all live here — a port of the Electron `window.ts`.

use tauri::{
    AppHandle, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

use crate::config;
use crate::AppState;

const MAIN: &str = "main";

/// Open external links (anything outside our server origin) in the user's
/// default browser. The SPA itself is served from `base_url`, so same-origin
/// navigation stays in-window.
fn open_external(app: &AppHandle, url: &str) {
    use tauri_plugin_opener::OpenerExt;
    let _ = app.opener().open_url(url, None::<&str>);
}

/// Build the main window pointing at `base_url + path`. Wires the
/// close-to-tray handler: a normal close just hides the window (the app keeps
/// running in the tray); a real quit flips the shared `quitting` flag first so
/// the window is allowed to close.
fn create(app: &AppHandle, path: &str) {
    let full = format!("{}{}", config::base_url(), path);
    let url = match tauri::Url::parse(&full) {
        Ok(u) => u,
        Err(err) => {
            eprintln!("Invalid window URL {full}: {err}");
            return;
        }
    };

    // Open target=_blank / cross-origin links in the system browser rather than
    // spawning child webviews. Set on the builder so it's wired before the first
    // navigation happens. The origin is read from the (cached, refresh-aware)
    // config on every navigation rather than captured once, so a server that
    // moves ports across a restart doesn't misclassify same-origin links.
    let nav_handle = app.clone();
    let builder = WebviewWindowBuilder::new(app, MAIN, WebviewUrl::External(url))
        .title("BuildPilot")
        .inner_size(1280.0, 860.0)
        .min_inner_size(900.0, 600.0)
        .visible(true)
        .focused(true)
        .on_navigation(move |url| {
            let u = url.to_string();
            let origin = config::base_url();
            if u.starts_with(&origin) || u.starts_with("tauri://") || u.starts_with("about:") {
                return true; // same-origin (or internal) navigation stays in-window
            }
            open_external(&nav_handle, &u);
            false
        });

    let window = match builder.build() {
        Ok(w) => w,
        Err(err) => {
            eprintln!("Failed to create window: {err}");
            return;
        }
    };

    // Closing the window only hides it — the app keeps running in the tray. A
    // real quit (tray → Quit) flips the shared `quitting` flag first.
    let handle = app.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            let quitting = handle
                .try_state::<AppState>()
                .map(|s| s.is_quitting())
                .unwrap_or(false);
            if !quitting {
                api.prevent_close();
                if let Some(win) = handle.get_webview_window(MAIN) {
                    let _ = win.hide();
                }
            }
        }
    });
}

/// Show the window, navigating to `path` (a client-side route like `/projects`
/// or `/builds/123`). Creates the window lazily on first use so startup stays
/// light until the user actually opens the UI. When the window already exists,
/// the route is pushed in-app (pushState) so the SPA isn't reloaded on every
/// menu click — mirroring the Electron behaviour.
pub fn show_window(app: &AppHandle, path: &str) {
    if let Some(win) = app.get_webview_window(MAIN) {
        // Push the new route in-app rather than reloading the SPA.
        let script = format!(
            "window.history.pushState({{}}, '', {}); \
             window.dispatchEvent(new PopStateEvent('popstate'));",
            serde_json::to_string(path).unwrap_or_else(|_| "\"/\"".into())
        );
        let _ = win.eval(&script);
        let _ = win.unminimize();
        let _ = win.show();
        let _ = win.set_focus();
    } else {
        create(app, path);
    }
}

/// Toggle the window's visibility (the tray's left-click action).
pub fn toggle_window(app: &AppHandle) {
    if let Some(win) = app.get_webview_window(MAIN) {
        let visible = win.is_visible().unwrap_or(false);
        let minimized = win.is_minimized().unwrap_or(false);
        if visible && !minimized {
            let _ = win.hide();
            return;
        }
    }
    show_window(app, "/");
}

/// Open `path` in the user's default browser instead of the in-app window.
pub fn open_in_browser(app: &AppHandle, path: &str) {
    let url = format!("{}{}", config::base_url(), path);
    open_external(app, &url);
}
