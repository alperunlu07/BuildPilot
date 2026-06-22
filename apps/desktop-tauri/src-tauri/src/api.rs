//! HTTP/SSE client for the local BuildPilot server. Mirrors the Electron
//! `src/api.ts`: fetch projects/pipelines/queue, trigger a build, POST a project
//! action (git pull/fetch), and subscribe to the `/events` SSE stream with a
//! jittered reconnect backoff. Every call attaches the optional bearer token.

use std::time::Duration;

use futures_util::StreamExt;
use serde_json::Value;

use crate::config;
use crate::models::{HealthResponse, Pipeline, Project, QueueCounts, QueueSnapshot};

/// A shared client with sane timeouts. reqwest pools connections, so reusing one
/// client across all calls (and the long-lived SSE stream) is preferable to
/// building a fresh one each time.
pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .build()
        .expect("failed to build reqwest client")
}

/// Attach the auth header (when a token is configured) to a request builder.
fn with_auth(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match config::auth_header() {
        Some(value) => req.header(reqwest::header::AUTHORIZATION, value),
        None => req,
    }
}

/// Probe `/api/health` and confirm it returns the BuildPilot shape
/// (`{ ok: true, version }`). Guards server adoption against an unrelated
/// service squatting on our port. Returns the reported version on a match.
pub async fn probe_buildpilot(http: &reqwest::Client) -> Option<String> {
    let url = format!("{}/api/health", config::base_url());
    let res = http
        .get(url)
        .timeout(Duration::from_millis(1500))
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let body = res.json::<HealthResponse>().await.ok()?;
    if body.ok {
        body.version
    } else {
        None
    }
}

/// Lightweight liveness probe — `/api/health` is always public (even with auth
/// enabled), so this works without a credential.
pub async fn is_server_up(http: &reqwest::Client) -> bool {
    let url = format!("{}/api/health", config::base_url());
    http.get(url)
        .timeout(Duration::from_millis(1500))
        .send()
        .await
        .map(|r| r.status().is_success())
        .unwrap_or(false)
}

/// All projects. Empty-on-error so a transient failure yields an empty tray
/// group rather than a crash.
pub async fn fetch_projects(http: &reqwest::Client) -> Vec<Project> {
    let url = format!("{}/api/projects", config::base_url());
    let res = with_auth(http.get(url).timeout(Duration::from_secs(4)))
        .send()
        .await;
    match res {
        Ok(r) if r.status().is_success() => r.json::<Vec<Project>>().await.unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// All pipelines across projects (the tray groups them by projectId).
pub async fn fetch_pipelines(http: &reqwest::Client) -> Vec<Pipeline> {
    let url = format!("{}/api/pipelines", config::base_url());
    let res = with_auth(http.get(url).timeout(Duration::from_secs(4)))
        .send()
        .await;
    match res {
        Ok(r) if r.status().is_success() => r.json::<Vec<Pipeline>>().await.unwrap_or_default(),
        _ => Vec::new(),
    }
}

/// Collapse the lane-grouped queue snapshot into the two counts the tray shows.
/// Zeroes on error.
pub async fn fetch_queue_counts(http: &reqwest::Client) -> QueueCounts {
    let url = format!("{}/api/queue", config::base_url());
    let res = with_auth(http.get(url).timeout(Duration::from_secs(4)))
        .send()
        .await;
    match res {
        Ok(r) if r.status().is_success() => r
            .json::<QueueSnapshot>()
            .await
            .map(|s| s.counts())
            .unwrap_or_default(),
        _ => QueueCounts::default(),
    }
}

/// Trigger a build for a pipeline (the tray's "run from here"). Returns whether
/// the server accepted it so the caller can surface success/failure feedback.
pub async fn trigger_build(http: &reqwest::Client, pipeline_id: &str) -> bool {
    let url = format!("{}/api/builds", config::base_url());
    let res = with_auth(http.post(url).timeout(Duration::from_secs(8)))
        .json(&serde_json::json!({ "pipelineId": pipeline_id }))
        .send()
        .await;
    matches!(res, Ok(r) if r.status().is_success())
}

/// Fire-and-forget POST to a project action endpoint (git pull/fetch). The
/// dashboard surfaces the real error/state, so this is best-effort.
pub async fn post_action(http: &reqwest::Client, path: &str) {
    let url = format!("{}{}", config::base_url(), path);
    let _ = with_auth(http.post(url).timeout(Duration::from_secs(8)))
        .send()
        .await;
}

// Backoff window for SSE reconnects. The base matches Electron's fixed 2s
// cadence; randomized jitter on top means a permanently-down server doesn't
// produce a perfectly tight, synchronised reconnect loop.
const RECONNECT_BASE_MS: u64 = 2000;
const RECONNECT_JITTER_MS: u64 = 1000;

/// Subscribe to the server's SSE stream and invoke `on_event` for every parsed
/// event (as a `serde_json::Value`). Reconnects with a jittered backoff whenever
/// the stream drops (server restart, transient blip). Runs until the surrounding
/// task is aborted, so spawn it on a dedicated task and drop the `JoinHandle` to
/// stop it.
pub async fn subscribe_events<F>(http: reqwest::Client, mut on_event: F)
where
    F: FnMut(Value) + Send + 'static,
{
    loop {
        if let Err(()) = stream_once(&http, &mut on_event).await {
            // fall through to reconnect
        }
        // Jittered backoff, never below the base, before the next attempt.
        let jitter = fastrand::u64(0..RECONNECT_JITTER_MS);
        tokio::time::sleep(Duration::from_millis(RECONNECT_BASE_MS + jitter)).await;
    }
}

/// One connect→read loop. Returns `Err(())` on any failure so the caller
/// reconnects; returns `Ok(())` only when the stream ends cleanly.
async fn stream_once<F>(http: &reqwest::Client, on_event: &mut F) -> Result<(), ()>
where
    F: FnMut(Value),
{
    let url = format!("{}/events", config::base_url());
    let res = with_auth(http.get(url).header(reqwest::header::ACCEPT, "text/event-stream"))
        .send()
        .await
        .map_err(|_| ())?;
    if !res.status().is_success() {
        return Err(());
    }

    let mut stream = res.bytes_stream();
    // Byte buffer so partial multi-byte UTF-8 sequences split across chunks are
    // never decoded mid-character — we only decode complete frames.
    let mut buffer: Vec<u8> = Vec::new();

    while let Some(chunk) = stream.next().await {
        let bytes = chunk.map_err(|_| ())?;
        buffer.extend_from_slice(&bytes);

        // SSE frames are separated by a blank line. Each `data:` line holds one
        // JSON-encoded ServerEvent (see apps/server/src/api/events.ts).
        while let Some(pos) = find_frame_boundary(&buffer) {
            let frame: Vec<u8> = buffer.drain(..pos + 2).collect();
            let frame = &frame[..frame.len() - 2]; // strip the trailing "\n\n"
            for line in frame.split(|&b| b == b'\n') {
                let line = String::from_utf8_lossy(line);
                let Some(rest) = line.strip_prefix("data:") else {
                    continue;
                };
                let payload = rest.trim();
                if payload.is_empty() {
                    continue;
                }
                if let Ok(value) = serde_json::from_str::<Value>(payload) {
                    on_event(value);
                }
            }
        }
    }
    Ok(())
}

/// Index of the first `\n\n` frame separator in the buffer, if any.
fn find_frame_boundary(buf: &[u8]) -> Option<usize> {
    buf.windows(2).position(|w| w == b"\n\n")
}
