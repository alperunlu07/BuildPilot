// builds.jsx — Builds & Logs page (table / timeline / heatmap)
const { useState: useStateBL, useMemo: useMemoBL } = React;

function generateBuildHistory() {
  const projects = window.BPData.projects;
  const triggers = ["poller", "manual", "cron", "webhook", "telegram"];
  const statuses = ["success","success","success","success","success","success","failed","success","running","cancelled"];
  const out = [];
  const now = Date.now();
  for (let i = 0; i < 64; i++) {
    const p = projects[i % projects.length];
    const pl = p.pipelines[i % p.pipelines.length];
    const status = i < 4 ? (i === 0 ? "running" : i === 1 ? "running" : "success")
                          : statuses[Math.floor((i * 7) % statuses.length)];
    const minutesAgo = i * 17 + Math.floor((i * 13) % 9);
    out.push({
      id: "b" + (520 - i),
      project: p,
      pipeline: pl,
      branch: pl.branch,
      sha: ["4f7a2b9", "9c1d3e0", "112ace0", "b8c4d2e", "e2f0c1a", "a01b842", "2a8e44f", "f3d219c"][i % 8],
      status,
      duration: status === "running" ? null : (40 + ((i * 31) % 540)),
      startedAt: now - minutesAgo * 60_000,
      trigger: triggers[(i * 3) % triggers.length],
      stepCount: 5 + ((i * 3) % 10),
      artifactCount: status === "success" ? 1 + ((i * 2) % 5) : 0,
      host: i % 3 === 0 ? "mac-mini-01" : null,
    });
  }
  return out;
}
const BUILD_HISTORY = generateBuildHistory();

function fmtBuildDur(s) {
  if (s == null) return "running…";
  if (s < 60) return s + "s";
  const m = Math.floor(s/60);
  const r = s % 60;
  return `${m}m ${String(r).padStart(2,"0")}s`;
}
function fmtRelTime(ts) {
  const diff = Math.floor((Date.now() - ts) / 60000);
  if (diff < 1) return "just now";
  if (diff < 60) return diff + "m ago";
  if (diff < 60 * 24) return Math.floor(diff/60) + "h ago";
  return Math.floor(diff / (60*24)) + "d ago";
}

const TRIGGER_ICON = { poller: "RefreshCw", manual: "Users", cron: "Clock", webhook: "Zap", telegram: "Send" };

function BuildsScreen({ setView, setProjectId, setPipelineId }) {
  const [viewMode, setViewMode] = useStateBL("table"); // table | timeline | heatmap
  const [filter, setFilter] = useStateBL("");
  const [statusFilter, setStatusFilter] = useStateBL("all");
  const [projectFilter, setProjectFilter] = useStateBL("all");

  const filtered = useMemoBL(() => BUILD_HISTORY.filter(b => {
    if (statusFilter !== "all" && b.status !== statusFilter) return false;
    if (projectFilter !== "all" && b.project.id !== projectFilter) return false;
    if (filter) {
      const q = filter.toLowerCase();
      if (!b.pipeline.name.toLowerCase().includes(q) &&
          !b.project.displayName.toLowerCase().includes(q) &&
          !b.sha.includes(q) &&
          !b.branch.includes(q)) return false;
    }
    return true;
  }), [filter, statusFilter, projectFilter]);

  const runningCount = BUILD_HISTORY.filter(b => b.status === "running").length;
  const todayCount = BUILD_HISTORY.filter(b => Date.now() - b.startedAt < 24*60*60*1000).length;

  return (
    <div className="page builds-page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1 className="page-title">Builds &amp; Logs</h1>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {BUILD_HISTORY.length} builds · {todayCount} today
            {runningCount > 0 && <> · <span style={{ color: "var(--st-running)" }}>{runningCount} currently running</span></>}
          </div>
        </div>
        <div className="row gap-2">
          <button className="btn btn-ghost btn-sm" title="Refresh"><Icon.RefreshCw size={11} /> Refresh</button>
          <div className="page-view-toggle">
            <button className={viewMode === "table" ? "on" : ""} onClick={() => setViewMode("table")} title="Table"><Icon.List size={13} /></button>
            <button className={viewMode === "timeline" ? "on" : ""} onClick={() => setViewMode("timeline")} title="Timeline"><Icon.Activity size={13} /></button>
            <button className={viewMode === "heatmap" ? "on" : ""} onClick={() => setViewMode("heatmap")} title="Heatmap"><Icon.Grid size={13} /></button>
          </div>
        </div>
      </div>

      <div className="builds-filters">
        <div className="page-search">
          <Icon.Search size={12} />
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter builds (pipeline, project, sha, branch)" />
        </div>
        <FilterPill label="Status" value={statusFilter} options={["all","success","failed","running","cancelled"]} onChange={setStatusFilter} />
        <FilterPill label="Project" value={projectFilter}
                    options={[{ v: "all", label: "all" }].concat(window.BPData.projects.map(p => ({ v: p.id, label: p.displayName })))}
                    onChange={setProjectFilter} />
        <FilterPill label="Trigger" value="all" options={["all","poller","manual","cron","webhook","telegram"]} onChange={() => {}} />
        <FilterPill label="Branch" value="all" options={["all","main","release/1.4","trunk","next"]} onChange={() => {}} />
        <FilterPill label="Range" value="30d" options={["1h","24h","7d","30d","90d"]} onChange={() => {}} />
        <span className="grow" />
        <span className="muted" style={{ fontSize: 11.5 }}>
          showing <span className="mono" style={{ color: "var(--text-primary)" }}>{filtered.length}</span> of {BUILD_HISTORY.length}
        </span>
      </div>

      <div className="page-body" style={{ padding: viewMode === "heatmap" ? "20px 24px" : 0 }}>
        {viewMode === "table" && <BuildsTable builds={filtered} setView={setView} setProjectId={setProjectId} setPipelineId={setPipelineId} />}
        {viewMode === "timeline" && <BuildsTimeline builds={filtered} />}
        {viewMode === "heatmap" && <BuildsHeatmap builds={BUILD_HISTORY} />}
      </div>
    </div>
  );
}

