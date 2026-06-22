//! Spawns (or adopts) the BuildPilot Fastify server and keeps it alive. Port of
//! the Electron `src/server.ts`, adapted to a Rust/Tauri world:
//!
//!   * **Adopt** an already-running server (e.g. the user's own `pnpm dev`) when
//!     `/api/health` answers with the BuildPilot shape — and never kill it.
//!   * Otherwise **spawn** the server and supervise it: an unexpected exit is
//!     respawned with a capped exponential backoff, giving up after a few rapid
//!     consecutive failures so a crash-looping server doesn't spin forever. A
//!     restart that answers `/api/health` resets the failure counter.
//!   * On quit, stop only the server **we** own — gracefully (SIGTERM → SIGKILL
//!     on POSIX; `taskkill /T /F` tree-kill on Windows).
//!
//! Launch resolution, in priority order:
//!   1. `BUILDPILOT_SERVER_CMD` — explicit override ("node /path/server.cjs").
//!   2. Packaged build — the bundled `server/index.cjs` shipped as a resource,
//!      run with a Node runtime (a shipped `runtime/node`, else system `node`).
//!   3. Dev checkout — the TypeScript source run through the workspace `tsx`.
//!
//! Unlike Electron there is no embedded Node, so the packaged app ships the
//! esbuild server bundle + its native node_modules as resources and runs them
//! with Node (see scripts/ and docs/DESKTOP_TAURI.md).

use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

use crate::api;
use crate::config;
use crate::AppState;

const RESTART_BASE_MS: u64 = 1000;
const RESTART_MAX_MS: u64 = 30_000;
const MAX_CONSECUTIVE_FAILURES: u32 = 5;
const STARTUP_TIMEOUT: Duration = Duration::from_secs(30);

fn log(line: impl AsRef<str>) {
    println!("[server] {}", line.as_ref());
}

struct Launch {
    cmd: String,
    args: Vec<String>,
    cwd: PathBuf,
    /// Extra env to set (used by the packaged path to point the server at the
    /// shipped web bundle).
    env: Vec<(String, String)>,
}

/// Split a command string into argv, respecting single/double quotes so a
/// command or path containing spaces (very common on Windows, e.g.
/// "C:\\Program Files\\…") parses as one token. Mirrors the Electron `tokenize`.
fn tokenize(input: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current = String::new();
    let mut quote: Option<char> = None;
    let mut started = false;

    for ch in input.chars() {
        match quote {
            Some(q) => {
                if ch == q {
                    quote = None;
                } else {
                    current.push(ch);
                }
            }
            None => match ch {
                '"' | '\'' => {
                    quote = Some(ch);
                    started = true;
                }
                ' ' | '\t' => {
                    if started {
                        tokens.push(std::mem::take(&mut current));
                        started = false;
                    }
                }
                _ => {
                    current.push(ch);
                    started = true;
                }
            },
        }
    }
    if started {
        tokens.push(current);
    }
    tokens
}

fn exists(p: &Path) -> bool {
    p.exists()
}

/// Resolve the bundled server entry inside the packaged app's resource dir, if
/// present. `None` in a dev checkout (no bundle shipped).
fn bundled_server(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let entry = resource_dir.join("server").join("index.cjs");
    if exists(&entry) {
        Some(entry)
    } else {
        None
    }
}

/// Resolve a Node runtime for the packaged path: a runtime shipped beside the
/// app (`runtime/node[.exe]`) is preferred so the target needs no system Node;
/// otherwise fall back to `node` on PATH.
fn node_runtime(app: &AppHandle) -> String {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let exe = if cfg!(windows) { "node.exe" } else { "node" };
        let shipped = resource_dir.join("runtime").join(exe);
        if exists(&shipped) {
            return shipped.to_string_lossy().into_owned();
        }
    }
    "node".to_string()
}

/// Locate the workspace `tsx` for the dev path. pnpm hoists it into the server
/// package's bin rather than the root, so probe the likely locations.
fn dev_tsx(repo_root: &Path) -> Option<PathBuf> {
    let tsx = if cfg!(windows) { "tsx.cmd" } else { "tsx" };
    let candidates = [
        repo_root
            .join("apps")
            .join("server")
            .join("node_modules")
            .join(".bin")
            .join(tsx),
        repo_root.join("node_modules").join(".bin").join(tsx),
        repo_root
            .join("node_modules")
            .join(".pnpm")
            .join("node_modules")
            .join(".bin")
            .join(tsx),
    ];
    candidates.into_iter().find(|c| c.exists())
}

