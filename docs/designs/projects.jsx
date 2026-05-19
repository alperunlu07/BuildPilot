// projects.jsx — Projects grid screen
const { useState: useStateP } = React;

function Sparkline({ data, w = 120, h = 28 }) {
  // Render 30 bars colored by status
  const colorMap = {
    success: "var(--st-success)",
    failed: "var(--st-failed)",
    running: "var(--st-running)",
    cancelled: "var(--st-cancel)",
    skipped: "var(--st-skipped)",
  };
  const bw = w / data.length;
  return (
    <svg width={w} height={h} className="sparkline">
      {data.map((s, i) => {
        const barH = s === "running" ? h * 0.95 : 4 + (i % 7) * (h * 0.13);
        return (
          <rect key={i}
                x={i * bw + 1}
                y={h - barH}
                width={bw - 1.5}
                height={barH}
                rx={1}
                fill={colorMap[s] || "var(--st-pending)"}
                opacity={s === "skipped" ? 0.4 : 1} />
        );
      })}
    </svg>
  );
}

function StatusPill({ status, animated }) {
  const map = {
    success: { label: "succeeded", cls: "success", icon: "Check" },
    failed:  { label: "failed",    cls: "failed",  icon: "X" },
    running: { label: "running",   cls: "running", icon: "Loader" },
    pending: { label: "pending",   cls: "pending", icon: "Clock" },
    cancelled: { label: "cancelled", cls: "pending", icon: "Square" },
    skipped: { label: "skipped",   cls: "pending", icon: "Square" },
  };
  const m = map[status] || map.pending;
  const I = Icon[m.icon];
  return (
    <span className={"pill pill-" + m.cls}>
      <I size={9} className={animated && status === "running" ? "spin" : ""} />
      {m.label}
    </span>
  );
}

function ProjectsScreen({ setView, setProjectId, setPipelineId, buildState }) {
  const projects = window.BPData.projects;
  const [filter, setFilter] = useStateP("");
  const [viewMode, setViewMode] = useStateP("grid"); // grid | table

  const filtered = projects.filter(p =>
    !filter || p.displayName.toLowerCase().includes(filter.toLowerCase()) || p.path.toLowerCase().includes(filter.toLowerCase())
  );

  const totalPipelines = projects.reduce((s, p) => s + p.pipelines.length, 0);
  const activeBuilds = buildState === "running" ? 2 : 0;

  return (
    <div className="page projects-page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1 className="page-title">Projects</h1>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {projects.length} projects · {totalPipelines} pipelines
            {activeBuilds > 0 && <> · <span style={{ color: "var(--st-running)" }}>{activeBuilds} active builds</span></>}
          </div>
        </div>
        <div className="row gap-2">
          <div className="page-search">
            <Icon.Search size={12} />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter projects (path, branch, status)" />
          </div>
          <div className="page-view-toggle">
            <button className={viewMode === "grid" ? "on" : ""} onClick={() => setViewMode("grid")} title="Grid view"><Icon.Grid size={13} /></button>
            <button className={viewMode === "table" ? "on" : ""} onClick={() => setViewMode("table")} title="Table view"><Icon.List size={13} /></button>
          </div>
          <button className="btn btn-secondary btn-sm">
            <Icon.Filter size={11} /> Sort: Recent
            <Icon.ChevronDown size={11} />
          </button>
          <button className="btn btn-primary btn-sm">
            <Icon.Plus size={12} /> Add project
          </button>
        </div>
      </div>

      <div className="page-body">
        {viewMode === "grid" ? (
          <div className="proj-grid">
            {filtered.map(p => (
              <ProjectCard key={p.id} p={p} onOpen={() => { setProjectId(p.id); setPipelineId(p.pipelines[0]?.id); setView("pipeline"); }} buildState={buildState} />
            ))}
          </div>
        ) : (
          <ProjectsTable projects={filtered} onOpen={(p) => { setProjectId(p.id); setPipelineId(p.pipelines[0]?.id); setView("pipeline"); }} buildState={buildState} />
        )}
      </div>
    </div>
  );
}

