//! Maps a server-side pipeline event into a native OS notification. Only the
//! events a user actually cares about while the app sits in the tray raise a
//! toast; the high-frequency stream (log lines, per-step churn) is ignored.
//! Port of the Electron `src/notify.ts`.
//!
//! Events arrive as `serde_json::Value` (parsed from the SSE `data:` line) so we
//! never break on a server-side type addition — unknown `type`s fall through.

use serde_json::Value;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

fn notify(app: &AppHandle, title: &str, body: &str) {
    let _ = app
        .notification()
        .builder()
        .title(title)
        .body(body)
        .show();
}

fn str_field<'a>(v: &'a Value, key: &str) -> &'a str {
    v.get(key).and_then(Value::as_str).unwrap_or("")
}

/// Turn a parsed server event into a native notification, if it's one of the
/// few notable terminal/lifecycle events.
pub fn handle_event(app: &AppHandle, event: &Value) {
    match event.get("type").and_then(Value::as_str) {
        Some("buildFinished") => {
            let build = match event.get("build") {
                Some(b) => b,
                None => return,
            };
            let branch = str_field(build, "triggerBranch");
            // Only terminal outcomes raise a toast.
            let msg = match str_field(build, "status") {
                "success" => Some((
                    "Build succeeded ✓".to_string(),
                    format!("The build on {branch} completed."),
                )),
                "failed" => Some((
                    "Build failed ✗".to_string(),
                    format!("The build on {branch} errored."),
                )),
                "cancelled" => Some((
                    "Build cancelled".to_string(),
                    format!("Branch {branch}."),
                )),
                _ => None,
            };
            if let Some((title, body)) = msg {
                notify(app, &title, &body);
            }
        }
        Some("buildAwaitingApproval") => {
            notify(
                app,
                "Awaiting approval",
                "A build is waiting for your manual approval.",
            );
        }
        Some("notifyMatrix") => {
            let total = event.get("total").and_then(Value::as_u64).unwrap_or(0);
            let success = event.get("success").and_then(Value::as_u64).unwrap_or(0);
            let failed = event.get("failed").and_then(Value::as_u64).unwrap_or(0);
            notify(
                app,
                "Matrix build finished",
                &format!("{success}/{total} passed, {failed} failed."),
            );
        }
        Some("newCommit") => {
            let branch = str_field(event, "branch");
            let n = event
                .get("commits")
                .and_then(Value::as_array)
                .map(|a| a.len())
                .unwrap_or(0);
            notify(
                app,
                "New commit detected",
                &format!("{n} new commit(s) landed on {branch}."),
            );
        }
        // Everything else (logs, step churn, template/host edits) stays silent.
        _ => {}
    }
}