/// Decide how to launch the server. Returns `None` if no launch target could be
/// located (no override, no bundle, no dev source/tsx).
fn resolve_launch(app: &AppHandle) -> Option<Launch> {
    // 1. Explicit override.
    if let Ok(override_cmd) = std::env::var("BUILDPILOT_SERVER_CMD") {
        if !override_cmd.is_empty() {
            let mut parts = tokenize(&override_cmd);
            if parts.is_empty() {
                return None;
            }
            let cmd = parts.remove(0);
            return Some(Launch {
                cmd,
                args: parts,
                cwd: std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")),
                env: Vec::new(),
            });
        }
    }

    // 2. Packaged: the bundled server beside the app.
    if let Some(bundled) = bundled_server(app) {
        let resource_dir = app.path().resource_dir().ok()?;
        let cwd = bundled.parent().map(PathBuf::from).unwrap_or(resource_dir.clone());
        let web_dist = resource_dir.join("web").join("dist");
        return Some(Launch {
            cmd: node_runtime(app),
            args: vec![bundled.to_string_lossy().into_owned()],
            cwd,
            env: vec![(
                "BUILDPILOT_WEB_DIST".to_string(),
                web_dist.to_string_lossy().into_owned(),
            )],
        });
    }

    // 3. Dev checkout. CARGO_MANIFEST_DIR is apps/desktop-tauri/src-tauri at
    //    compile time; the repo root is three levels up.
    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let repo_root = manifest_dir
        .parent()? // apps/desktop-tauri
        .parent()? // apps
        .parent()? // repo root
        .to_path_buf();
    let entry = repo_root
        .join("apps")
        .join("server")
        .join("src")
        .join("index.ts");
    if !exists(&entry) {
        return None;
    }
    let tsx = dev_tsx(&repo_root)?;
    Some(Launch {
        cmd: tsx.to_string_lossy().into_owned(),
        args: vec![entry.to_string_lossy().into_owned()],
        cwd: repo_root,
        env: Vec::new(),
    })
}

/// Spawn the server child with its stdout/stderr piped into our log.
fn spawn_child(launch: &Launch) -> std::io::Result<Child> {
    let mut cmd = Command::new(&launch.cmd);
    cmd.args(&launch.args)
        .current_dir(&launch.cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (k, v) in &launch.env {
        cmd.env(k, v);
    }
    // Don't pop a console window for the child on Windows.
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    // Reap on drop so a panicking supervisor never orphans the child.
    cmd.kill_on_drop(true);

    let mut child = cmd.spawn()?;

    // Pump both pipes into the log stream.
    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                log(line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                log(line);
            }
        });
    }
    Ok(child)
}

/// Poll `/api/health` until the server answers or the deadline passes. Returns
/// true on a healthy response.
pub async fn wait_for_server(http: &reqwest::Client, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        if api::is_server_up(http).await {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
    false
}

enum Startup {
    Healthy,
    Exited,
    Stopped,
}

/// Wait for the freshly-spawned child to answer `/api/health`, racing against an
/// early exit (crash on boot) and a stop request.
async fn await_startup(http: &reqwest::Client, child: &mut Child, state: &AppState) -> Startup {
    let deadline = Instant::now() + STARTUP_TIMEOUT;
    loop {
        if state.is_server_shutting_down() {
            return Startup::Stopped;
        }
        if let Ok(Some(_)) = child.try_wait() {
            return Startup::Exited;
        }
        if api::is_server_up(http).await {
            return Startup::Healthy;
        }
        if Instant::now() >= deadline {
            // Timed out waiting but the child is still alive — keep it and let
            // the run phase monitor it (matches Electron, which leaves the child
            // running even when waitForServer times out).
            return Startup::Healthy;
        }
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_millis(500)) => {}
            _ = state.stop_notify.notified() => return Startup::Stopped,
        }
    }
}

/// Gracefully stop a child we own: SIGTERM then SIGKILL on POSIX; a forced
/// tree-kill on Windows (the only reliable way to take down a shell-wrapped or
/// multi-process tree without orphaning anything).
async fn graceful_kill(mut child: Child) {
    let Some(pid) = child.id() else {
        return;
    };

    #[cfg(windows)]
    {
        let _ = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .await;
        return;
    }

    #[cfg(not(windows))]
    {
        // Polite SIGTERM first so Fastify can close gracefully.
        let _ = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .await;
        // Escalate to SIGKILL if it lingers past the grace window.
        match tokio::time::timeout(Duration::from_secs(5), child.wait()).await {
            Ok(_) => {}
            Err(_) => {
                log("Server did not exit on SIGTERM; sending SIGKILL.");
                let _ = child.kill().await;
            }
        }
    }
}

