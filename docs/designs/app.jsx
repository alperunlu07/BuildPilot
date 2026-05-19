// app.jsx — root component, state wiring, tweaks
const { useState: useStateA, useEffect: useEffectA } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#0ea5e9",
  "density": "comfortable",
  "sidebarCollapsed": false,
  "buildState": "running",
  "showValidation": false,
  "showMinimap": true,
  "logPanel": "expanded"
}/*EDITMODE-END*/;

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [view, setView] = useStateA("pipeline"); // projects | pipeline | build | builds | hosts | settings | catalog
  const [projectId, setProjectId] = useStateA("p1");
  const [pipelineId, setPipelineId] = useStateA("pl1");

  // Sync theme + density + accent into root
  useEffectA(() => {
    document.documentElement.setAttribute("data-theme", t.theme);
    document.documentElement.setAttribute("data-density", t.density);
    document.documentElement.style.setProperty("--accent", t.accent);

    // Derive accent variants
    const hexToRgb = (h) => {
      const m = h.replace("#", "");
      const r = parseInt(m.slice(0, 2), 16);
      const g = parseInt(m.slice(2, 4), 16);
      const b = parseInt(m.slice(4, 6), 16);
      return { r, g, b };
    };
    const { r, g, b } = hexToRgb(t.accent);
    document.documentElement.style.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.12)`);
    document.documentElement.style.setProperty("--accent-glow", `rgba(${r}, ${g}, ${b}, 0.22)`);
    // hover = darken 12%
    const darken = (v) => Math.max(0, Math.round(v * 0.88));
    const hv = `rgb(${darken(r)}, ${darken(g)}, ${darken(b)})`;
    document.documentElement.style.setProperty("--accent-hover", hv);
  }, [t.theme, t.density, t.accent]);

  const project = window.BPData.projects.find(p => p.id === projectId);
  const pipeline = project?.pipelines.find(pl => pl.id === pipelineId);

  // Sidebar toggle
  const toggleSidebar = () => setTweak("sidebarCollapsed", !t.sidebarCollapsed);

  return (
    <div className={"app-grid" + (t.sidebarCollapsed ? " sb-collapsed" : "")}>
      <BPShell.Sidebar
        view={view}
        setView={setView}
        currentProjectId={projectId}
        setProjectId={setProjectId}
        currentPipelineId={pipelineId}
        setPipelineId={setPipelineId}
        collapsed={t.sidebarCollapsed}
        buildState={t.buildState} />

      <BPShell.Topbar
        view={view}
        project={project}
        pipeline={pipeline}
        buildState={t.buildState}
        toggleSidebar={toggleSidebar} />

      <main className="main">
        {view === "projects" && (
          <BPProjects.ProjectsScreen
            setView={setView}
            setProjectId={setProjectId}
            setPipelineId={setPipelineId}
            buildState={t.buildState} />
        )}
        {view === "pipeline" && (
          <BPPipeline.PipelineScreen
            project={project}
            pipeline={pipeline}
            buildState={t.buildState}
            setBuildState={(v) => setTweak("buildState", v)}
            openBuild={() => setView("build")}
            showMinimap={t.showMinimap}
            showValidation={t.showValidation} />
        )}
        {view === "build" && (
          <BPBuild.BuildDetailScreen
            buildState={t.buildState}
            project={project}
            pipeline={pipeline}
            setView={setView} />
        )}
        {view === "builds" && (
          <BPBuilds.BuildsScreen
            setView={setView}
            setProjectId={setProjectId}
            setPipelineId={setPipelineId} />
        )}
        {view === "hosts" && <BPHosts.HostsScreen />}
        {view === "settings" && <BPSettings.SettingsScreen />}
        {view === "catalog" && <BPCatalog.CatalogScreen />}
      </main>

      <BPShell.BottomLogPanel
        buildState={t.buildState}
        openBuild={() => setView("build")}
        minimized={t.logPanel === "minimized"}
        setMinimized={(m) => setTweak("logPanel", m ? "minimized" : "expanded")} />

      <TweaksPanel title="Tweaks">
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
                    options={["dark", "light"]}
                    onChange={v => setTweak("theme", v)} />
        <TweakColor label="Accent" value={t.accent}
                    options={["#0ea5e9", "#a78bfa", "#34d399", "#fb923c", "#f43f5e", "#f1f5f9"]}
                    onChange={v => setTweak("accent", v)} />
        <TweakRadio label="Density" value={t.density}
                    options={["compact", "comfortable"]}
                    onChange={v => setTweak("density", v)} />
        <TweakToggle label="Sidebar collapsed" value={t.sidebarCollapsed}
                     onChange={v => setTweak("sidebarCollapsed", v)} />

        <TweakSection label="Build state" />
        <TweakSelect label="Status" value={t.buildState}
                     options={["idle", "running", "success", "failed"]}
                     onChange={v => setTweak("buildState", v)} />

        <TweakSection label="Pipeline canvas" />
        <TweakToggle label="Show validation panel" value={t.showValidation}
                     onChange={v => setTweak("showValidation", v)} />
        <TweakToggle label="Show minimap" value={t.showMinimap}
                     onChange={v => setTweak("showMinimap", v)} />

        <TweakSection label="Log panel" />
        <TweakRadio label="Log panel" value={t.logPanel}
                    options={["expanded", "minimized"]}
                    onChange={v => setTweak("logPanel", v)} />

        <TweakSection label="Jump to screen" />
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <TweakButton label="Projects" onClick={() => setView("projects")} />
          <TweakButton label="Pipeline editor" onClick={() => setView("pipeline")} />
          <TweakButton label="Build detail" onClick={() => setView("build")} />
          <TweakButton label="Builds & Logs" onClick={() => setView("builds")} />
          <TweakButton label="SSH Hosts" onClick={() => setView("hosts")} />
          <TweakButton label="Step Catalog" onClick={() => setView("catalog")} />
          <TweakButton label="Settings" onClick={() => setView("settings")} />
        </div>
      </TweaksPanel>
    </div>
  );
}

function PlaceholderScreen({ view }) {
  const titles = {
    builds: "Builds & Logs",
    hosts: "SSH Hosts",
    settings: "Settings",
    catalog: "Step Catalog",
  };
  return (
    <div className="page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1 className="page-title">{titles[view]}</h1>
          <div className="muted" style={{ fontSize: 12.5 }}>This screen is part of the full spec but isn't in scope for this round.</div>
        </div>
      </div>
      <div className="page-body" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="col" style={{ alignItems: "center", gap: 12, maxWidth: 360, textAlign: "center", padding: 40 }}>
          <Icon.Layers size={32} style={{ color: "var(--text-faint)" }} />
          <div style={{ fontSize: 14, fontWeight: 500 }}>Coming soon</div>
          <div className="muted" style={{ fontSize: 12.5 }}>
            The hero set covers Projects · Pipeline Editor · Build Detail. Use the sidebar or Tweaks → Jump to screen to navigate.
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
