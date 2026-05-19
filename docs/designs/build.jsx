// build.jsx — Build Detail screen
const { useState: useStateB, useMemo: useMemoB } = React;

const STATUS_COLOR_B = {
  success:  "var(--st-success)",
  failed:   "var(--st-failed)",
  running:  "var(--st-running)",
  pending:  "var(--st-pending)",
  skipped:  "var(--st-skipped)",
};

function BuildDetailScreen({ buildState, project, pipeline, setView }) {
  const [tab, setTab] = useStateB("overview");

  const buildStatus = buildState === "idle" ? "pending" : buildState;

  return (
    <div className="build-screen">
      <div className="build-head">
        <div className="row gap-3" style={{ alignItems: "flex-start", padding: "16px 24px 12px" }}>
          <div className="col gap-2" style={{ flex: 1, minWidth: 0 }}>
            <div className="row gap-2">
              <span className={"build-status-large status-" + buildStatus}>
                {buildStatus === "running" && <Icon.Loader size={11} className="spin" />}
                {buildStatus === "success" && <Icon.Check size={11} />}
                {buildStatus === "failed" && <Icon.X size={11} />}
                {buildStatus === "pending" && <Icon.Clock size={11} />}
                {buildStatus}
              </span>
              <h1 className="build-title">{pipeline ? pipeline.name : "iOS · TestFlight"}</h1>
              <span className="build-sha-pill mono">
                <Icon.GitCommit size={9} /> 4f7a2b9
                <Icon.Copy size={9} style={{ opacity: 0.5 }} />
              </span>
            </div>
            <div className="build-meta-row">
              <span className="build-meta"><Icon.Hash size={11} />build #b401</span>
              <span className="build-meta"><Icon.GitBranch size={11} />main</span>
              <span className="build-meta"><Icon.Calendar size={11} />today 14:08:22</span>
              <span className="build-meta"><Icon.Clock size={11} />running · 3m 04s</span>
              <span className="build-meta"><Icon.Send size={11} />triggered by poller</span>
              <span className="build-meta"><Icon.Users size={11} />tomh @ local</span>
            </div>
            <div className="build-commit">
              <span className="muted" style={{ fontSize: 11.5 }}>“Implement new spatial audio mixer + bump UMP target to 17.0”</span>
              <span className="muted" style={{ fontSize: 11 }}>— Tom Harkness, 18 minutes ago</span>
            </div>
          </div>
          <div className="row gap-1">
            {buildStatus === "running" ? (
              <button className="btn btn-danger btn-sm"><Icon.Square size={9} /> Cancel</button>
            ) : (
              <>
                <button className="btn btn-secondary btn-sm"><Icon.RefreshCw size={10} /> Re-run all</button>
                <button className="btn btn-secondary btn-sm"><Icon.RefreshCw size={10} /> Retry from failed</button>
              </>
            )}
            <span className="btn-sep" />
            <button className="btn btn-ghost btn-icon btn-sm" title="Download logs"><Icon.Download size={11} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" title="Share permalink"><Icon.ArrowUpRight size={11} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" title="More"><Icon.MoreHorizontal size={13} /></button>
          </div>
        </div>

        <div className="build-tabs">
          {[
            ["overview",   "Overview"],
            ["logs",       "Logs", "8.2k"],
            ["artifacts",  "Artifacts", "5"],
            ["pipeline",   "Pipeline"],
            ["environment","Environment"],
            ["tests",      "Tests", "211"],
            ["annotations","Annotations", "1"],
          ].map(([k, label, count]) => (
            <button key={k} className={"build-tab" + (tab === k ? " active" : "")} onClick={() => setTab(k)}>
              {label}
              {count && <span className="build-tab-count">{count}</span>}
            </button>
          ))}
        </div>

        {buildStatus === "running" && (
          <div className="pipe-progress">
            <div className="pipe-progress-bar" />
          </div>
        )}
      </div>

      <div className="build-body">
        {tab === "overview" && <OverviewTab buildState={buildState} />}
        {tab === "logs" && <BuildLogsTab buildState={buildState} />}
        {tab === "artifacts" && <ArtifactsTab />}
        {tab === "pipeline" && <PipelineSnapshotTab buildState={buildState} />}
        {tab === "environment" && <EnvironmentTab />}
        {tab === "tests" && <TestsTab />}
        {tab === "annotations" && <AnnotationsTab />}
      </div>
    </div>
  );
}

