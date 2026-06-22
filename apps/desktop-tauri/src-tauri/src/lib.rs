//! BuildPilot desktop (Tauri v2). A background system-tray app that runs the
//! BuildPilot server, surfaces pipeline notifications, and opens the dashboard
//! from the tray — a Rust-native rewrite of the Electron app.
//!
//! Startup flow (see [`setup`]):
//!   1. Single-instance lock — a second launch just surfaces the window.
//!   2. macOS: become an accessory app (no Dock icon / Cmd-Tab entry).
//!   3. First-run default: enable launch-at-login.
//!   4. Build the tray (placeholder menu).
//!   5. Ensure the server is up (adopt or spawn + supervise).
//!   6. Subscribe to the SSE event stream → notifications + tray refreshes.
//!   7. Open the window unless launched hidden (login start).

mod api;
mod config;
mod models;
mod notify;
mod server;
mod state;
mod tray;
mod window;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

use serde_json::Value;
use tauri::{AppHandle, Manager, RunEvent};
use tokio::sync::Notify;

use tray::TrayCache;

/// Shared application state, managed by Tauri and reachable from any handler via
/// `app.state::<AppState>()`.
pub struct AppState {
    /// One pooled HTTP client for all API calls + the SSE stream.
    pub http: reqwest::Client,
    /// True once a real quit has been requested, so the window close handler
    /// lets the window actually close and the exit handler doesn't keep us in
    /// the tray.
    quitting: AtomicBool,
    /// True once the server teardown has begun, so the supervisor knows an exit
    /// was intentional and must NOT auto-restart.
    server_shutting_down: AtomicBool,
    /// Wakes the server supervisor so it can perform the graceful kill.
    pub stop_notify: Arc<Notify>,
    /// Cached tray data the menu is rebuilt from.
    pub tray: Mutex<TrayCache>,
    /// Debounce signals: coalesce bursts of project/build events into a single
    /// menu rebuild / counts refresh.
    rebuild_notify: Arc<Notify>,
    status_notify: Arc<Notify>,
}

impl AppState {
    fn new() -> Self {
        Self {
            http: api::client(),
            quitting: AtomicBool::new(false),
            server_shutting_down: AtomicBool::new(false),
            stop_notify: Arc::new(Notify::new()),
            tray: Mutex::new(TrayCache::default()),
            rebuild_notify: Arc::new(Notify::new()),
            status_notify: Arc::new(Notify::new()),
        }
    }

    pub fn is_quitting(&self) -> bool {
        self.quitting.load(Ordering::SeqCst)
    }
    pub fn set_quitting(&self, v: bool) {
        self.quitting.store(v, Ordering::SeqCst);
    }
    pub fn is_server_shutting_down(&self) -> bool {
        self.server_shutting_down.load(Ordering::SeqCst)
    }
    pub fn set_server_shutting_down(&self, v: bool) {
        self.server_shutting_down.store(v, Ordering::SeqCst);
    }
    /// Request a debounced full tray rebuild (project set changed).
    pub fn schedule_rebuild(&self) {
        self.rebuild_notify.notify_one();
    }
    /// Request a debounced queue-counts refresh (build lifecycle changed).
    pub fn schedule_status(&self) {
        self.status_notify.notify_one();
    }
}

/// Begin a real quit: flip the quitting flag, ask the owned server to stop, then
/// exit the event loop. The `RunEvent::Exit` handler performs the final
/// teardown.
pub fn quit_app(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state.set_quitting(true);
    }
    server::stop_server(app);
    app.exit(0);
}

/// Whether this process was launched into the tray at login (Windows/Linux pass
/// `--hidden` via the autostart args; we honour the same flag everywhere).
fn launched_hidden() -> bool {
    std::env::args().any(|a| a == "--hidden")
}

