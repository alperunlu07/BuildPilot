//! Minimal serde models mirroring the subset of `@buildpilot/shared-types` the
//! tray app actually consumes. We deliberately model only the fields the tray
//! menu + notifications read — the rest of each payload is ignored — so a
//! server-side type addition never breaks deserialization here.

use serde::Deserialize;

/// A registered project, as returned by `GET /api/projects`. The tray groups
/// pipelines under these and exposes folder/git quick-actions, so it needs the
/// id, display name, and on-disk path.
#[derive(Debug, Clone, Deserialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    /// Absolute path on disk — used by the "Open Project Folder" action.
    pub path: String,
}

/// A pipeline, as returned by `GET /api/pipelines`. Grouped under its project in
/// the tray; each is runnable in one click.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Pipeline {
    pub id: String,
    pub project_id: String,
    pub name: String,
}

/// One lane's slice of the queue snapshot. We only need the lengths of the two
/// build lists to compute the running/queued counts shown in the tray.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct QueueLaneSnapshot {
    #[serde(default)]
    pub running: Vec<serde_json::Value>,
    #[serde(default)]
    pub pending: Vec<serde_json::Value>,
}

/// `GET /api/queue` response — lane-grouped running/pending builds.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct QueueSnapshot {
    #[serde(default)]
    pub lanes: Vec<QueueLaneSnapshot>,
}

impl QueueSnapshot {
    /// Collapse the lane-grouped snapshot into the two counts the tray shows:
    /// builds currently running and builds waiting to start.
    pub fn counts(&self) -> QueueCounts {
        let mut counts = QueueCounts::default();
        for lane in &self.lanes {
            counts.running += lane.running.len() as u32;
            counts.queued += lane.pending.len() as u32;
        }
        counts
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct QueueCounts {
    pub running: u32,
    pub queued: u32,
}

/// The BuildPilot health-probe shape (`GET /api/health` → `{ ok, version }`).
/// Used to confirm an already-running server is actually ours before adopting
/// it, rather than treating an unrelated service squatting on the port as
/// BuildPilot.
#[derive(Debug, Clone, Deserialize)]
pub struct HealthResponse {
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub version: Option<String>,
}
