// catalog.jsx — Step Catalog (browse all 83 step types)
const { useState: useStateC, useMemo: useMemoC } = React;

function CatalogScreen() {
  const [search, setSearch] = useStateC("");
  const [activeCat, setActiveCat] = useStateC("all");
  const [selectedStep, setSelectedStep] = useStateC(null);

  const cats = window.BPData.stepCategories;
  const allSteps = useMemoC(() => {
    return cats.flatMap(c => c.steps.map(s => ({ ...s, category: c.id, catLabel: c.label, catColor: c.color, catIcon: c.icon })));
  }, [cats]);

  const filtered = useMemoC(() => {
    return allSteps.filter(s => {
      if (activeCat !== "all" && s.category !== activeCat) return false;
      if (search) {
        const q = search.toLowerCase();
        return s.label.toLowerCase().includes(q) || s.type.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allSteps, search, activeCat]);

  return (
    <div className="page catalog-page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1 className="page-title">Step Catalog</h1>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {allSteps.length} step types across {cats.length} categories · drag any step into a pipeline to add it
          </div>
        </div>
        <div className="row gap-2">
          <div className="page-search">
            <Icon.Search size={12} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search steps · name, type, description" />
          </div>
        </div>
      </div>

      <div className="catalog-chips">
        <button className={"cat-chip" + (activeCat === "all" ? " active" : "")} onClick={() => setActiveCat("all")}>
          All <span className="mono">{allSteps.length}</span>
        </button>
        {cats.map(c => (
          <button key={c.id} className={"cat-chip" + (activeCat === c.id ? " active" : "")}
                  style={activeCat === c.id ? { background: c.color + "22", borderColor: c.color, color: "var(--text-primary)" } : {}}
                  onClick={() => setActiveCat(c.id)}>
            <span className="cat-chip-dot" style={{ background: c.color }} />
            {c.label} <span className="mono">{c.steps.length}</span>
          </button>
        ))}
      </div>

      <div className="catalog-layout">
        <div className="catalog-grid">
          {filtered.map(s => {
            const I = Icon[s.catIcon] || Icon.Box;
            const isSelected = selectedStep && selectedStep.type === s.type;
            const usage = (s.type.charCodeAt(0) + s.type.charCodeAt(s.type.length - 1)) % 12;
            return (
              <div key={s.type} className={"catalog-card card card-interactive" + (isSelected ? " selected" : "")}
                   onClick={() => setSelectedStep(s)}
                   style={isSelected ? { borderColor: s.catColor } : {}}>
                <div className="catalog-card-head">
                  <span className="catalog-icon" style={{ background: s.catColor + "22", color: s.catColor }}>
                    <I size={14} />
                  </span>
                  <span className="catalog-cat-pill" style={{ borderColor: s.catColor + "55", color: s.catColor }}>
                    {s.catLabel}
                  </span>
                  <span className="grow" />
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={e => e.stopPropagation()} title="Star"><Icon.Star size={11} /></button>
                </div>
                <div className="col" style={{ gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>step.{s.type}</span>
                </div>
                <p className="catalog-desc">{s.desc}</p>
                <div className="catalog-card-foot">
                  <span className="muted" style={{ fontSize: 11 }}>{usage > 0 ? `Used in ${usage} pipelines` : "Unused"}</span>
                  <button className="btn btn-ghost btn-sm" onClick={e => e.stopPropagation()}>
                    Insert<Icon.ArrowRight size={10} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {selectedStep && (
          <StepDetail step={selectedStep} onClose={() => setSelectedStep(null)} />
        )}
      </div>
    </div>
  );
}

function StepDetail({ step, onClose }) {
  const I = Icon[step.catIcon] || Icon.Box;
  const fields = catalogFieldsFor(step.type);
  const sample = catalogSampleFor(step.type);

  return (
    <div className="catalog-detail card">
      <div className="catalog-detail-head">
        <div className="row gap-3" style={{ alignItems: "flex-start", flex: 1 }}>
          <span className="catalog-icon" style={{ background: step.catColor + "22", color: step.catColor, width: 32, height: 32 }}>
            <I size={16} />
          </span>
          <div className="col" style={{ gap: 4, flex: 1 }}>
            <div className="row gap-2">
              <span style={{ fontSize: 15, fontWeight: 600 }}>{step.label}</span>
              <span className="catalog-cat-pill" style={{ borderColor: step.catColor + "55", color: step.catColor }}>
                {step.catLabel}
              </span>
            </div>
            <span className="mono" style={{ fontSize: 11.5, color: "var(--text-faint)" }}>step.{step.type}</span>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, lineHeight: 1.5, color: "var(--text-secondary)" }}>{step.desc}</p>
          </div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><Icon.X size={13} /></button>
      </div>

      <div className="catalog-detail-section">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="micro">Fields</span>
          <span className="muted mono" style={{ fontSize: 10.5 }}>{fields.length} fields</span>
        </div>
        <div className="settings-table">
          <div className="settings-table-head">
            <div style={{ flex: 1 }}>Field</div>
            <div style={{ flex: "0 0 100px" }}>Type</div>
            <div style={{ flex: "0 0 80px" }}>Required</div>
            <div style={{ flex: "0 0 100px" }}>Encrypted</div>
          </div>
          {fields.map(f => (
            <div key={f.key} className="settings-table-row">
              <div style={{ flex: 1 }}>
                <div className="col" style={{ gap: 1 }}>
                  <span className="mono" style={{ fontSize: 11.5 }}>{f.key}</span>
                  <span className="muted" style={{ fontSize: 11 }}>{f.hint}</span>
                </div>
              </div>
              <div style={{ flex: "0 0 100px" }}>
                <span className="pill mono" style={{ fontSize: 10 }}>{f.type}</span>
              </div>
              <div style={{ flex: "0 0 80px" }}>
                {f.required ? <span className="pill pill-failed" style={{ fontSize: 10 }}>required</span>
                              : <span className="muted" style={{ fontSize: 11 }}>—</span>}
              </div>
              <div style={{ flex: "0 0 100px" }}>
                {f.encrypted ? <span className="pill pill-success" style={{ fontSize: 10 }}><Icon.Lock size={9} /> enc:1:</span>
                              : <span className="muted" style={{ fontSize: 11 }}>—</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="catalog-detail-section">
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
          <span className="micro">Sample JSON</span>
          <button className="btn btn-ghost btn-sm"><Icon.Copy size={10} /> Copy</button>
        </div>
        <pre className="settings-code">{JSON.stringify(sample, null, 2)}</pre>
      </div>

      <div className="catalog-detail-foot">
        <span className="muted" style={{ fontSize: 11.5 }}>
          See <a className="prop-help-link" href="#">PIPELINES.md → {step.type}</a> for the full reference.
        </span>
        <span className="grow" />
        <button className="btn btn-secondary btn-sm"><Icon.Star size={11} /> Favorite</button>
        <button className="btn btn-primary btn-sm">Insert into pipeline<Icon.ArrowRight size={10} /></button>
      </div>
    </div>
  );
}

function catalogFieldsFor(type) {
  const base = {
    gitCheckout: [
      { key: "branch", type: "text", required: true, hint: "Branch name or sha", encrypted: false },
      { key: "depth", type: "number", required: false, hint: "Shallow clone depth", encrypted: false },
    ],
    gitPull: [
      { key: "remote", type: "text", required: false, hint: "Remote name (default: origin)", encrypted: false },
      { key: "fastForwardOnly", type: "boolean", required: false, hint: "Refuse merge commits", encrypted: false },
    ],
    iosArchive: [
      { key: "host", type: "host", required: true, hint: "SSH host with Xcode", encrypted: false },
      { key: "workspace", type: "text", required: true, hint: ".xcworkspace path on the builder", encrypted: false },
      { key: "scheme", type: "text", required: true, hint: "Xcode scheme name", encrypted: false },
      { key: "configuration", type: "select", required: false, hint: "Debug | Release", encrypted: false },
      { key: "archivePath", type: "text", required: false, hint: "Output .xcarchive path", encrypted: false },
      { key: "extraFlags", type: "textarea", required: false, hint: "Additional xcodebuild flags", encrypted: false },
    ],
    telegram: [
      { key: "botToken", type: "password", required: true, hint: "From @BotFather", encrypted: true },
      { key: "chatId", type: "text", required: true, hint: "Group or channel ID", encrypted: false },
      { key: "message", type: "textarea", required: true, hint: "Mustache template with {{ build.* }} vars", encrypted: false },
      { key: "parseMode", type: "select", required: false, hint: "Markdown | HTML | None", encrypted: false },
    ],
    shell: [
      { key: "command", type: "textarea", required: true, hint: "Run via /bin/sh -c", encrypted: false },
      { key: "cwd", type: "text", required: false, hint: "Working directory", encrypted: false },
      { key: "timeout", type: "number", required: false, hint: "Kill after N seconds", encrypted: false },
    ],
    s3Upload: [
      { key: "bucket", type: "text", required: true, hint: "S3 bucket name", encrypted: false },
      { key: "key", type: "text", required: true, hint: "Object key (supports vars)", encrypted: false },
      { key: "localPath", type: "text", required: true, hint: "File to upload", encrypted: false },
      { key: "accessKeyId", type: "text", required: true, hint: "AWS access key", encrypted: false },
      { key: "secretAccessKey", type: "password", required: true, hint: "AWS secret", encrypted: true },
      { key: "region", type: "select", required: false, hint: "AWS region", encrypted: false },
    ],
  };
  return base[type] || [
    { key: "param", type: "text", required: true, hint: "Primary input", encrypted: false },
    { key: "timeout", type: "number", required: false, hint: "Kill after N seconds", encrypted: false },
  ];
}

function catalogSampleFor(type) {
  const samples = {
    iosArchive: { type: "iosArchive", host: "mac-mini-01", workspace: "EchoesAether.xcworkspace", scheme: "EchoesAether", configuration: "Release", archivePath: "build/EchoesAether.xcarchive" },
    telegram: { type: "telegram", botToken: "enc:1:…", chatId: "-1001923847562", message: "✓ Build #{{ build.sha }} succeeded", parseMode: "Markdown" },
    shell: { type: "shell", command: "pnpm test:unit", cwd: "${{ project.path }}", timeout: 600 },
    gitCheckout: { type: "gitCheckout", branch: "main", depth: 1 },
    gitPull: { type: "gitPull", remote: "origin", fastForwardOnly: true },
    s3Upload: { type: "s3Upload", bucket: "echoes-builds", key: "builds/{{ build.sha }}/EchoesAether.ipa", localPath: "build/EchoesAether.ipa", accessKeyId: "AKIA…", secretAccessKey: "enc:1:…", region: "us-east-1" },
  };
  return samples[type] || { type, param: "value" };
}

window.BPCatalog = { CatalogScreen };