fn setup(app: &AppHandle) {
    // macOS: run as a menu-bar-only background app — no Dock icon, no Cmd-Tab
    // entry — mirroring the Windows system-tray behaviour.
    #[cfg(target_os = "macos")]
    {
        let _ = app.set_activation_policy(tauri::ActivationPolicy::Accessory);
    }

    // First-run default: opt into launch-at-login (the whole point of a tray
    // app) — but only once, so a later opt-out sticks.
    state::apply_first_run_defaults(app);

    // Build the tray with a placeholder menu; real data follows once the
    // server is up.
    if let Err(err) = tray::create_tray(app) {
        eprintln!("Failed to create tray: {err}");
    }

    // Debounce workers: each waits for a signal, then a short window, then does
    // the work once — coalescing a burst of events into a single update.
    spawn_debounce(app, app.state::<AppState>().rebuild_notify.clone(), 400, |app| {
        Box::pin(async move { tray::rebuild_tray_menu(&app).await })
    });
    spawn_debounce(app, app.state::<AppState>().status_notify.clone(), 600, |app| {
        Box::pin(async move { tray::refresh_tray_status(&app).await })
    });

    // Bring up the server, then wire the event stream and open the window.
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let ok = server::ensure_server(&app).await;
        tray::set_server_health(&app, ok);
        if ok {
            // Server is up — populate the tray with the real project list.
            tray::rebuild_tray_menu(&app).await;
        } else {
            use tauri_plugin_notification::NotificationExt;
            let _ = app
                .notification()
                .builder()
                .title("BuildPilot")
                .body("Failed to start the BuildPilot server. Check the logs.")
                .show();
        }

        // Stream pipeline events → notifications + tray refreshes. Any event is
        // also a liveness signal, so reflect that in the tray's health line.
        let app_for_events = app.clone();
        let http = app.state::<AppState>().http.clone();
        tauri::async_runtime::spawn(async move {
            api::subscribe_events(http, move |value: Value| {
                on_server_event(&app_for_events, &value);
            })
            .await;
        });

        // Stay in the tray when launched at login; a manual launch opens the
        // window.
        if !launched_hidden() {
            window::show_window(&app, "/");
        }
    });
}

/// Per-event handler for the SSE stream: refresh health, raise notifications,
/// and schedule the appropriate (debounced) tray update.
fn on_server_event(app: &AppHandle, value: &Value) {
    tray::set_server_health(app, true);
    notify::handle_event(app, value);

    if let Some(kind) = value.get("type").and_then(Value::as_str) {
        match kind {
            // Only project add/remove changes the tray's project shortcuts.
            "projectAdded" | "projectRemoved" => {
                app.state::<AppState>().schedule_rebuild();
            }
            // Build lifecycle changes the running/queued counts.
            "buildStarted" | "buildFinished" | "buildAwaitingApproval"
            | "buildApprovalDecided" => {
                app.state::<AppState>().schedule_status();
            }
            _ => {}
        }
    }
}

/// Spawn a debounce worker: wait for `notify`, then `delay_ms`, then run `work`
/// once. Multiple signals during the wait coalesce (Notify holds one permit).
fn spawn_debounce<F>(app: &AppHandle, notify: Arc<Notify>, delay_ms: u64, work: F)
where
    F: Fn(AppHandle) -> std::pin::Pin<Box<dyn std::future::Future<Output = ()> + Send>>
        + Send
        + 'static,
{
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            notify.notified().await;
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            work(app.clone()).await;
        }
    });
}

/// Build and run the Tauri app. `main.rs` is a thin wrapper around this.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Single-instance: a second launch just surfaces the existing window
    // instead of starting a rival server. Desktop-only.
    #[cfg(all(desktop, not(any(target_os = "android", target_os = "ios"))))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            window::show_window(app, "/");
        }));
    }

    builder
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // Launch hidden into the tray at login (Windows/Linux read this arg;
            // macOS honours the Login Item's "hidden" flag).
            Some(vec!["--hidden"]),
        ))
        .manage(AppState::new())
        .setup(|app| {
            setup(app.handle());
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building BuildPilot")
        .run(|app, event| match event {
            // Tray app: don't quit when the last window closes — stay alive in
            // the tray. A real quit sets the quitting flag first (quit_app).
            RunEvent::ExitRequested { api, .. } => {
                let quitting = app
                    .try_state::<AppState>()
                    .map(|s| s.is_quitting())
                    .unwrap_or(false);
                if !quitting {
                    api.prevent_exit();
                }
            }
            // Final teardown: stop the owned server child. Adopted servers are
            // left running by design.
            RunEvent::Exit => {
                server::stop_server(app);
            }
            _ => {}
        });
}
