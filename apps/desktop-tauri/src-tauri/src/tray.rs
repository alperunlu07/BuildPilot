//! The system-tray icon and its dynamic context menu. Port of the Electron
//! `src/tray.ts`: a server-health line, live running/queued counts, quick links
//! to the dashboard pages, per-project submenus (panel/browser deep-links,
//! folder + git actions, one-click pipeline runs), a launch-at-login toggle,
//! restart, and quit.
//!
//! Menu items carry their action in the item **id** (e.g. `run:<pipelineId>`,
//! `proj-folder:<projectId>`); [`handle_menu_event`] parses the id and
//! dispatches. The whole menu is rebuilt from a cache so a health-/counts-only
//! update never has to re-fetch the full project + pipeline set.

use tauri::image::Image;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

use crate::api;
use crate::models::{Pipeline, Project, QueueCounts};
use crate::state;
use crate::window;
use crate::AppState;

const TRAY_ID: &str = "main";

/// Cached data the menu is rebuilt from, so cheap updates (health/counts) don't
/// re-fetch the whole project + pipeline set.
#[derive(Default)]
pub struct TrayCache {
    pub projects: Vec<Project>,
    pub pipelines: Vec<Pipeline>,
    pub counts: QueueCounts,
    /// `None` until first probed (cold start).
    pub server_healthy: Option<bool>,
    /// A disabled stand-in for the project group at cold start (before the
    /// server is up). `None` once real data has been applied.
    pub placeholder: Option<String>,
}

fn server_health_label(healthy: Option<bool>) -> String {
    match healthy {
        None => "Server: checking…".to_string(),
        Some(true) => "Server: running".to_string(),
        Some(false) => "Server: not responding".to_string(),
    }
}

fn tray_image() -> Option<Image<'static>> {
    // Windows/Linux show the full-colour brand icon; macOS uses a monochrome
    // template the OS recolours for the light/dark menu bar.
    #[cfg(target_os = "macos")]
    let bytes: &[u8] = include_bytes!("../icons/trayTemplate.png");
    #[cfg(not(target_os = "macos"))]
    let bytes: &[u8] = include_bytes!("../icons/tray.png");
    Image::from_bytes(bytes).ok()
}

/// Build the per-project submenu: panel/browser deep-links, the on-disk + git
/// quick actions, then the project's pipelines — each runnable in one click.
fn project_submenu(
    app: &AppHandle,
    project: &Project,
    pipelines: &[Pipeline],
) -> tauri::Result<Submenu<tauri::Wry>> {
    let sub = Submenu::with_id(app, format!("proj:{}", project.id), &project.name, true)?;
    sub.append(&MenuItem::with_id(
        app,
        format!("proj-panel:{}", project.id),
        "Open in Panel",
        true,
        None::<&str>,
    )?)?;
    sub.append(&MenuItem::with_id(
        app,
        format!("proj-browser:{}", project.id),
        "Open in Browser",
        true,
        None::<&str>,
    )?)?;
    sub.append(&PredefinedMenuItem::separator(app)?)?;
    sub.append(&MenuItem::with_id(
        app,
        format!("proj-folder:{}", project.id),
        "Open Project Folder",
        true,
        None::<&str>,
    )?)?;
    sub.append(&MenuItem::with_id(
        app,
        format!("proj-pull:{}", project.id),
        "Git Pull",
        true,
        None::<&str>,
    )?)?;
    sub.append(&MenuItem::with_id(
        app,
        format!("proj-fetch:{}", project.id),
        "Git Fetch",
        true,
        None::<&str>,
    )?)?;
    sub.append(&PredefinedMenuItem::separator(app)?)?;
    sub.append(&MenuItem::with_id(
        app,
        "run-header",
        "Run pipeline",
        false,
        None::<&str>,
    )?)?;

    if pipelines.is_empty() {
        sub.append(&MenuItem::with_id(
            app,
            "no-pipelines",
            "(no pipelines)",
            false,
            None::<&str>,
        )?)?;
    } else {
        for p in pipelines {
            sub.append(&MenuItem::with_id(
                app,
                format!("run:{}", p.id),
                format!("▶ {}", p.name),
                true,
                None::<&str>,
            )?)?;
        }
    }
    Ok(sub)
}

