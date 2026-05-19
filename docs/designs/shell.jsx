// shell.jsx — Sidebar, Topbar, BottomLogPanel
const { useState, useEffect, useRef, useMemo } = React;

function Logo({ size = 22 }) {
  return <Icon.Compass size={size} className="logo-mark" />;
}

// ─── Sidebar ────────────────────────────────────────────────────────────────
function Sidebar({ view, setView, currentProjectId, setProjectId, currentPipelineId, setPipelineId, collapsed, buildState }) {
  const projects = window.BPData.projects;
  const [openProjectIds, setOpenProjectIds] = useState(["p1"]);
  const toggleOpen = (id) => setOpenProjectIds(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const navItems = [
    { id: "builds",   label: "Builds & Logs", icon: "History", count: buildState === "running" ? 2 : 0 },
    { id: "hosts",    label: "SSH Hosts",     icon: "Server",  count: 3 },
    { id: "catalog",  label: "Step Catalog",  icon: "Layers",  count: 83 },
    { id: "vault",    label: "Vault",         icon: "Lock",    soon: true },
    { id: "access",   label: "Users & Access",icon: "Users",   soon: true },
    { id: "settings", label: "Settings",      icon: "Settings" },
  ];

  if (collapsed) {
    return (
      <aside className="sidebar sidebar-collapsed">
        <div className="sb-rail-logo"><Logo size={20} /></div>
        <div className="sb-rail-divider" />
        {navItems.map(n => {
          const I = Icon[n.icon];
          return (
            <button key={n.id} className="sb-rail-btn" title={n.label}>
              <I size={16} />
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button className="sb-rail-btn" title="Toggle theme"><Icon.Sun size={16} /></button>
      </aside>
    );
  }

  return (
    <aside className="sidebar">
      <div className="sb-head">
        <div className="sb-brand">
          <Logo />
          <div className="col" style={{ gap: 0 }}>
            <div className="sb-brand-name">BuildPilot</div>
            <div className="sb-brand-sub">Local CI/CD · v0.1.0</div>
          </div>
        </div>
        <button className="sb-cmdk" title="Command palette (⌘K)">
          <Icon.Search size={12} />
          <span>Jump to…</span>
          <span className="kbd">⌘K</span>
        </button>
      </div>

      <nav className="sb-nav">
        {navItems.map(n => {
          const I = Icon[n.icon];
          const active = view === n.id;
          return (
            <button key={n.id}
                    className={"sb-nav-item" + (active ? " active" : "") + (n.soon ? " soon" : "")}
                    onClick={() => !n.soon && setView(n.id)}>
              <I size={14} />
              <span className="grow">{n.label}</span>
              {n.count > 0 && <span className="sb-count">{n.count}</span>}
              {n.soon && <span className="sb-soon">soon</span>}
            </button>
          );
        })}
      </nav>

      <div className="sb-section">
        <div className="sb-section-head">
          <span className="micro">Projects</span>
          <span className="sb-section-count">{projects.length}</span>
          <button className="sb-section-add" title="Add project"><Icon.Plus size={12} /></button>
        </div>

        <div className="sb-tree">
          {projects.map(p => {
            const open = openProjectIds.includes(p.id);
            const isCurrent = currentProjectId === p.id;
            return (
              <div key={p.id} className="sb-tree-project">
                <button className={"sb-tree-row" + (isCurrent && view === "projects" ? " active" : "")}
                        onClick={() => { toggleOpen(p.id); setProjectId(p.id); setView("projects"); }}>
                  <Icon.ChevronRight size={11}
                                     style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms", flexShrink: 0, opacity: 0.7 }} />
                  <Icon.Folder size={13} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  <span className="grow truncate">{p.displayName}</span>
                  <span className={"dot dot-" + p.lastBuild.status} title={`Last build: ${p.lastBuild.status}`} />
                </button>
                {open && p.pipelines.map(pl => {
                  const plActive = currentPipelineId === pl.id && view === "pipeline";
                  return (
                    <button key={pl.id}
                            className={"sb-tree-pipeline" + (plActive ? " active" : "")}
                            onClick={() => { setProjectId(p.id); setPipelineId(pl.id); setView("pipeline"); }}>
                      <Icon.GitBranch size={11} style={{ color: "var(--text-faint)", flexShrink: 0 }} />
                      <span className="grow truncate">{pl.name}</span>
                      <span className={"dot dot-" + pl.status} />
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      <div className="sb-foot">
        <div className="sb-foot-row">
          <span className="dot dot-success" />
          <span className="muted" style={{ fontSize: 11 }}>Connected · 127.0.0.1:51731</span>
        </div>
        <button className="sb-foot-shortcut" title="Shortcuts (?)">
          <span className="kbd">?</span>
        </button>
      </div>
    </aside>
  );
}

// ─── Topbar ─────────────────────────────────────────────────────────────────
function Topbar({ view, project, pipeline, buildState, toggleSidebar }) {
  let crumbs = [];
  if (view === "projects" && project) crumbs = [{ label: "Projects", to: "projects" }, { label: project.displayName, mono: false }];
  else if (view === "pipeline" && project && pipeline) crumbs = [
    { label: "Projects", to: "projects" },
    { label: project.displayName, to: "projects" },
    { label: pipeline.name }
  ];
  else if (view === "build") crumbs = [
    { label: project ? project.displayName : "—", to: "projects" },
    { label: pipeline ? pipeline.name : "—", to: "pipeline" },
    { label: "Build #4f7a2b9", mono: true }
  ];
  else crumbs = [{ label: view.charAt(0).toUpperCase() + view.slice(1) }];

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="btn btn-ghost btn-icon btn-sm" onClick={toggleSidebar} title="Toggle sidebar (⌘B)">
          <Icon.ChevronsLeft size={14} />
        </button>
        <div className="crumbs">
          {crumbs.map((c, i) => (
            <React.Fragment key={i}>
              {i > 0 && <Icon.ChevronRight size={11} className="crumb-sep" />}
              <span className={"crumb" + (c.mono ? " mono" : "") + (i === crumbs.length - 1 ? " current" : "")}>
                {c.label}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      <button className="topbar-cmdk">
        <Icon.Command size={12} />
        <span>Jump to project, pipeline, build, host, step…</span>
        <span className="kbd">⌘K</span>
      </button>

      <div className="topbar-right">
        {buildState === "running" && (
          <div className="topbar-builds">
            <span className="dot dot-running" />
            <span>2 builds running</span>
          </div>
        )}
        <button className="btn btn-ghost btn-icon btn-sm" title="Notifications"><Icon.Bell size={14} /></button>
        <div className="topbar-conn" title="SSE connected">
          <span className="dot dot-success" />
        </div>
        <div className="topbar-avatar" title="tomh@local">TH</div>
      </div>
    </header>
  );
}

// ─── Bottom log panel ───────────────────────────────────────────────────────
function BottomLogPanel({ buildState, openBuild, minimized, setMinimized }) {
  const logRef = useRef(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showTs, setShowTs] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [filter, setFilter] = useState("");
  const allLogs = window.BPData.buildLog;

  // Simulated streaming if running
  const [streamCount, setStreamCount] = useState(allLogs.length);
  useEffect(() => {
    if (buildState !== "running") { setStreamCount(allLogs.length); return; }
    setStreamCount(Math.min(28, allLogs.length));
    const t = setInterval(() => {
      setStreamCount(c => Math.min(c + 1, allLogs.length));
    }, 900);
    return () => clearInterval(t);
  }, [buildState, allLogs.length]);

  const visible = useMemo(() => {
    let l = allLogs.slice(0, streamCount);
    if (filter) {
      const f = filter.toLowerCase();
      l = l.filter(e => e.msg.toLowerCase().includes(f) || e.stepType.toLowerCase().includes(f));
    }
    return l;
  }, [allLogs, streamCount, filter]);

  useEffect(() => {
    if (autoScroll && logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [visible.length, autoScroll]);

  if (minimized) {
    const last = allLogs[Math.min(streamCount, allLogs.length) - 1];
    return (
      <div className="logpanel logpanel-min">
        <div className="logpanel-min-inner">
          <span className={"dot dot-" + (buildState === "running" ? "running" : buildState === "failed" ? "failed" : "success")} />
          <span className="mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>build #4f7a2b9</span>
          <span className="grow truncate mono" style={{ fontSize: 11, color: "var(--text-secondary)" }}>{last ? last.msg : "Idle"}</span>
          <button className="btn btn-ghost btn-sm" onClick={() => setMinimized(false)}>
            <Icon.Maximize size={11} /> Expand
          </button>
        </div>
      </div>
    );
  }

  const fmtTs = (ts) => {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    return `${hh}:${mm}:${ss}.${ms}`;
  };

  const levelColor = {
    system: "var(--text-faint)",
    info: "var(--accent)",
    stdout: "var(--text-secondary)",
    stderr: "#fcd34d",
    success: "var(--st-success)",
    failure: "var(--st-failed)",
  };

  return (
    <div className="logpanel">
      <div className="logpanel-head">
        <div className="row gap-3" style={{ flex: 1, minWidth: 0 }}>
          <div className="row gap-2">
            <span className={"pill pill-" + (buildState === "running" ? "running" : buildState === "failed" ? "failed" : buildState === "success" ? "success" : "pending")}>
              {buildState === "running" && <Icon.Loader size={9} className="spin" />}
              {buildState === "success" && <Icon.Check size={9} />}
              {buildState === "failed" && <Icon.X size={9} />}
              {buildState === "running" ? "running" : buildState === "success" ? "succeeded" : buildState === "failed" ? "failed" : "idle"}
            </span>
            <button className="logpanel-meta" onClick={openBuild} title="Open build detail">
              <span className="mono">#4f7a2b9</span>
              <Icon.ArrowUpRight size={10} />
            </button>
            <span className="muted mono" style={{ fontSize: 11 }}>iOS · TestFlight</span>
            <span className="muted" style={{ fontSize: 11 }}>·</span>
            <span className="muted mono" style={{ fontSize: 11 }}>main</span>
          </div>
          <div className="grow" />
          <div className="logpanel-search">
            <Icon.Search size={11} />
            <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter…   ⌘F" />
          </div>
        </div>
        <div className="row gap-1">
          <button className={"logpanel-toggle" + (autoScroll ? " on" : "")} onClick={() => setAutoScroll(a => !a)} title="Auto-scroll">
            <Icon.ArrowRight size={11} style={{ transform: "rotate(90deg)" }} />
          </button>
          <button className={"logpanel-toggle" + (showTs ? " on" : "")} onClick={() => setShowTs(t => !t)} title="Timestamps">
            <Icon.Clock size={11} />
          </button>
          <button className={"logpanel-toggle" + (wrap ? " on" : "")} onClick={() => setWrap(w => !w)} title="Wrap">
            <Icon.CornerDownRight size={11} />
          </button>
          <span className="logpanel-sep" />
          <button className="btn btn-ghost btn-sm" title="Pop out">
            <Icon.ArrowUpRight size={11} />
          </button>
          <button className="btn btn-ghost btn-sm" title="Download .log">
            <Icon.Download size={11} />
          </button>
          {buildState === "running" && (
            <button className="btn btn-danger btn-sm" title="Cancel build">
              <Icon.Square size={10} /> Cancel
            </button>
          )}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setMinimized(true)} title="Minimize">
            <Icon.Minimize size={11} />
          </button>
        </div>
      </div>

      <div className={"logpanel-body" + (wrap ? " wrap" : "")} ref={logRef}>
        {visible.map((e, i) => (
          <div key={i} className={"logline level-" + e.level}>
            {showTs && <span className="log-ts mono">{fmtTs(e.ts)}</span>}
            <span className="log-level mono" style={{ color: levelColor[e.level] }}>
              {e.level === "system" ? "▸" :
               e.level === "info" ? "i" :
               e.level === "stderr" ? "!" :
               e.level === "success" ? "✓" :
               e.level === "failure" ? "✕" : " "}
            </span>
            <span className="log-step mono" style={{ color: "var(--text-faint)" }}>{e.stepType.padEnd(14)}</span>
            <span className={"log-msg mono"} style={{ color: levelColor[e.level] }}>{e.msg}</span>
          </div>
        ))}
        {buildState === "running" && (
          <div className="logline level-info">
            {showTs && <span className="log-ts mono">·</span>}
            <span className="log-level mono" style={{ color: "var(--text-faint)" }}>·</span>
            <span className="log-step mono" style={{ color: "var(--text-faint)" }}>iosArchive    </span>
            <span className="log-msg mono" style={{ color: "var(--text-faint)" }}>
              <span className="log-cursor">▍</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

window.BPShell = { Sidebar, Topbar, BottomLogPanel, Logo };
