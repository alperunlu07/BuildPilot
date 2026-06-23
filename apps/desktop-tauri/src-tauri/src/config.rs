//! Resolves how the desktop app talks to the BuildPilot server: the loopback
//! base URL (host + port) and an optional API token. Both are read from the
//! same on-disk sources the server itself uses, so the two never disagree.
//!
//! Faithful port of the Electron `src/config.ts`:
//!   * `BUILDPILOT_HOME` relocates the whole profile (config + state).
//!   * host/port come from `~/.buildpilot/config.json` (the server's own file),
//!     falling back to the documented `127.0.0.1:51731` default.
//!   * the API token comes from `BUILDPILOT_API_TOKEN` or an `apiToken` field in
//!     `~/.buildpilot/desktop.json` (absent on default, auth-disabled installs).
//!
//! Values are resolved lazily into a cache that can be refreshed after a known
//! change (e.g. the server reports a different port across a restart).

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

use serde_json::Value;

// Defaults match `apps/server/src/config.ts` DEFAULT_CONFIG — used until the
// server's config.json has been written (a fresh install writes the same).
const DEFAULT_HOST: &str = "127.0.0.1";
const DEFAULT_PORT: u16 = 51731;

/// The on-disk profile directory. `BUILDPILOT_HOME` relocates the whole profile
/// (config, DB, …) and is honoured by both the server and this app.
pub fn config_dir() -> PathBuf {
    if let Ok(home) = std::env::var("BUILDPILOT_HOME") {
        if !home.is_empty() {
            return PathBuf::from(home);
        }
    }
    let base = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    base.join(".buildpilot")
}

fn config_file() -> PathBuf {
    config_dir().join("config.json")
}

/// Where the desktop app stores its own preferences (auto-launch choice,
/// optional API token, …).
pub fn desktop_state_file() -> PathBuf {
    config_dir().join("desktop.json")
}

fn read_json(path: &PathBuf) -> Value {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .unwrap_or(Value::Null)
}

#[derive(Debug, Clone)]
pub struct ResolvedConfig {
    pub host: String,
    pub port: u16,
    pub token: Option<String>,
}

impl ResolvedConfig {
    pub fn base_url(&self) -> String {
        format!("http://{}:{}", self.host, self.port)
    }
}

fn is_loopback_host(host: &str) -> bool {
    let h = host.to_ascii_lowercase();
    h == "127.0.0.1" || h == "::1" || h == "localhost"
}

/// Optional API token for when the server has auth enabled. Generated on the
/// dashboard's API-tokens page and supplied via `BUILDPILOT_API_TOKEN` or an
/// `apiToken` field in desktop.json. Absent on default (auth-disabled) installs.
fn resolve_api_token() -> Option<String> {
    if let Ok(tok) = std::env::var("BUILDPILOT_API_TOKEN") {
        if !tok.is_empty() {
            return Some(tok);
        }
    }
    let desktop = read_json(&desktop_state_file());
    desktop
        .get("apiToken")
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// The server's host/port are authoritative from its own config.json (the
/// server reads them from there, NOT from env). Mirror that exact source so the
/// two never disagree; fall back to the documented defaults when the file
/// hasn't been written yet.
fn resolve() -> ResolvedConfig {
    let server_config = read_json(&config_file());
    let host = server_config
        .get("host")
        .and_then(Value::as_str)
        .unwrap_or(DEFAULT_HOST)
        .to_owned();
    // A `port` outside the valid TCP range (or 0) is bogus — fall back to the
    // documented default rather than silently truncating with `as u16`
    // (e.g. 70000 would wrap to 4464 and connect to the wrong port).
    let port = server_config
        .get("port")
        .and_then(Value::as_u64)
        .filter(|p| (1..=u16::MAX as u64).contains(p))
        .map(|p| p as u16)
        .unwrap_or(DEFAULT_PORT);

    // The desktop assumes loopback: it adopts/spawns the server locally and
    // attaches a token only when auth is on. A non-loopback host with auth
    // disabled exposes the dashboard + API to anyone on the LAN — warn loudly,
    // but only once per process so a hot config that pins a LAN host (re-read on
    // every server restart) doesn't spam the log.
    if !is_loopback_host(&host) && !WARNED_NON_LOOPBACK.swap(true, Ordering::Relaxed) {
        eprintln!(
            "WARNING: server host \"{host}\" is not a loopback address. The desktop \
             app assumes loopback; a non-loopback host with auth disabled exposes \
             the BuildPilot dashboard and API to other machines on the LAN."
        );
    }

    ResolvedConfig {
        host,
        port,
        token: resolve_api_token(),
    }
}

/// Process-wide config cache. Resolved on first access exactly like the old
/// top-level reads, and replaceable via [`refresh`].
static CACHE: Mutex<Option<ResolvedConfig>> = Mutex::new(None);

/// Whether the non-loopback host warning has already been emitted this process,
/// so re-resolving the config (e.g. on every server restart) warns only once.
static WARNED_NON_LOOPBACK: AtomicBool = AtomicBool::new(false);

/// Snapshot of the current resolved config (host/port/token).
pub fn current() -> ResolvedConfig {
    let mut guard = CACHE.lock().unwrap();
    if guard.is_none() {
        *guard = Some(resolve());
    }
    guard.clone().unwrap()
}

/// Re-read the server config + token from disk, replacing the cache. Call after
/// a known change (e.g. the server reports a different port, or a token is
/// added) so accessors stop returning stale values without an app restart.
pub fn refresh() -> ResolvedConfig {
    let fresh = resolve();
    *CACHE.lock().unwrap() = Some(fresh.clone());
    fresh
}

pub fn base_url() -> String {
    current().base_url()
}

/// The Authorization header value to attach to every API/SSE request — `None`
/// unless a token is configured.
pub fn auth_header() -> Option<String> {
    current().token.map(|t| format!("Bearer {t}"))
}