// ─── Overview tab ──────────────────────────────────────────────────────────
function OverviewTab({ buildState }) {
  const gantt = window.BPData.buildGantt;
  // Derive live status from buildState
  const live = useMemoB(() => {
    if (buildState === "success") {
      return gantt.map(g => ({
        ...g,
        status: g.status === "skipped" ? "skipped" : "success",
        end: g.end ?? (g.start ?? 0) + 8000
      }));
    }
    if (buildState === "failed") {
      return gantt.map(g => {
        if (["g1","g2","g3","g4"].includes(g.id)) return { ...g, status: "success" };
        if (g.id === "g5") return { ...g, status: "failed", end: 280000 };
        return { ...g, status: "skipped" };
      });
    }
    return gantt;
  }, [buildState]);

  const totalDur = useMemoB(() => {
    if (buildState === "running") return 184000;
    if (buildState === "failed") return 280000;
    if (buildState === "success") return 320000;
    return 0;
  }, [buildState]);

  const counts = useMemoB(() => {
    const c = { success: 0, failed: 0, running: 0, pending: 0, skipped: 0 };
    live.forEach(g => { c[g.status] = (c[g.status] || 0) + 1; });
    return c;
  }, [live]);

  return (
    <div className="ov-grid">
      <div className="ov-main">
        <div className="ov-section">
          <div className="ov-section-head">
            <h3>Step timeline</h3>
            <div className="row gap-2 muted" style={{ fontSize: 11 }}>
              <span>{counts.success} succeeded</span>
              <span>·</span>
              {counts.failed > 0 && <><span style={{ color: "var(--st-failed)" }}>{counts.failed} failed</span><span>·</span></>}
              {counts.running > 0 && <><span style={{ color: "var(--st-running)" }}>{counts.running} running</span><span>·</span></>}
              <span>{counts.pending + counts.skipped} pending/skipped</span>
            </div>
          </div>
          <Gantt steps={live} totalDur={totalDur} buildState={buildState} />
        </div>

        <div className="ov-section">
          <div className="ov-section-head">
            <h3>Live tail</h3>
            <span className="muted" style={{ fontSize: 11 }}>last 12 lines from <span className="mono">iosArchive</span></span>
          </div>
          <BuildOverviewLogs />
        </div>
      </div>

      <div className="ov-side">
        <SummaryCards buildState={buildState} totalDur={totalDur} />
        <CommitCard />
        <ArtifactsSummary />
      </div>
    </div>
  );
}