/// Backoff for the n-th consecutive failure, capped.
fn backoff_ms(failures: u32) -> u64 {
    let shifted = RESTART_BASE_MS.saturating_mul(1u64 << (failures.saturating_sub(1)).min(20));
    shifted.min(RESTART_MAX_MS)
}

/// The supervision loop for a server we own. Runs until a stop is requested or
/// we give up after too many rapid failures.
async fn supervise(app: AppHandle) {
    let state = app.state::<AppState>();
    let http = state.http.clone();
    let mut failures: u32 = 0;

    'outer: loop {
        if state.is_server_shutting_down() {
            break;
        }
        // Re-read host/port/token: a port or token may have changed across a
        // crash (e.g. config migration).
        config::refresh();

        let launch = match resolve_launch(&app) {
            Some(l) => l,
            None => {
                log("Could not locate the BuildPilot server to launch.");
                break;
            }
        };

        let mut child = match spawn_child(&launch) {
            Ok(c) => c,
            Err(err) => {
                log(format!("Failed to spawn server: {err}"));
                failures += 1;
                if failures > MAX_CONSECUTIVE_FAILURES {
                    log("Giving up auto-restart. Restart BuildPilot to try again.");
                    break;
                }
                tokio::time::sleep(Duration::from_millis(backoff_ms(failures))).await;
                continue 'outer;
            }
        };

        match await_startup(&http, &mut child, &state).await {
            Startup::Stopped => {
                graceful_kill(child).await;
                break;
            }
            Startup::Exited => {
                if state.is_server_shutting_down() {
                    break;
                }
                log("BuildPilot server exited unexpectedly during startup.");
                failures += 1;
                if failures > MAX_CONSECUTIVE_FAILURES {
                    log("Giving up auto-restart. Restart BuildPilot to try again.");
                    break;
                }
                let delay = backoff_ms(failures);
                log(format!(
                    "Restarting BuildPilot server in {}s (attempt {failures}/{MAX_CONSECUTIVE_FAILURES}).",
                    delay / 1000
                ));
                tokio::time::sleep(Duration::from_millis(delay)).await;
                continue 'outer;
            }
            Startup::Healthy => {
                log("BuildPilot server is up.");
                failures = 0; // healthy → reset the failure cap
            }
        }

        // Run phase: wait for an unexpected exit or a stop request.
        tokio::select! {
            status = child.wait() => {
                if state.is_server_shutting_down() {
                    break;
                }
                let code = status.ok().and_then(|s| s.code());
                log(format!(
                    "BuildPilot server exited unexpectedly (code {}).",
                    code.map(|c| c.to_string()).unwrap_or_else(|| "null".into())
                ));
                failures += 1;
                if failures > MAX_CONSECUTIVE_FAILURES {
                    log("Giving up auto-restart. Restart BuildPilot to try again.");
                    break;
                }
                let delay = backoff_ms(failures);
                log(format!(
                    "Restarting BuildPilot server in {}s (attempt {failures}/{MAX_CONSECUTIVE_FAILURES}).",
                    delay / 1000
                ));
                tokio::time::sleep(Duration::from_millis(delay)).await;
                continue 'outer;
            }
            _ = state.stop_notify.notified() => {
                graceful_kill(child).await;
                break;
            }
        }
    }
}

/// Start (or adopt) the BuildPilot server and resolve once it answers. If a
/// server is already listening — e.g. the user runs `pnpm dev` separately — we
/// adopt it (and never kill it on quit) instead of spawning a second one.
///
/// Returns whether the server is reachable.
pub async fn ensure_server(app: &AppHandle) -> bool {
    let state = app.state::<AppState>();
    state.set_server_shutting_down(false);
    let http = state.http.clone();

    // Adopt only a server that answers with the BuildPilot health shape.
    if let Some(version) = api::probe_buildpilot(&http).await {
        log(format!(
            "Adopted an already-running BuildPilot server (version {version})."
        ));
        return true;
    }

    // Spawn + supervise on a background task, then wait for readiness.
    let app_for_task = app.clone();
    tauri::async_runtime::spawn(async move {
        supervise(app_for_task).await;
    });

    wait_for_server(&http, STARTUP_TIMEOUT).await
}

/// Ask the owned server to stop (no-op for an adopted server, which we don't
/// supervise). Flips the shutting-down flag — suppressing auto-restart — and
/// wakes the supervisor, which performs the graceful kill.
pub fn stop_server(app: &AppHandle) {
    if let Some(state) = app.try_state::<AppState>() {
        state.set_server_shutting_down(true);
        state.stop_notify.notify_waiters();
    }
}
