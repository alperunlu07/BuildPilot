// pipeline.jsx — Pipeline editor: palette + canvas + property panel
const { useState: useStateE, useEffect: useEffectE, useRef: useRefE, useMemo: useMemoE, useCallback: useCallbackE } = React;

const STATUS_COLOR = {
  success:  "var(--st-success)",
  failed:   "var(--st-failed)",
  running:  "var(--st-running)",
  pending:  "var(--st-pending)",
  skipped:  "var(--st-skipped)",
};

const CAT_COLOR = {
  git: "var(--cat-git)",
  build: "var(--cat-build)",
  unity: "var(--cat-unity)",
  notify: "var(--cat-notify)",
  artifact: "var(--cat-artifact)",
  remote: "var(--cat-remote)",
  "ios-build": "var(--cat-ios-build)",
  "ios-sign": "var(--cat-ios-sign)",
  "ios-dist": "var(--cat-ios-dist)",
  android: "var(--cat-android)",
  steam: "var(--cat-steam)",
};

// ─── Palette ────────────────────────────────────────────────────────────────
function StepPalette() {
  const cats = window.BPData.stepCategories;
  const [openCats, setOpenCats] = useStateE(["git", "ios-build"]);
  const [search, setSearch] = useStateE("");
  const toggle = (id) => setOpenCats(o => o.includes(id) ? o.filter(x => x !== id) : [...o, id]);

  const filteredCats = useMemoE(() => {
    if (!search) return cats;
    const q = search.toLowerCase();
    return cats.map(c => ({
      ...c,
      steps: c.steps.filter(s => s.label.toLowerCase().includes(q) || s.type.toLowerCase().includes(q))
    })).filter(c => c.steps.length > 0);
  }, [search]);

  const recent = ["xcodebuild archive", "Telegram", "Checkout"];

  return (
    <div className="palette">
      <div className="palette-head">
        <div className="micro">Step palette</div>
        <span className="mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>83 types</span>
      </div>
      <div className="palette-search">
        <Icon.Search size={11} />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search steps…" />
      </div>

      <div className="palette-body">
        {!search && (
          <div className="palette-cat">
            <div className="palette-cat-head"><Icon.Clock size={10} /><span>Recently used</span></div>
            {recent.map(r => (
              <div key={r} className="palette-step recent" draggable>
                <span className="palette-step-icon"><Icon.Star size={10} /></span>
                <span className="palette-step-label">{r}</span>
              </div>
            ))}
          </div>
        )}

        {filteredCats.map(c => {
          const open = openCats.includes(c.id) || search;
          const I = Icon[c.icon];
          return (
            <div key={c.id} className="palette-cat">
              <button className="palette-cat-head" onClick={() => toggle(c.id)}>
                <Icon.ChevronRight size={10} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms", opacity: 0.6 }} />
                <span className="palette-cat-swatch" style={{ background: c.color }} />
                <I size={11} style={{ color: c.color }} />
                <span className="grow">{c.label}</span>
                <span className="palette-cat-count">{c.steps.length}</span>
              </button>
              {open && c.steps.map(s => (
                <div key={s.type} className="palette-step" draggable title={s.desc}>
                  <span className="palette-step-icon" style={{ background: c.color + "22", color: c.color }}>
                    {Icon[c.icon] && React.createElement(Icon[c.icon], { size: 9 })}
                  </span>
                  <span className="palette-step-label">{s.label}</span>
                </div>
              ))}
            </div>
          );
        })}

        <div className="palette-cat" style={{ borderTop: "1px dashed var(--border-default)", paddingTop: 8, marginTop: 4 }}>
          <div className="palette-cat-head">
            <Icon.Sparkles size={10} style={{ color: "var(--accent)" }} />
            <span style={{ color: "var(--accent)" }}>Recipes</span>
          </div>
          <div className="palette-step recipe">
            <span className="palette-step-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon.Apple size={9} /></span>
            <span className="palette-step-label">iOS · Sign + upload bundle</span>
            <span className="recipe-meta">5 nodes</span>
          </div>
          <div className="palette-step recipe">
            <span className="palette-step-icon" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}><Icon.Gamepad size={9} /></span>
            <span className="palette-step-label">Steam · upload depot</span>
            <span className="recipe-meta">3 nodes</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Canvas ─────────────────────────────────────────────────────────────────
function PipelineCanvas({ selectedId, setSelectedId, buildState, showValidation, showMinimap }) {
  const nodes = window.BPData.pipelineNodes;
  const edges = window.BPData.pipelineEdges;

  // Override status when buildState changes — fake animation
  const liveNodes = useMemoE(() => {
    if (buildState === "idle") {
      return nodes.map(n => ({ ...n, status: "pending", duration: "—" }));
    }
    if (buildState === "success") {
      return nodes.map(n => ({ ...n, status: n.status === "skipped" ? "skipped" : "success" }));
    }
    if (buildState === "failed") {
      // n5 archive fails, downstream pending, n10 fires
      return nodes.map(n => {
        if (["n1","n2","n3","n4"].includes(n.id)) return { ...n, status: "success" };
        if (n.id === "n5") return { ...n, status: "failed", duration: "1m 38s" };
        if (n.id === "n10") return { ...n, status: "running", duration: "0.2s" };
        return { ...n, status: "skipped" };
      });
    }
    return nodes; // running (as authored)
  }, [nodes, buildState]);

  const nodeById = useMemoE(() => Object.fromEntries(liveNodes.map(n => [n.id, n])), [liveNodes]);

  const dim = useMemoE(() => {
    const maxX = Math.max(...liveNodes.map(n => n.x + n.w)) + 120;
    const maxY = Math.max(...liveNodes.map(n => n.y)) + 240;
    return { w: maxX, h: maxY };
  }, [liveNodes]);

  // Pan + zoom (simple)
  const [pan, setPan] = useStateE({ x: 20, y: 30 });
  const [zoom, setZoom] = useStateE(0.92);
  const panRef = useRefE(null);
  const dragRef = useRefE(null);

  const onMouseDown = (e) => {
    if (e.target.closest('.pn-node') || e.target.closest('.canvas-controls') || e.target.closest('.canvas-minimap')) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  };
  const onMouseMove = (e) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  };
  const onMouseUp = () => { dragRef.current = null; };

  const onWheel = (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom(z => Math.max(0.5, Math.min(1.6, z - e.deltaY * 0.002)));
    } else {
      setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    }
  };

  return (
    <div className="canvas-wrap" onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp} onWheel={onWheel}>
      <div className="canvas-bg" />

      <div className="canvas-stage" ref={panRef} style={{
        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        width: dim.w, height: dim.h
      }}>
        {/* Edges */}
        <svg className="canvas-edges" width={dim.w} height={dim.h}>
          <defs>
            <marker id="arrow-success" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--st-success)" />
            </marker>
            <marker id="arrow-failed" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--st-failed)" />
            </marker>
            <marker id="arrow-cancel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--st-cancel)" />
            </marker>
          </defs>
          {edges.map((e, i) => {
            const from = nodeById[e.from];
            const to = nodeById[e.to];
            if (!from || !to) return null;
            const x1 = from.x + from.w;
            const y1 = from.y + 26;
            const x2 = to.x;
            const y2 = to.y + 26;
            const c1x = x1 + (x2 - x1) * 0.45;
            const c2x = x2 - (x2 - x1) * 0.45;
            const path = `M ${x1},${y1} C ${c1x},${y1} ${c2x},${y2} ${x2},${y2}`;
            const color = e.cond === "success" ? "var(--st-success)" : e.cond === "failure" ? "var(--st-failed)" : "var(--st-cancel)";
            const isActive = (from.status === "success" || from.status === "failed") &&
                              ((e.cond === "success" && from.status === "success") || (e.cond === "failure" && from.status === "failed"));
            const isFlowing = isActive && (to.status === "running" || to.status === "pending");
            return (
              <g key={i}>
                <path d={path} fill="none"
                      stroke={color}
                      strokeWidth={e.cond === "always" ? 1.2 : 1.6}
                      strokeDasharray={isFlowing ? "5 5" : "none"}
                      strokeOpacity={isActive ? 0.95 : 0.35}
                      markerEnd={`url(#arrow-${e.cond === "success" ? "success" : e.cond === "failure" ? "failed" : "cancel"})`}
                      style={isFlowing ? { animation: "edge-flow 0.7s linear infinite" } : null}
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes */}
        {liveNodes.map(n => {
          const sel = selectedId === n.id;
          return <PipelineNode key={n.id} n={n} selected={sel} onSelect={() => setSelectedId(n.id)} buildState={buildState} />;
        })}

        {/* Sticky note example */}
        <div className="canvas-sticky" style={{ left: 80, top: 360, width: 280 }}>
          <div className="row gap-2" style={{ marginBottom: 4 }}>
            <Icon.AlertCircle size={11} style={{ color: "#fcd34d" }} />
            <span className="micro" style={{ color: "#fcd34d" }}>Note</span>
          </div>
          <div style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
            The Unity build and unit tests run in parallel — both must succeed before <span className="mono">xcodebuild archive</span> kicks off on the remote Mac.
          </div>
        </div>
      </div>

      {/* Canvas controls (bottom-left) */}
      <div className="canvas-controls">
        <button title="Zoom in" onClick={() => setZoom(z => Math.min(1.6, z + 0.1))}><Icon.Plus size={12} /></button>
        <button title="Zoom out" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}><span style={{ fontSize: 13, fontWeight: 700, lineHeight: 1 }}>−</span></button>
        <button title="Fit view (f)" onClick={() => { setPan({ x: 20, y: 30 }); setZoom(0.92); }}><Icon.Maximize size={11} /></button>
        <div className="canvas-controls-sep" />
        <button title="Auto layout (l)"><Icon.Activity size={11} /></button>
        <button title="Snap to grid"><Icon.Grid size={11} /></button>
        <div className="canvas-controls-zoom mono">{Math.round(zoom * 100)}%</div>
      </div>

      {/* Validation panel */}
      {showValidation && (
        <div className="canvas-validation">
          <div className="row gap-2" style={{ padding: "8px 10px", borderBottom: "1px solid var(--border-subtle)" }}>
            <Icon.AlertCircle size={12} style={{ color: "var(--st-failed)" }} />
            <span style={{ fontWeight: 500, fontSize: 11.5 }}>2 errors</span>
            <span className="muted" style={{ fontSize: 11.5 }}>· 1 warning</span>
          </div>
          {window.BPData.validation.map((v, i) => (
            <button key={i} className="validation-row" onClick={() => setSelectedId(v.node)}>
              {v.level === "error" ? <Icon.XCircle size={11} style={{ color: "var(--st-failed)", flexShrink: 0 }} />
                                    : <Icon.AlertTriangle size={11} style={{ color: "#fcd34d", flexShrink: 0 }} />}
              <div className="col" style={{ gap: 1, alignItems: "flex-start", minWidth: 0 }}>
                <span className="mono" style={{ fontSize: 10, color: "var(--text-faint)" }}>{v.node}</span>
                <span className="truncate" style={{ fontSize: 11.5 }}>{v.msg}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Minimap */}
      {showMinimap && (
        <div className="canvas-minimap">
          <div className="micro" style={{ padding: "6px 8px 4px" }}>Minimap</div>
          <svg width="180" height="100" viewBox={`0 0 ${dim.w} ${dim.h}`}>
            {liveNodes.map(n => (
              <rect key={n.id} x={n.x} y={n.y} width={n.w} height={52} rx={6}
                    fill={STATUS_COLOR[n.status]} opacity={n.status === "skipped" ? 0.25 : 0.7} />
            ))}
            <rect x={-pan.x / zoom} y={-pan.y / zoom}
                  width={window.innerWidth / zoom * 0.5} height={window.innerHeight / zoom * 0.45}
                  fill="none" stroke="var(--accent)" strokeWidth={6} />
          </svg>
        </div>
      )}
    </div>
  );
}

function PipelineNode({ n, selected, onSelect, buildState }) {
  const catColor = CAT_COLOR[n.category];
  const I = Icon[n.icon] || Icon.Box;
  const statusCls = "node-" + n.status;

  return (
    <div className={"pn-node " + statusCls + (selected ? " selected" : "")}
         style={{ left: n.x, top: n.y, width: n.w }}
         onClick={(e) => { e.stopPropagation(); onSelect(); }}>
      <div className="pn-header">
        <span className="pn-cat-dot" style={{ background: catColor }} />
        <span className="pn-icon" style={{ background: catColor + "22", color: catColor }}>
          <I size={11} />
        </span>
        <span className="pn-label grow truncate">{n.label}</span>
        <span className="pn-handle in" />
        <span className="pn-handle out" />
      </div>
      <div className="pn-footer">
        <span className={"dot dot-" + n.status} />
        <span className="mono pn-status">{n.status}</span>
        <span className="grow" />
        <span className="mono pn-duration">{n.duration}</span>
      </div>
      {n.status === "running" && <div className="pn-running-bar" />}
    </div>
  );
}

// ─── Property panel ─────────────────────────────────────────────────────────
function PropertyPanel({ selectedId, setSelectedId, buildState }) {
  const nodes = window.BPData.pipelineNodes;
  const node = useMemoE(() => {
    if (buildState === "idle") return nodes.find(n => n.id === selectedId);
    return window.BPData.pipelineNodes.find(n => n.id === selectedId);
  }, [selectedId, buildState]);

  const [tab, setTab] = useStateE("properties");
  const [showHost, setShowHost] = useStateE(true);
  const [showAdv, setShowAdv] = useStateE(false);
  const [revealPw, setRevealPw] = useStateE(false);

  if (!node) {
    return (
      <div className="proppanel">
        <div className="proppanel-empty">
          <Icon.Hash size={20} style={{ color: "var(--text-faint)", marginBottom: 8 }} />
          <div style={{ fontWeight: 500 }}>No step selected</div>
          <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>Click a node on the canvas to configure it.</div>
        </div>
      </div>
    );
  }

  const cat = window.BPData.stepCategories.find(c => c.id === node.category);
  const I = Icon[node.icon] || Icon.Box;

  return (
    <div className="proppanel">
      <div className="proppanel-head">
        <div className="row gap-2" style={{ alignItems: "flex-start" }}>
          <span className="proppanel-icon" style={{ background: CAT_COLOR[node.category] + "22", color: CAT_COLOR[node.category] }}>
            <I size={14} />
          </span>
          <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <div className="row gap-2">
              <span style={{ fontWeight: 600, fontSize: 13 }}>{node.label}</span>
              <StatusPill status={node.status === "skipped" ? "skipped" : node.status} animated />
            </div>
            <div className="row gap-2">
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-faint)" }}>{node.type}</span>
              <span className="muted" style={{ fontSize: 10.5 }}>·</span>
              <span className="mono" style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{node.duration}</span>
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelectedId(null)}>
            <Icon.X size={13} />
          </button>
        </div>

        <div className="row gap-1" style={{ marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm" title="Run starting from this step"><Icon.Play size={9} /> Run from here</button>
          <button className="btn btn-secondary btn-sm" title="Save as template"><Icon.Save size={10} /></button>
          <button className="btn btn-secondary btn-sm" title="Duplicate"><Icon.Copy size={10} /></button>
          <span className="grow" />
          <button className="btn btn-danger btn-sm" title="Delete"><Icon.Trash size={10} /></button>
        </div>
      </div>

      <div className="proppanel-tabs">
        {["properties", "logs", "advanced"].map(t => (
          <button key={t} className={"prop-tab" + (tab === t ? " active" : "")} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
            {t === "logs" && <span className="prop-tab-count">142</span>}
          </button>
        ))}
      </div>

      <div className="proppanel-body">
        {tab === "properties" && <PropertiesTab node={node} showHost={showHost} setShowHost={setShowHost} showAdv={showAdv} setShowAdv={setShowAdv} revealPw={revealPw} setRevealPw={setRevealPw} />}
        {tab === "logs" && <NodeLogsTab node={node} />}
        {tab === "advanced" && <AdvancedTab />}
      </div>
    </div>
  );
}

function PropertiesTab({ node, showHost, setShowHost, showAdv, setShowAdv, revealPw, setRevealPw }) {
  // Different field set per node type
  const fields = useMemoE(() => {
    if (node.type === "iosArchive") return [
      { key: "host", label: "SSH host", type: "host", val: "mac-mini-01", required: true, hint: "Remote Mac builder" },
      { key: "workspace", label: "Workspace", type: "text", val: "EchoesAether.xcworkspace", required: true, hint: ".xcworkspace path on the remote builder" },
      { key: "scheme", label: "Scheme", type: "text", val: "EchoesAether", required: true },
      { key: "configuration", label: "Configuration", type: "select", val: "Release", options: ["Debug", "Release"], required: false },
      { key: "archivePath", label: "Archive output path", type: "text", val: "build/EchoesAether.xcarchive", required: false, hint: "Where to write the .xcarchive on the builder" },
      { key: "extraFlags", label: "Extra flags", type: "textarea", val: "-allowProvisioningUpdates\n-quiet", required: false },
    ];
    if (node.type === "telegram") return [
      { key: "botToken", label: "Bot token", type: "password", val: "7239482101:AAEh4G6sV9mP_KFc5pJ1xK4z7Y3wL2N8qK", required: true, encrypted: true, hint: "Encrypted at rest with AES-256-GCM" },
      { key: "chatId", label: "Chat ID", type: "text", val: "-1001923847562", required: true },
      { key: "message", label: "Message template", type: "textarea", val: "✓ Build #{{ build.sha }} succeeded\\nbranch: {{ build.branch }}\\nduration: {{ build.duration }}", required: true, hint: "Mustache variables available: build.*, project.*, pipeline.*" },
      { key: "parseMode", label: "Parse mode", type: "select", val: "Markdown", options: ["Markdown", "HTML", "None"], required: false },
    ];
    return [
      { key: "command", label: "Command", type: "textarea", val: "pnpm test:unit", required: true, hint: "Runs in the project root via /bin/sh -c" },
      { key: "cwd", label: "Working directory", type: "text", val: "${{ project.path }}", required: false },
      { key: "timeout", label: "Timeout (sec)", type: "text", val: "600", required: false },
    ];
  }, [node.type]);

  return (
    <div className="prop-fields">
      {fields.map(f => (
        <Field key={f.key} field={f} revealPw={revealPw} setRevealPw={setRevealPw} />
      ))}

      <CollapseSection label="Resilience" open={showAdv} setOpen={setShowAdv}>
        <ToggleField label="continueOnError" hint="Treat failure as success" val={false} />
        <ToggleField label="Retry policy" val={node.type === "iosArchive"} />
        {node.type === "iosArchive" && (
          <div style={{ paddingLeft: 14, display: "flex", gap: 8 }}>
            <Field field={{ key: "maxRetries", label: "Max retries", type: "text", val: "3" }} />
            <Field field={{ key: "backoffMs", label: "Backoff (ms)", type: "text", val: "2000" }} />
          </div>
        )}
        <ToggleField label="Watchdog" hint="Kill if idle for N seconds" val={false} />
      </CollapseSection>

      <CollapseSection label="AI Auto-Fix" open={false} setOpen={() => {}}>
        <div className="ai-block">
          <div className="row gap-2" style={{ marginBottom: 8 }}>
            <Icon.Sparkles size={12} style={{ color: "var(--accent)" }} />
            <span style={{ fontSize: 11.5, fontWeight: 500 }}>On failure, ask Claude to fix</span>
          </div>
          <Field field={{ key: "tool", label: "Tool", type: "select", val: "claude", options: ["claude", "codex", "aider", "gemini", "custom"] }} />
          <Field field={{ key: "maxRetries", label: "Max retries", type: "text", val: "2" }} />
          <Field field={{ key: "prompt", label: "Custom prompt", type: "textarea", val: "Read the failing xcodebuild output and propose the smallest patch that gets the archive to succeed. Do not change product behaviour.", hint: "Available: {{ logs.tail }}, {{ step.* }}" }} />
        </div>
      </CollapseSection>

      <div className="prop-help">
        <Icon.Info size={11} />
        <span>
          See <a className="prop-help-link" href="#">PIPELINES.md → {node.type}</a> for the full field reference.
        </span>
      </div>
    </div>
  );
}

function Field({ field, revealPw, setRevealPw }) {
  const isPw = field.type === "password";
  return (
    <div className="field">
      <div className="field-label-row">
        <label className="field-label">
          {field.label}
          {field.required && <span style={{ color: "var(--st-failed)", marginLeft: 2 }}>*</span>}
        </label>
        {field.encrypted && (
          <span className="field-enc" title="AES-256-GCM at rest">
            <Icon.Lock size={9} /> encrypted
          </span>
        )}
        {field.hint && <Icon.Info size={10} style={{ color: "var(--text-faint)", marginLeft: "auto" }} title={field.hint} />}
      </div>

      {field.type === "textarea" && (
        <textarea className="field-input mono" defaultValue={field.val} rows={3} />
      )}
      {field.type === "text" && (
        <input className="field-input mono" defaultValue={field.val} />
      )}
      {field.type === "select" && (
        <div className="field-select">
          <span className="mono">{field.val}</span>
          <Icon.ChevronDown size={11} />
        </div>
      )}
      {field.type === "host" && (
        <div className="field-host">
          <span className="dot dot-success" />
          <span className="mono">{field.val}</span>
          <span className="muted mono" style={{ fontSize: 10.5 }}>· macOS 14.5 · Xcode 16.1</span>
          <Icon.ChevronDown size={11} style={{ marginLeft: "auto", opacity: 0.6 }} />
        </div>
      )}
      {isPw && (
        <div className="field-pw">
          <input className="field-input mono" type={revealPw ? "text" : "password"} defaultValue={field.val} />
          <button className="field-pw-toggle" onClick={() => setRevealPw(!revealPw)}>
            {revealPw ? <Icon.EyeOff size={11} /> : <Icon.Eye size={11} />}
          </button>
        </div>
      )}
      {field.hint && (
        <div className="field-hint">{field.hint}</div>
      )}
    </div>
  );
}

function ToggleField({ label, hint, val }) {
  const [v, setV] = useStateE(val);
  return (
    <div className="toggle-field">
      <div className="col" style={{ gap: 2 }}>
        <span style={{ fontSize: 12 }}>{label}</span>
        {hint && <span className="muted" style={{ fontSize: 10.5 }}>{hint}</span>}
      </div>
      <button className={"switch" + (v ? " on" : "")} onClick={() => setV(!v)}>
        <span className="switch-thumb" />
      </button>
    </div>
  );
}

function CollapseSection({ label, open, setOpen, children }) {
  return (
    <div className="prop-section">
      <button className="prop-section-head" onClick={() => setOpen(!open)}>
        <Icon.ChevronRight size={11} style={{ transform: open ? "rotate(90deg)" : "none", transition: "transform 120ms" }} />
        <span className="micro">{label}</span>
      </button>
      {open && <div className="prop-section-body">{children}</div>}
    </div>
  );
}

function NodeLogsTab({ node }) {
  const logs = window.BPData.buildLog.filter(l => l.node === node.id).slice(0, 30);
  return (
    <div className="prop-logs">
      {logs.length === 0 && (
        <div className="muted" style={{ padding: 12, fontSize: 11.5 }}>No log entries for this step in the latest build.</div>
      )}
      {logs.map((l, i) => {
        const fmtTs = (ts) => {
          const d = new Date(ts);
          return `${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}.${String(d.getMilliseconds()).padStart(3,"0")}`;
        };
        return (
          <div key={i} className={"logline level-" + l.level} style={{ padding: "1px 12px" }}>
            <span className="log-ts mono">{fmtTs(l.ts)}</span>
            <span className="log-msg mono" style={{ color: l.level === "stderr" ? "#fcd34d" : l.level === "system" ? "var(--text-faint)" : "var(--text-secondary)" }}>
              {l.msg}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function AdvancedTab() {
  return (
    <div className="prop-fields">
      <div className="muted" style={{ fontSize: 11.5, padding: "4px 0 8px" }}>
        Inputs, outputs and lane assignment.
      </div>
      <Field field={{ key: "lane", label: "Lane", type: "select", val: "build", options: ["build", "test", "deploy"] }} />
      <Field field={{ key: "inputs", label: "Required inputs", type: "textarea", val: "EchoesAether.xcarchive" }} />
      <Field field={{ key: "outputs", label: "Produced outputs", type: "textarea", val: "EchoesAether.ipa\nManifest.plist" }} />
    </div>
  );
}

// ─── Pipeline Editor Screen ─────────────────────────────────────────────────
function PipelineScreen({ project, pipeline, buildState, setBuildState, openBuild, showMinimap, showValidation }) {
  const [selectedId, setSelectedId] = useStateE("n5");
  const [triggersOpen, setTriggersOpen] = useStateE(false);

  return (
    <div className="pipeline-screen">
      {/* Pipeline header (above the 3-col layout) */}
      <div className="pipe-head">
        <div className="row gap-3" style={{ width: "100%" }}>
          <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
            <div className="row gap-2" style={{ alignItems: "center" }}>
              <input className="pipe-name-input" defaultValue={pipeline ? pipeline.name : "iOS · TestFlight"} />
              <span className="pipe-saved">
                <Icon.Check size={9} /> saved
              </span>
            </div>
            <div className="row gap-2" style={{ fontSize: 11, color: "var(--text-muted)" }}>
              <span className="mono">{project ? project.name : "echoes-of-aether"}</span>
              <span>·</span>
              <span>12 steps · 12 edges</span>
              <span>·</span>
              <span>last built 3m ago</span>
            </div>
          </div>
          <div className="row gap-1">
            <button className={"btn btn-secondary btn-sm" + (buildState === "running" ? " active" : "")}
                    onClick={() => setBuildState("idle")}>Idle</button>
            {buildState === "running" ? (
              <button className="btn btn-danger btn-sm" onClick={() => setBuildState("failed")}>
                <Icon.Square size={9} /> Cancel
              </button>
            ) : (
              <button className="btn btn-primary btn-sm" onClick={() => setBuildState("running")}>
                <Icon.Play size={9} /> Run
              </button>
            )}
            <button className="btn btn-secondary btn-sm" onClick={openBuild}>
              <Icon.Activity size={10} /> Latest build
            </button>
            <span className="btn-sep" />
            <button className="btn btn-ghost btn-icon btn-sm" title="Save (⌘S)"><Icon.Save size={11} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" title="View JSON"><Icon.Code size={11} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" title="More"><Icon.MoreHorizontal size={13} /></button>
          </div>
        </div>

        {/* Watch / Triggers strip */}
        <div className="pipe-watch">
          <div className="watch-item">
            <Icon.GitBranch size={11} style={{ color: "var(--accent)" }} />
            <span className="mono">main</span>
            <Icon.ChevronDown size={10} style={{ opacity: 0.6 }} />
          </div>
          <div className="watch-item">
            <Icon.Clock size={11} />
            <span>every 60s</span>
          </div>
          <div className="watch-item">
            <Icon.Zap size={11} style={{ color: "var(--accent)" }} />
            <span>auto-trigger: <span className="mono">pull-and-build</span></span>
          </div>
          <div className="watch-item">
            <Icon.Send size={11} style={{ color: "var(--cat-notify)" }} />
            <span>Telegram approvals on</span>
          </div>
          <div className="watch-item">
            <Icon.RefreshCw size={11} />
            <span>rolling builds</span>
          </div>
          <span className="grow" />
          <button className="watch-triggers-btn" onClick={() => setTriggersOpen(!triggersOpen)}>
            <span className="micro">Triggers</span>
            <Icon.ChevronDown size={10} style={{ transform: triggersOpen ? "rotate(180deg)" : "none", transition: "transform 120ms" }} />
          </button>
        </div>

        {triggersOpen && (
          <div className="pipe-triggers">
            <div className="trig-tabs">
              <button className="trig-tab active">Branch</button>
              <button className="trig-tab">Tag</button>
              <button className="trig-tab">Cron</button>
              <button className="trig-tab">Paths</button>
              <button className="trig-tab">Webhook</button>
              <button className="trig-tab">API</button>
            </div>
            <div className="trig-body">
              <div className="trig-grid">
                <Field field={{ key: "branch", label: "Branch", type: "text", val: "main", hint: "Refs::heads pattern, glob supported" }} />
                <Field field={{ key: "interval", label: "Poll interval (sec)", type: "text", val: "60" }} />
                <Field field={{ key: "autoTrig", label: "Auto-trigger", type: "select", val: "pull-and-build", options: ["off", "ask", "pull", "pull-and-build"] }} />
              </div>
            </div>
          </div>
        )}

        {buildState === "running" && (
          <div className="pipe-progress">
            <div className="pipe-progress-bar" />
          </div>
        )}
      </div>

      {/* 3-col layout */}
      <div className={"pipe-grid" + (selectedId ? "" : " no-prop")}>
        <StepPalette />
        <PipelineCanvas
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          buildState={buildState}
          showValidation={showValidation}
          showMinimap={showMinimap} />
        {selectedId && (
          <PropertyPanel selectedId={selectedId} setSelectedId={setSelectedId} buildState={buildState} />
        )}
      </div>
    </div>
  );
}

window.BPPipeline = { PipelineScreen };