/// Build the full context menu from the cache.
fn build_menu(app: &AppHandle, cache: &TrayCache) -> tauri::Result<Menu<tauri::Wry>> {
    let menu = Menu::new(app)?;

    // Status header: health + (only when non-zero) running/queued counts.
    menu.append(&MenuItem::with_id(
        app,
        "health",
        server_health_label(cache.server_healthy),
        false,
        None::<&str>,
    )?)?;
    if cache.counts.running > 0 || cache.counts.queued > 0 {
        menu.append(&MenuItem::with_id(
            app,
            "counts",
            format!(
                "{} running · {} queued",
                cache.counts.running, cache.counts.queued
            ),
            false,
            None::<&str>,
        )?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    menu.append(&MenuItem::with_id(app, "open-app", "Open BuildPilot", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "open-browser", "Open in Browser", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    // Projects group.
    let projects = Submenu::with_id(app, "projects", "Projects", true)?;
    if let Some(placeholder) = &cache.placeholder {
        projects.append(&MenuItem::with_id(
            app,
            "projects-placeholder",
            placeholder.clone(),
            false,
            None::<&str>,
        )?)?;
    } else if cache.projects.is_empty() {
        projects.append(&MenuItem::with_id(
            app,
            "no-projects",
            "(no projects)",
            false,
            None::<&str>,
        )?)?;
    } else {
        for project in &cache.projects {
            let pls: Vec<Pipeline> = cache
                .pipelines
                .iter()
                .filter(|pl| pl.project_id == project.id)
                .cloned()
                .collect();
            let sub = project_submenu(app, project, &pls)?;
            projects.append(&sub)?;
        }
    }
    menu.append(&projects)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    menu.append(&MenuItem::with_id(app, "builds", "Builds", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "queue", "Queue", true, None::<&str>)?)?;
    menu.append(&MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    let autostart = CheckMenuItem::with_id(
        app,
        "toggle-autostart",
        "Launch at Login",
        true,
        state::is_launch_at_login(app),
        None::<&str>,
    )?;
    menu.append(&autostart)?;
    menu.append(&MenuItem::with_id(app, "restart", "Restart BuildPilot", true, None::<&str>)?)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?)?;

    Ok(menu)
}

/// Re-apply the menu and tooltip from the current cache.
fn apply_menu(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (menu, tooltip) = {
        let cache = state.tray.lock().unwrap();
        let menu = match build_menu(app, &cache) {
            Ok(m) => m,
            Err(err) => {
                eprintln!("Failed to build tray menu: {err}");
                return;
            }
        };
        let tooltip = if cache.counts.running > 0 || cache.counts.queued > 0 {
            format!(
                "BuildPilot — {} running, {} queued",
                cache.counts.running, cache.counts.queued
            )
        } else {
            "BuildPilot".to_string()
        };
        (menu, tooltip)
    };
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_menu(Some(menu));
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

/// Create the tray icon with a synchronous placeholder menu — the real project
/// data is applied by [`rebuild_tray_menu`] once the server is up.
pub fn create_tray(app: &AppHandle) -> tauri::Result<()> {
    {
        let state = app.state::<AppState>();
        let mut cache = state.tray.lock().unwrap();
        cache.placeholder = Some("(loading…)".to_string());
    }

    let menu = {
        let state = app.state::<AppState>();
        let cache = state.tray.lock().unwrap();
        build_menu(app, &cache)?
    };

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("BuildPilot")
        .menu(&menu)
        // Left-click toggles the window; the menu opens on right-click.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| handle_menu_event(app, event.id().as_ref()))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                window::toggle_window(tray.app_handle());
            }
        });

    if let Some(icon) = tray_image() {
        builder = builder.icon(icon);
        #[cfg(target_os = "macos")]
        {
            builder = builder.icon_as_template(true);
        }
    } else if let Some(default) = app.default_window_icon() {
        builder = builder.icon(default.clone());
    }

    builder.build(app)?;
    Ok(())
}

/// Fetch the full project + pipeline set and the queue counts, then re-apply the
/// menu. Called once the server is up and (debounced) on project add/remove.
pub async fn rebuild_tray_menu(app: &AppHandle) {
    let http = app.state::<AppState>().http.clone();
    let (projects, pipelines, counts) = tokio::join!(
        api::fetch_projects(&http),
        api::fetch_pipelines(&http),
        api::fetch_queue_counts(&http),
    );
    {
        let state = app.state::<AppState>();
        let mut cache = state.tray.lock().unwrap();
        cache.projects = projects;
        cache.pipelines = pipelines;
        cache.counts = counts;
        cache.placeholder = None;
    }
    apply_menu(app);
}

/// Refresh only the running/queued counts (cheap) and re-apply the menu from
/// cache — used when build events fire without the project set changing.
pub async fn refresh_tray_status(app: &AppHandle) {
    let http = app.state::<AppState>().http.clone();
    let counts = api::fetch_queue_counts(&http).await;
    {
        let state = app.state::<AppState>();
        state.tray.lock().unwrap().counts = counts;
    }
    apply_menu(app);
}

/// Update last-known server health and re-apply the menu in place (no fetch).
/// No-op if unchanged.
pub fn set_server_health(app: &AppHandle, healthy: bool) {
    let changed = {
        let state = app.state::<AppState>();
        let mut cache = state.tray.lock().unwrap();
        if cache.server_healthy == Some(healthy) {
            false
        } else {
            cache.server_healthy = Some(healthy);
            true
        }
    };
    if changed {
        apply_menu(app);
    }
}

/// Trigger a pipeline straight from the tray and surface a quick toast so the
/// user gets immediate feedback (the eventual buildFinished toast follows via
/// the SSE stream). Refresh the running/queued counts shortly after.
async fn run_pipeline(app: &AppHandle, pipeline_id: String) {
    let (http, name) = {
        let state = app.state::<AppState>();
        let name = state
            .tray
            .lock()
            .unwrap()
            .pipelines
            .iter()
            .find(|p| p.id == pipeline_id)
            .map(|p| p.name.clone())
            .unwrap_or_else(|| pipeline_id.clone());
        (state.http.clone(), name)
    };
    let ok = api::trigger_build(&http, &pipeline_id).await;
    let _ = app
        .notification()
        .builder()
        .title(if ok {
            "Pipeline started ▶"
        } else {
            "Couldn't start pipeline"
        })
        .body(if ok {
            name.clone()
        } else {
            format!("{name} could not be started.")
        })
        .show();
    refresh_tray_status(app).await;
}

fn project_path(app: &AppHandle, project_id: &str) -> Option<String> {
    let state = app.state::<AppState>();
    let cache = state.tray.lock().unwrap();
    cache
        .projects
        .iter()
        .find(|p| p.id == project_id)
        .map(|p| p.path.clone())
}

/// Parse a menu item id and dispatch its action.
pub fn handle_menu_event(app: &AppHandle, id: &str) {
    match id {
        "open-app" => window::show_window(app, "/"),
        "open-browser" => window::open_in_browser(app, "/"),
        "builds" => window::show_window(app, "/builds"),
        "queue" => window::show_window(app, "/queue"),
        "settings" => window::show_window(app, "/settings"),
        "toggle-autostart" => {
            let enabled = !state::is_launch_at_login(app);
            state::set_launch_at_login(app, enabled);
        }
        "restart" => {
            // Full restart: stop the owned server, then relaunch a fresh app
            // (which spawns a fresh server). app.restart() does not return.
            crate::server::stop_server(app);
            app.restart();
        }
        "quit" => crate::quit_app(app),
        _ => {
            if let Some(pid) = id.strip_prefix("run:") {
                let app = app.clone();
                let pid = pid.to_string();
                tauri::async_runtime::spawn(async move { run_pipeline(&app, pid).await });
            } else if let Some(pid) = id.strip_prefix("proj-panel:") {
                let _ = pid;
                window::show_window(app, "/projects");
            } else if let Some(pid) = id.strip_prefix("proj-browser:") {
                let _ = pid;
                window::open_in_browser(app, "/projects");
            } else if let Some(pid) = id.strip_prefix("proj-folder:") {
                if let Some(path) = project_path(app, pid) {
                    let _ = app.opener().open_path(path, None::<&str>);
                }
            } else if let Some(pid) = id.strip_prefix("proj-pull:") {
                let app = app.clone();
                let path = format!("/api/projects/{pid}/pull");
                tauri::async_runtime::spawn(async move {
                    let http = app.state::<AppState>().http.clone();
                    api::post_action(&http, &path).await;
                });
            } else if let Some(pid) = id.strip_prefix("proj-fetch:") {
                let app = app.clone();
                let path = format!("/api/projects/{pid}/fetch");
                tauri::async_runtime::spawn(async move {
                    let http = app.state::<AppState>().http.clone();
                    api::post_action(&http, &path).await;
                });
            }
        }
    }
}