function Gantt({ steps, totalDur, buildState }) {
  // Lane positions for parallel steps (g3 & g4 share a row visually with different bars)
  const maxEnd = Math.max(totalDur, ...steps.map(s => s.end || 0)) || 1;

  return (
    <div className="gantt">
      <div className="gantt-header">
        <div className="gantt-label-col"></div>
        <div className="gantt-tracks">
          {[0, 0.25, 0.5, 0.75, 1.0].map(p => (
            <div key={p} className="gantt-tick" style={{ left: `${p * 100}%` }}>
              <span className="mono">{formatTime(maxEnd * p)}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="gantt-body">
        {steps.map(s => {
          const left = s.start != null ? (s.start / maxEnd) * 100 : 0;
          const width = s.end != null
            ? Math.max(((s.end - (s.start || 0)) / maxEnd) * 100, 0.5)
            : s.status === "running" ? ((maxEnd - (s.start || 0)) / maxEnd) * 100 : 0;
          return (
            <div key={s.id} className="gantt-row">
              <div className="gantt-label-col">
                <span className={"dot dot-" + s.status} />
                <span className="gantt-label-text truncate" title={s.label}>{s.label}</span>
                {s.host && <span className="gantt-host mono">{s.host}</span>}
              </div>
              <div className="gantt-tracks">
                {s.status === "pending" || s.status === "skipped" ? (
                  <div className="gantt-bar gantt-bar-pending" style={{ left: "0%", width: "100%" }}>
                    <span className="gantt-bar-label">{s.status}</span>
                  </div>
                ) : (
                  <div className={"gantt-bar gantt-bar-" + s.status}
                       style={{ left: `${left}%`, width: `${width}%` }}>
                    <span className="gantt-bar-label mono">
                      {s.status === "running" ? "running · live" :
                       s.end != null ? formatDur((s.end - (s.start || 0)) / 1000) :
                       ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatTime(ms) {
  const t = Math.floor(ms / 1000);
  const m = Math.floor(t / 60);
  const s = t % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
const formatDur = window.BPProjects.formatDur;

function BuildOverviewLogs() {
  const logs = window.BPData.buildLog.filter(l => l.node === "n5").slice(-12);
  const fmtTs = (ts) => {
    const d = new Date(ts);
    return `${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`;
  };
  return (
    <div className="ov-logs">
      {logs.map((l, i) => (
        <div key={i} className="logline">
          <span className="log-ts mono">{fmtTs(l.ts)}</span>
          <span className="mono" style={{ color: l.level === "stderr" ? "#fcd34d" : "var(--text-secondary)", fontSize: 11.5 }}>{l.msg}</span>
        </div>
      ))}
      <div className="logline">
        <span className="log-ts mono">·</span>
        <span className="log-cursor mono" style={{ color: "var(--accent)" }}>▍</span>
      </div>
    </div>
  );
}

function SummaryCards({ buildState, totalDur }) {
  return (
    <div className="sum-grid">
      <div className="sum-card">
        <span className="micro">Duration</span>
        <span className="sum-val mono">{formatTime(totalDur)}</span>
        <span className="muted" style={{ fontSize: 10.5 }}>est. total 5m 12s</span>
      </div>
      <div className="sum-card">
        <span className="micro">Log lines</span>
        <span className="sum-val mono">8,247</span>
        <span className="muted" style={{ fontSize: 10.5 }}>3 stderr · 1 warning</span>
      </div>
      <div className="sum-card">
        <span className="micro">Artifacts</span>
        <span className="sum-val mono">5</span>
        <span className="muted" style={{ fontSize: 10.5 }}>142.4 MB total</span>
      </div>
      <div className="sum-card">
        <span className="micro">Builder</span>
        <span className="sum-val" style={{ fontSize: 13 }}>
          <Icon.Server size={11} style={{ marginRight: 4 }} />
          mac-mini-01
        </span>
        <span className="muted mono" style={{ fontSize: 10.5 }}>macOS 14.5 · Xcode 16.1</span>
      </div>
    </div>
  );
}

function CommitCard() {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
        <span className="micro">Commit</span>
        <span className="mono pill">main</span>
      </div>
      <div className="row gap-2" style={{ marginBottom: 6 }}>
        <div className="avatar" style={{ background: "linear-gradient(135deg, #a78bfa, var(--accent))" }}>TH</div>
        <div className="col" style={{ gap: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>Tom Harkness</span>
          <span className="muted mono" style={{ fontSize: 10.5 }}>tom@harkness.dev</span>
        </div>
      </div>
      <div style={{ fontSize: 12, lineHeight: 1.45, marginTop: 8 }}>Implement new spatial audio mixer + bump UMP target to 17.0</div>
      <div className="row gap-2" style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-subtle)" }}>
        <span className="mono pill"><Icon.GitCommit size={9} />4f7a2b9</span>
        <span className="muted mono" style={{ fontSize: 11 }}>+184 −67 · 14 files</span>
      </div>
    </div>
  );
}

function ArtifactsSummary() {
  const arts = [
    { name: "EchoesAether.ipa",         size: "142.4 MB", icon: "Package" },
    { name: "Manifest.plist",           size: "1.2 KB",   icon: "FileText" },
    { name: "build.log",                size: "412 KB",   icon: "FileText" },
    { name: "screenshot-iPhone15.png",  size: "1.8 MB",   icon: "Image" },
    { name: "test-report.xcresult.zip", size: "2.4 MB",   icon: "Bug" },
  ];
  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
        <span className="micro">Artifacts</span>
        <span className="muted mono" style={{ fontSize: 10.5 }}>5 files · 146.6 MB</span>
      </div>
      <div className="col gap-1">
        {arts.map((a, i) => {
          const I = Icon[a.icon];
          return (
            <div key={i} className="art-row">
              <I size={12} style={{ color: "var(--text-muted)" }} />
              <span className="grow truncate mono" style={{ fontSize: 11.5 }}>{a.name}</span>
              <span className="muted mono" style={{ fontSize: 10.5 }}>{a.size}</span>
              <button className="btn btn-ghost btn-icon btn-sm"><Icon.Download size={10} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Other tabs (placeholders that still feel real) ─────────────────────
function BuildLogsTab({ buildState }) {
  return (
    <div className="logs-tab-wrap">
      <div className="logs-tab-toolbar">
        <div className="row gap-1">
          <button className="logpanel-toggle on"><Icon.Filter size={10} /> system</button>
          <button className="logpanel-toggle on"><Icon.Filter size={10} /> info</button>
          <button className="logpanel-toggle on"><Icon.Filter size={10} /> stdout</button>
          <button className="logpanel-toggle on" style={{ color: "#fcd34d", background: "rgba(251,191,36,0.1)" }}><Icon.Filter size={10} /> stderr</button>
          <button className="logpanel-toggle on" style={{ color: "var(--st-success)" }}><Icon.Filter size={10} /> success</button>
        </div>
        <span className="grow" />
        <div className="logpanel-search" style={{ minWidth: 280 }}>
          <Icon.Search size={11} />
          <input placeholder="Search · regex /…/" />
        </div>
        <button className="btn btn-secondary btn-sm"><Icon.AlertCircle size={10} /> Jump to first error</button>
      </div>
      <div className="logs-tab-body">
        {window.BPData.buildLog.map((e, i) => {
          const fmtTs = (ts) => {
            const d = new Date(ts);
            return `${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
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
            <div key={i} className={"logline level-" + e.level}>
              <span className="log-ts mono">{fmtTs(e.ts)}</span>
              <span className="log-level mono" style={{ color: levelColor[e.level] }}>
                {e.level === "system" ? "▸" : e.level === "info" ? "i" : e.level === "stderr" ? "!" : e.level === "success" ? "✓" : " "}
              </span>
              <span className="log-step mono" style={{ color: "var(--text-faint)" }}>{e.stepType.padEnd(14)}</span>
              <span className="log-msg mono" style={{ color: levelColor[e.level] }}>{e.msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ArtifactsTab() {
  const arts = [
    { name: "EchoesAether.ipa",     type: "ipa",       size: "142.4 MB", produced: "Export .ipa" },
    { name: "Manifest.plist",       type: "plist",     size: "1.2 KB",   produced: "Export .ipa" },
    { name: "build.log",            type: "log",       size: "412 KB",   produced: "Build pipeline" },
    { name: "screenshot-iPhone15.png", type: "png",    size: "1.8 MB",   produced: "Screenshots" },
    { name: "test-report.xcresult.zip", type: "xcresult", size: "2.4 MB", produced: "iOS tests" },
  ];
  return (
    <div style={{ padding: "20px 24px" }}>
      <div className="art-grid">
        {arts.map((a, i) => (
          <div key={i} className="card card-interactive art-card">
            <div className="art-card-icon">
              {a.type === "ipa" || a.type === "xcresult" ? <Icon.Package size={20} /> :
                a.type === "png" ? <Icon.Image size={20} /> :
                a.type === "plist" ? <Icon.Code size={20} /> :
                <Icon.FileText size={20} />}
            </div>
            <div className="col" style={{ gap: 3, flex: 1, minWidth: 0 }}>
              <span className="truncate mono" style={{ fontSize: 12, fontWeight: 500 }}>{a.name}</span>
              <span className="muted" style={{ fontSize: 11 }}>{a.size} · from <span className="mono">{a.produced}</span></span>
            </div>
            <div className="row gap-1">
              <button className="btn btn-ghost btn-icon btn-sm"><Icon.Eye size={11} /></button>
              <button className="btn btn-ghost btn-icon btn-sm"><Icon.Copy size={11} /></button>
              <button className="btn btn-ghost btn-icon btn-sm"><Icon.Download size={11} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PipelineSnapshotTab({ buildState }) {
  return (
    <div style={{ padding: 0, height: "100%" }}>
      <div className="ov-section-head" style={{ padding: "16px 24px 8px" }}>
        <h3>Pipeline snapshot · #4f7a2b9</h3>
        <div className="row gap-2 muted" style={{ fontSize: 11 }}>
          <Icon.PlayCircle size={11} /><span>Replay mode</span>
          <span>·</span>
          <span>scrub timeline below to step through</span>
        </div>
      </div>
      <div style={{ height: "calc(100% - 50px)" }}>
        <PipelineCanvasReadOnly buildState={buildState} />
      </div>
    </div>
  );
}

function PipelineCanvasReadOnly({ buildState }) {
  return (
    <div className="canvas-wrap" style={{ height: "100%" }}>
      <div className="canvas-bg" />
      <div className="canvas-stage" style={{ transform: "translate(40px, 30px) scale(0.7)" }}>
        <svg className="canvas-edges" width="1700" height="400">
          <defs>
            <marker id="arrow-success-2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--st-success)" />
            </marker>
          </defs>
          {window.BPData.pipelineEdges.map((e, i) => {
            const nodes = window.BPData.pipelineNodes;
            const from = nodes.find(n => n.id === e.from);
            const to = nodes.find(n => n.id === e.to);
            if (!from || !to) return null;
            const x1 = from.x + from.w; const y1 = from.y + 26;
            const x2 = to.x; const y2 = to.y + 26;
            const c1x = x1 + (x2 - x1) * 0.45;
            const c2x = x2 - (x2 - x1) * 0.45;
            return (
              <path key={i} d={`M ${x1},${y1} C ${c1x},${y1} ${c2x},${y2} ${x2},${y2}`}
                    fill="none" stroke={e.cond === "success" ? "var(--st-success)" : "var(--st-failed)"}
                    strokeWidth="1.4" strokeOpacity="0.5" />
            );
          })}
        </svg>
        {window.BPData.pipelineNodes.map(n => (
          <PipelineNodeMini key={n.id} n={n} buildState={buildState} />
        ))}
      </div>
    </div>
  );
}

function PipelineNodeMini({ n, buildState }) {
  const status = buildState === "success" ? (n.status === "skipped" ? "skipped" : "success") :
                  buildState === "failed" ? (n.id === "n5" ? "failed" : ["n1","n2","n3","n4"].includes(n.id) ? "success" : "skipped") :
                  n.status;
  const CAT = window.BPPipeline ? null : null;
  return (
    <div className={"pn-node node-" + status} style={{ left: n.x, top: n.y, width: n.w, pointerEvents: "none" }}>
      <div className="pn-header">
        <span className="pn-icon" style={{ background: "var(--bg-elevated)" }}>
          {Icon[n.icon] && React.createElement(Icon[n.icon], { size: 11 })}
        </span>
        <span className="pn-label truncate">{n.label}</span>
      </div>
      <div className="pn-footer">
        <span className={"dot dot-" + status} />
        <span className="mono pn-status">{status}</span>
        <span className="grow" />
        <span className="mono pn-duration">{n.duration}</span>
      </div>
    </div>
  );
}

function EnvironmentTab() {
  const envs = [
    { k: "NODE_VERSION", v: "20.10.0" },
    { k: "UNITY_VERSION", v: "2023.3.14f1" },
    { k: "XCODE_VERSION", v: "16.1" },
    { k: "BUILD_ID", v: "b401" },
    { k: "COMMIT_SHA", v: "4f7a2b9c1d3e0a8b" },
    { k: "BRANCH", v: "main" },
    { k: "ASC_API_KEY", v: "****", encrypted: true },
    { k: "STEAM_PASSWORD", v: "****", encrypted: true },
    { k: "TG_BOT_TOKEN", v: "****", encrypted: true },
    { k: "ARTIFACT_DIR", v: "/Users/tomh/.buildpilot/artifacts/b401" },
  ];
  return (
    <div style={{ padding: "20px 24px" }}>
      <div className="env-grid">
        <div>
          <h3 style={{ margin: "0 0 12px" }}>Environment</h3>
          <div className="card env-card">
            <div className="env-card-head"><span className="micro">Variables</span></div>
            {envs.map((e, i) => (
              <div key={i} className="env-row">
                <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{e.k}</span>
                <span className="row gap-2">
                  <span className="mono" style={{ fontSize: 11.5, color: e.encrypted ? "var(--st-success)" : "var(--text-primary)" }}>{e.v}</span>
                  {e.encrypted && <Icon.Lock size={10} style={{ color: "var(--st-success)" }} />}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 style={{ margin: "0 0 12px" }}>System</h3>
          <div className="card env-card">
            <div className="env-card-head"><span className="micro">Runner</span></div>
            <div className="env-row"><span style={{ fontSize: 12 }}>Local server</span><span className="mono" style={{ fontSize: 11.5 }}>macOS 14.5 · arm64</span></div>
            <div className="env-row"><span style={{ fontSize: 12 }}>Node</span><span className="mono" style={{ fontSize: 11.5 }}>20.10.0</span></div>
            <div className="env-row"><span style={{ fontSize: 12 }}>BuildPilot</span><span className="mono" style={{ fontSize: 11.5 }}>v0.1.0</span></div>
          </div>
          <div className="card env-card" style={{ marginTop: 12 }}>
            <div className="env-card-head"><span className="micro">SSH builders used</span></div>
            <div className="env-row">
              <span className="row gap-2"><Icon.Server size={12} /><span style={{ fontSize: 12 }}>mac-mini-01</span></span>
              <span className="mono" style={{ fontSize: 11 }}>macOS 14.5 · Xcode 16.1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TestsTab() {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div className="row gap-3" style={{ marginBottom: 16 }}>
        <div className="test-stat"><span className="test-stat-val">211</span><span className="micro">total</span></div>
        <div className="test-stat" style={{ color: "var(--st-success)" }}><span className="test-stat-val">208</span><span className="micro">passed</span></div>
        <div className="test-stat" style={{ color: "var(--st-failed)" }}><span className="test-stat-val">2</span><span className="micro">failed</span></div>
        <div className="test-stat" style={{ color: "#fcd34d" }}><span className="test-stat-val">1</span><span className="micro">flaky</span></div>
        <div className="test-stat"><span className="test-stat-val mono">46.9s</span><span className="micro">duration</span></div>
      </div>
      <div className="card" style={{ padding: 14 }}>
        <div className="micro" style={{ marginBottom: 8 }}>Failed tests</div>
        {[
          { suite: "Networking/QUICTransport", name: "test_handshake_under_packet_loss", dur: "1.2s", attempts: 3 },
          { suite: "Audio/SpatialMixer", name: "test_doppler_shift_extreme_velocity", dur: "0.4s", attempts: 1 },
        ].map((t, i) => (
          <div key={i} className="test-row">
            <Icon.XCircle size={12} style={{ color: "var(--st-failed)" }} />
            <div className="col" style={{ gap: 1, flex: 1, minWidth: 0 }}>
              <span className="mono" style={{ fontSize: 12 }}>{t.suite}.<span style={{ color: "var(--text-primary)", fontWeight: 500 }}>{t.name}</span></span>
              <span className="muted mono" style={{ fontSize: 10.5 }}>{t.attempts} attempts · {t.dur}</span>
            </div>
            <button className="btn btn-ghost btn-sm">View<Icon.ChevronRight size={10} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnnotationsTab() {
  return (
    <div style={{ padding: "20px 24px" }}>
      <div className="annotation warning">
        <Icon.AlertTriangle size={12} style={{ color: "#fcd34d", flexShrink: 0, marginTop: 2 }} />
        <div className="col" style={{ gap: 4, flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: 500 }}>warning: Building for 'iphoneos', but linking in dylib (libRT.dylib) built for 'iOS-simulator'</span>
          <span className="muted mono" style={{ fontSize: 11 }}>EchoesAether/RTAudio/SpatialMixer.swift:142:8 · ld: linker warning</span>
        </div>
        <button className="btn btn-ghost btn-sm">Open file<Icon.ArrowUpRight size={9} /></button>
      </div>
    </div>
  );
}

window.BPBuild = { BuildDetailScreen };