function ProjectCard({ p, onOpen, buildState }) {
  const liveStatus = p.id === "p1" ? buildState : p.lastBuild.status;
  return (
    <div className="proj-card card card-interactive" onClick={onOpen}>
      <div className="proj-card-head">
        <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
          <div className="row gap-2" style={{ alignItems: "center" }}>
            <Icon.Folder size={14} style={{ color: "var(--accent)" }} />
            <span className="proj-name truncate">{p.displayName}</span>
            {p.pollerActive ? (
              <span className="poller-dot" title="Poller active"><span className="dot dot-success" /></span>
            ) : (
              <span className="poller-dot" title="Poller paused"><span className="dot dot-pending" /></span>
            )}
          </div>
          <div className="proj-path mono truncate" title={p.path}>{p.path}</div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={e => e.stopPropagation()} title="More">
          <Icon.MoreHorizontal size={14} />
        </button>
      </div>

      <div className="proj-card-meta">
        <span className="pill mono"><Icon.GitBranch size={9} /> {p.defaultBranch}</span>
        <span className="pill mono" title="Watched branches"><Icon.Eye size={9} /> {p.watchedBranches.length} watched</span>
        <span className="pill mono">{p.pipelines.length} pipelines</span>
      </div>

      <div className="proj-card-spark">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 4 }}>
          <span className="micro">Last 30 builds</span>
          <span className="micro mono">{p.successRate}% success</span>
        </div>
        <Sparkline data={p.builds30} w={260} h={32} />
      </div>

      <div className="proj-card-foot">
        <div className="col" style={{ gap: 2 }}>
          <div className="row gap-2">
            <StatusPill status={liveStatus} animated />
            <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>#{p.lastBuild.sha}</span>
          </div>
          <span className="muted" style={{ fontSize: 11 }}>
            {liveStatus === "running" ? "running · 3m 04s" : `${p.lastBuild.when} · ${formatDur(p.lastBuild.duration)}`}
          </span>
        </div>
        <div className="proj-card-stats">
          <div className="proj-stat"><span className="mono">{p.totalBuilds}</span><span className="micro">builds</span></div>
          <div className="proj-stat"><span className="mono">{p.avgDuration}</span><span className="micro">avg</span></div>
        </div>
      </div>
    </div>
  );
}

function ProjectsTable({ projects, onOpen, buildState }) {
  return (
    <div className="proj-table card">
      <div className="proj-table-head">
        <div style={{ flex: "0 0 320px" }}>Project</div>
        <div style={{ flex: "0 0 100px" }}>Branch</div>
        <div style={{ flex: "0 0 120px" }}>Last build</div>
        <div style={{ flex: "0 0 160px" }}>30-day history</div>
        <div style={{ flex: 1 }}>Path</div>
        <div style={{ flex: "0 0 100px", textAlign: "right" }}>Success</div>
      </div>
      {projects.map(p => {
        const liveStatus = p.id === "p1" ? buildState : p.lastBuild.status;
        return (
          <button key={p.id} className="proj-table-row" onClick={() => onOpen(p)}>
            <div className="row gap-2" style={{ flex: "0 0 320px", minWidth: 0 }}>
              <Icon.Folder size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
              <span className="truncate" style={{ fontWeight: 500 }}>{p.displayName}</span>
              <span className="pill mono" style={{ fontSize: 10 }}>{p.pipelines.length}</span>
            </div>
            <div style={{ flex: "0 0 100px" }}><span className="pill mono"><Icon.GitBranch size={9} />{p.defaultBranch}</span></div>
            <div style={{ flex: "0 0 120px" }}><StatusPill status={liveStatus} animated /></div>
            <div style={{ flex: "0 0 160px" }}><Sparkline data={p.builds30} w={140} h={22} /></div>
            <div className="mono truncate muted" style={{ flex: 1, fontSize: 11 }}>{p.path}</div>
            <div className="mono" style={{ flex: "0 0 100px", textAlign: "right", color: p.successRate > 90 ? "var(--st-success)" : "var(--st-failed)" }}>{p.successRate}%</div>
          </button>
        );
      })}
    </div>
  );
}

function formatDur(seconds) {
  if (seconds == null) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

window.BPProjects = { ProjectsScreen, StatusPill, Sparkline, formatDur };