function FilterPill({ label, value, options, onChange }) {
  const [open, setOpen] = useStateBL(false);
  const opts = options.map(o => typeof o === "string" ? { v: o, label: o } : o);
  const current = opts.find(o => o.v === value);
  return (
    <div className="filter-pill" onClick={() => setOpen(!open)}>
      <span className="muted" style={{ fontSize: 11 }}>{label}:</span>
      <span className="mono" style={{ fontSize: 11.5 }}>{current ? current.label : value}</span>
      <Icon.ChevronDown size={10} style={{ opacity: 0.5 }} />
      {open && (
        <div className="filter-menu" onClick={e => e.stopPropagation()}>
          {opts.map(o => (
            <button key={o.v} className={"filter-menu-item" + (o.v === value ? " active" : "")}
                    onClick={() => { onChange(o.v); setOpen(false); }}>
              {o.label}
              {o.v === value && <Icon.Check size={11} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildsTable({ builds, setView, setProjectId, setPipelineId }) {
  return (
    <div className="builds-table">
      <div className="builds-table-head">
        <div style={{ flex: "0 0 24px" }}></div>
        <div style={{ flex: "0 0 100px" }}>Status</div>
        <div style={{ flex: "0 0 90px" }}>Build</div>
        <div style={{ flex: "1 1 240px", minWidth: 0 }}>Pipeline</div>
        <div style={{ flex: "0 0 130px" }}>Branch / SHA</div>
        <div style={{ flex: "0 0 80px" }}>Trigger</div>
        <div style={{ flex: "0 0 90px" }}>Duration</div>
        <div style={{ flex: "0 0 100px" }}>Started</div>
        <div style={{ flex: "0 0 60px", textAlign: "right" }}>Steps</div>
        <div style={{ flex: "0 0 120px" }}>Builder</div>
        <div style={{ flex: "0 0 80px", textAlign: "right" }}>Artifacts</div>
      </div>
      <div className="builds-table-body">
        {builds.map(b => {
          const TriggerI = Icon[TRIGGER_ICON[b.trigger]];
          return (
            <button key={b.id} className="builds-row" onClick={() => {
              setProjectId(b.project.id); setPipelineId(b.pipeline.id); setView("build");
            }}>
              <div style={{ flex: "0 0 24px", display: "flex", alignItems: "center" }}>
                <span className={"dot dot-" + b.status} />
              </div>
              <div style={{ flex: "0 0 100px" }}>
                <BPProjects.StatusPill status={b.status} animated />
              </div>
              <div style={{ flex: "0 0 90px" }}>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--text-muted)" }}>#{b.id}</span>
              </div>
              <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div className="col" style={{ gap: 1 }}>
                  <span className="truncate" style={{ fontSize: 12.5, fontWeight: 500 }}>{b.pipeline.name}</span>
                  <span className="muted truncate" style={{ fontSize: 11 }}>{b.project.displayName}</span>
                </div>
              </div>
              <div style={{ flex: "0 0 130px" }}>
                <div className="col" style={{ gap: 1 }}>
                  <span className="row gap-1" style={{ alignItems: "center" }}>
                    <Icon.GitBranch size={9} style={{ color: "var(--text-faint)" }} />
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{b.branch}</span>
                  </span>
                  <span className="mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>#{b.sha}</span>
                </div>
              </div>
              <div style={{ flex: "0 0 80px" }} title={b.trigger}>
                <span className="row gap-1" style={{ alignItems: "center" }}>
                  {TriggerI && <TriggerI size={11} style={{ color: "var(--text-muted)" }} />}
                  <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{b.trigger}</span>
                </span>
              </div>
              <div style={{ flex: "0 0 90px" }}>
                <span className="mono" style={{ fontSize: 11.5, color: b.status === "running" ? "var(--st-running)" : "var(--text-secondary)" }}>
                  {fmtBuildDur(b.duration)}
                </span>
              </div>
              <div style={{ flex: "0 0 100px" }}>
                <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{fmtRelTime(b.startedAt)}</span>
              </div>
              <div style={{ flex: "0 0 60px", textAlign: "right" }}>
                <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{b.stepCount}</span>
              </div>
              <div style={{ flex: "0 0 120px" }}>
                {b.host ? (
                  <span className="row gap-1" style={{ alignItems: "center" }}>
                    <Icon.Server size={10} style={{ color: "var(--text-faint)" }} />
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{b.host}</span>
                  </span>
                ) : <span className="muted" style={{ fontSize: 11 }}>local</span>}
              </div>
              <div style={{ flex: "0 0 80px", textAlign: "right" }}>
                {b.artifactCount > 0 ? (
                  <span className="row gap-1" style={{ alignItems: "center", justifyContent: "flex-end" }}>
                    <Icon.Package size={10} style={{ color: "var(--text-faint)" }} />
                    <span className="mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{b.artifactCount}</span>
                  </span>
                ) : <span className="muted" style={{ fontSize: 11 }}>—</span>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BuildsTimeline({ builds }) {
  const pipelines = useMemoBL(() => {
    const map = new Map();
    builds.forEach(b => {
      const key = b.pipeline.id;
      if (!map.has(key)) map.set(key, { pipeline: b.pipeline, project: b.project, items: [] });
      map.get(key).items.push(b);
    });
    return [...map.values()];
  }, [builds]);

  const now = Date.now();
  const span = 24 * 60 * 60 * 1000; // 24h
  const start = now - span;

  return (
    <div className="builds-timeline">
      <div className="bt-axis">
        {[0, 0.25, 0.5, 0.75, 1].map(p => {
          const t = new Date(start + p * span);
          return (
            <div key={p} className="bt-tick" style={{ left: `${20 + p * 75}%` }}>
              <span className="mono">{String(t.getHours()).padStart(2,"0")}:{String(t.getMinutes()).padStart(2,"0")}</span>
            </div>
          );
        })}
      </div>
      <div className="bt-rows">
        {pipelines.map(pl => (
          <div key={pl.pipeline.id} className="bt-row">
            <div className="bt-label">
              <span className="truncate" style={{ fontSize: 12, fontWeight: 500 }}>{pl.pipeline.name}</span>
              <span className="muted truncate" style={{ fontSize: 10.5 }}>{pl.project.displayName}</span>
            </div>
            <div className="bt-track">
              {pl.items.filter(b => b.startedAt > start).map(b => {
                const left = ((b.startedAt - start) / span) * 100;
                const dur = (b.duration || 60) * 1000;
                const width = Math.max((dur / span) * 100, 0.8);
                return (
                  <div key={b.id} className={"bt-bar bt-bar-" + b.status}
                       style={{ left: `${left}%`, width: `${width}%` }}
                       title={`#${b.id} · ${b.status} · ${fmtBuildDur(b.duration)}`}>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BuildsHeatmap({ builds }) {
  // 90 days × build count, GitHub-style
  const days = 90;
  const cells = useMemoBL(() => {
    const arr = [];
    for (let i = 0; i < days; i++) {
      const dayStart = Date.now() - (days - i) * 24 * 60 * 60 * 1000;
      const dayEnd = dayStart + 24 * 60 * 60 * 1000;
      const dayBuilds = builds.filter(b => b.startedAt >= dayStart && b.startedAt < dayEnd);
      const failed = dayBuilds.filter(b => b.status === "failed").length;
      // Synthesize realistic distribution using a hash
      const seed = (i * 37 + 13) % 100;
      const count = i === days - 1 ? dayBuilds.length :
                    seed < 8 ? 0 :
                    seed < 30 ? 1 + ((i * 3) % 3) :
                    seed < 70 ? 2 + ((i * 5) % 5) :
                    5 + ((i * 7) % 8);
      const failPct = seed < 30 ? 0 : seed < 80 ? 0.05 + ((i * 11) % 12)/100 : 0.25 + ((i * 13) % 30)/100;
      arr.push({ day: i, count, failed: Math.round(count * failPct), date: new Date(dayStart) });
    }
    return arr;
  }, [builds]);

  const maxCount = Math.max(...cells.map(c => c.count), 1);

  // Group into 7-row weeks
  const weeks = [];
  let cur = [];
  cells.forEach((c, i) => {
    cur.push(c);
    if (cur.length === 7 || i === cells.length - 1) { weeks.push(cur); cur = []; }
  });

  return (
    <div className="card heatmap-card">
      <div className="row" style={{ padding: "14px 16px", justifyContent: "space-between", borderBottom: "1px solid var(--border-subtle)" }}>
        <div className="col" style={{ gap: 2 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Last 90 days</span>
          <span className="muted" style={{ fontSize: 11.5 }}>{cells.reduce((s, c) => s + c.count, 0)} builds · {cells.reduce((s, c) => s + c.failed, 0)} failures</span>
        </div>
        <div className="heatmap-legend">
          <span className="muted" style={{ fontSize: 10.5 }}>less</span>
          {[0, 0.2, 0.4, 0.6, 0.8, 1].map(v => (
            <span key={v} className="heatmap-legend-cell" style={{ background: `rgba(52, 211, 153, ${0.08 + v * 0.65})` }} />
          ))}
          <span className="muted" style={{ fontSize: 10.5 }}>more</span>
        </div>
      </div>
      <div className="heatmap-grid">
        {weeks.map((wk, wi) => (
          <div key={wi} className="heatmap-col">
            {wk.map(c => {
              const intensity = c.count / maxCount;
              const failureBias = c.count > 0 ? c.failed / c.count : 0;
              const bg = c.count === 0 ? "var(--bg-elevated)" :
                          failureBias > 0.4 ? `rgba(251, 113, 133, ${0.15 + intensity * 0.7})` :
                          `rgba(52, 211, 153, ${0.08 + intensity * 0.7})`;
              return (
                <div key={c.day} className="heatmap-cell" style={{ background: bg }}
                     title={`${c.date.toDateString()} · ${c.count} builds · ${c.failed} failed`} />
              );
            })}
          </div>
        ))}
      </div>
      <div className="row" style={{ padding: "10px 16px", gap: 16, borderTop: "1px solid var(--border-subtle)" }}>
        <span className="row gap-2" style={{ fontSize: 11.5 }}><span className="heatmap-legend-cell" style={{ background: "rgba(52, 211, 153, 0.5)" }} /> Mostly succeeded</span>
        <span className="row gap-2" style={{ fontSize: 11.5 }}><span className="heatmap-legend-cell" style={{ background: "rgba(251, 113, 133, 0.5)" }} /> >40% failures</span>
        <span className="row gap-2" style={{ fontSize: 11.5 }}><span className="heatmap-legend-cell" style={{ background: "var(--bg-elevated)" }} /> No builds</span>
      </div>
    </div>
  );
}

window.BPBuilds = { BuildsScreen };
