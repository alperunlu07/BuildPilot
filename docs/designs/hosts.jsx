// hosts.jsx — SSH Hosts page
const { useState: useStateH, useMemo: useMemoH } = React;

const HOSTS = [
  {
    id: "h1",
    name: "mac-mini-01",
    host: "tomh@mac-mini-01.local",
    port: 22,
    auth: "key",
    keyPath: "~/.ssh/buildpilot_ed25519",
    status: "ok",
    lastPing: Date.now() - 42 * 1000,
    macos: "14.5",
    arch: "arm64",
    xcode: ["16.1", "15.4", "14.3"],
    usedBy: 3,
    builds24h: 18,
    avgLatency: 28,
    description: "Living room Mac mini · M2 16GB",
  },
  {
    id: "h2",
    name: "mac-studio-01",
    host: "ci@mac-studio-01.lan",
    port: 22,
    auth: "key",
    keyPath: "~/.ssh/buildpilot_ed25519",
    status: "ok",
    lastPing: Date.now() - 4 * 60 * 1000,
    macos: "14.5",
    arch: "arm64",
    xcode: ["16.1", "16.0"],
    usedBy: 1,
    builds24h: 4,
    avgLatency: 62,
    description: "Office desk · M2 Ultra 64GB",
  },
  {
    id: "h3",
    name: "windows-rig",
    host: "tomh@192.168.1.42",
    port: 22,
    auth: "password",
    keyPath: null,
    status: "stale",
    lastPing: Date.now() - 6 * 60 * 60 * 1000,
    macos: null,
    arch: "x64",
    xcode: null,
    usedBy: 1,
    builds24h: 0,
    avgLatency: 12,
    description: "Steam build · OpenSSH on Windows 11",
  },
  {
    id: "h4",
    name: "linux-cloud-1",
    host: "ubuntu@build-1.fly.dev",
    port: 22,
    auth: "key",
    keyPath: "~/.ssh/fly_ed25519",
    status: "down",
    lastPing: Date.now() - 4 * 24 * 60 * 60 * 1000,
    macos: null,
    arch: "arm64",
    xcode: null,
    usedBy: 0,
    builds24h: 0,
    avgLatency: null,
    description: "Linux dedicated server overflow",
  },
];

function fmtAgo(ts) {
  const d = Math.floor((Date.now() - ts) / 1000);
  if (d < 60) return d + "s ago";
  if (d < 3600) return Math.floor(d/60) + "m ago";
  if (d < 86400) return Math.floor(d/3600) + "h ago";
  return Math.floor(d/86400) + "d ago";
}

function HostsScreen() {
  const [selected, setSelected] = useStateH(HOSTS[0].id);
  const host = HOSTS.find(h => h.id === selected);

  return (
    <div className="page hosts-page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1 className="page-title">SSH Hosts</h1>
          <div className="muted" style={{ fontSize: 12.5 }}>
            {HOSTS.length} hosts · {HOSTS.filter(h => h.status === "ok").length} healthy · {HOSTS.filter(h => h.status === "down").length} down
          </div>
        </div>
        <div className="row gap-2">
          <button className="btn btn-secondary btn-sm"><Icon.RefreshCw size={11} /> Probe all</button>
          <button className="btn btn-primary btn-sm"><Icon.Plus size={12} /> Add host</button>
        </div>
      </div>

      <div className="hosts-layout">
        <div className="hosts-grid">
          {HOSTS.map(h => (
            <HostCard key={h.id} host={h} selected={selected === h.id} onSelect={() => setSelected(h.id)} />
          ))}
        </div>
        {host && <HostDetail host={host} />}
      </div>
    </div>
  );
}

function HostCard({ host, selected, onSelect }) {
  const statusCls = host.status === "ok" ? "success" : host.status === "stale" ? "warn" : "failed";
  const dotCls = host.status === "ok" ? "success" : host.status === "stale" ? "running" : "failed";
  return (
    <div className={"card card-interactive host-card" + (selected ? " selected" : "")} onClick={onSelect}>
      <div className="host-card-head">
        <div className="host-card-id">
          <Icon.Server size={14} style={{ color: host.status === "ok" ? "var(--accent)" : "var(--text-muted)" }} />
          <div className="col" style={{ gap: 1, minWidth: 0 }}>
            <span className="truncate" style={{ fontSize: 13, fontWeight: 600 }}>{host.name}</span>
            <span className="mono truncate" style={{ fontSize: 11, color: "var(--text-muted)" }}>{host.host}</span>
          </div>
        </div>
        <span className={"pill pill-" + statusCls}>
          <span className={"dot dot-" + dotCls} style={{ width: 5, height: 5 }} />
          {host.status === "ok" ? "online" : host.status === "stale" ? "stale" : "down"}
        </span>
      </div>

      <div className="host-card-caps">
        {host.macos && <span className="pill"><Icon.Apple size={9} /> macOS {host.macos}</span>}
        <span className="pill mono">{host.arch}</span>
        {host.xcode && host.xcode.map(v => (
          <span key={v} className="pill" style={{ fontSize: 10 }}>Xcode {v}</span>
        ))}
        <span className="pill" style={{ borderColor: host.auth === "key" ? "rgba(52, 211, 153, 0.25)" : "rgba(251, 191, 36, 0.25)",
                                          background: host.auth === "key" ? "rgba(52, 211, 153, 0.06)" : "rgba(251, 191, 36, 0.06)",
                                          color: host.auth === "key" ? "var(--st-success)" : "var(--st-running)" }}>
          {host.auth === "key" ? <Icon.Lock size={9} /> : <Icon.Eye size={9} />}
          {host.auth}
        </span>
      </div>

      <div className="host-card-stats">
        <div className="host-stat">
          <span className="micro">Last ping</span>
          <span className="mono" style={{ fontSize: 11.5 }}>{fmtAgo(host.lastPing)}</span>
        </div>
        <div className="host-stat">
          <span className="micro">Latency</span>
          <span className="mono" style={{ fontSize: 11.5 }}>{host.avgLatency != null ? host.avgLatency + "ms" : "—"}</span>
        </div>
        <div className="host-stat">
          <span className="micro">Used by</span>
          <span className="mono" style={{ fontSize: 11.5 }}>{host.usedBy} pipelines</span>
        </div>
        <div className="host-stat">
          <span className="micro">Builds · 24h</span>
          <span className="mono" style={{ fontSize: 11.5 }}>{host.builds24h}</span>
        </div>
      </div>

      <div className="host-card-actions">
        <button className="btn btn-secondary btn-sm" onClick={e => e.stopPropagation()}>
          <Icon.Zap size={10} /> Test connection
        </button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={e => e.stopPropagation()} title="Open terminal"><Icon.Terminal size={11} /></button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={e => e.stopPropagation()} title="More"><Icon.MoreHorizontal size={13} /></button>
      </div>
    </div>
  );
}

function HostDetail({ host }) {
  // Synthesized probe history (24h, 5min buckets)
  const probes = useMemoH(() => {
    const arr = [];
    for (let i = 0; i < 72; i++) {
      const seed = (i * 17 + host.id.charCodeAt(1)) % 100;
      const ok = host.status === "down" ? false : host.status === "stale" ? seed > 40 : seed > 5;
      const latency = ok ? (host.avgLatency || 30) + ((seed - 50) % 20) : null;
      arr.push({ ok, latency });
    }
    return arr;
  }, [host]);

  return (
    <div className="host-detail card">
      <div className="host-detail-head">
        <div className="col" style={{ gap: 4 }}>
          <div className="row gap-2">
            <Icon.Server size={14} style={{ color: "var(--accent)" }} />
            <span style={{ fontWeight: 600, fontSize: 14 }}>{host.name}</span>
          </div>
          <div className="muted" style={{ fontSize: 11.5 }}>{host.description}</div>
        </div>
        <button className="btn btn-ghost btn-icon btn-sm"><Icon.X size={13} /></button>
      </div>

      <div className="host-detail-section">
        <div className="micro">Connection</div>
        <div className="host-detail-grid">
          <KV k="Host" v={host.host} mono />
          <KV k="Port" v={host.port} mono />
          <KV k="Auth" v={host.auth === "key" ? "Public-key" : "Password (encrypted)"} />
          {host.keyPath && <KV k="Identity file" v={host.keyPath} mono />}
        </div>
      </div>

      <div className="host-detail-section">
        <div className="micro">Capabilities (probed 38m ago)</div>
        <div className="host-detail-grid">
          {host.macos && <KV k="macOS" v={host.macos} />}
          <KV k="Arch" v={host.arch} mono />
          {host.xcode && <KV k="Xcode" v={host.xcode.join(", ")} mono />}
          <KV k="Shell" v="/bin/zsh" mono />
          <KV k="Homebrew" v="4.3.21" mono />
        </div>
      </div>

      <div className="host-detail-section">
        <div className="micro">Probe history · last 24h</div>
        <div className="probe-strip">
          {probes.map((p, i) => (
            <div key={i} className="probe-cell"
                 style={{ background: p.ok ? "var(--st-success)" : "var(--st-failed)",
                          opacity: p.ok ? 0.3 + Math.min((p.latency || 30) / 100, 0.7) : 0.6 }}
                 title={p.ok ? `${p.latency}ms` : "failed"} />
          ))}
        </div>
        <div className="row" style={{ justifyContent: "space-between", marginTop: 6 }}>
          <span className="muted mono" style={{ fontSize: 10.5 }}>24h ago</span>
          <span className="muted mono" style={{ fontSize: 10.5 }}>now</span>
        </div>
      </div>

      <div className="host-detail-section">
        <div className="micro">Used by</div>
        <div className="host-uses">
          <div className="host-use">
            <Icon.GitBranch size={11} style={{ color: "var(--text-faint)" }} />
            <span className="grow truncate">iOS · TestFlight</span>
            <span className="muted mono" style={{ fontSize: 11 }}>iosArchive, iosSign</span>
          </div>
          <div className="host-use">
            <Icon.GitBranch size={11} style={{ color: "var(--text-faint)" }} />
            <span className="grow truncate">Cross-platform build matrix</span>
            <span className="muted mono" style={{ fontSize: 11 }}>iosArchive</span>
          </div>
          <div className="host-use">
            <Icon.GitBranch size={11} style={{ color: "var(--text-faint)" }} />
            <span className="grow truncate">App Store Connect submit</span>
            <span className="muted mono" style={{ fontSize: 11 }}>iosASCSubmit</span>
          </div>
        </div>
      </div>

      <div className="host-detail-section">
        <div className="micro">Host key fingerprint</div>
        <div className="host-fp">
          <span className="mono">SHA256:7tH3rL2vF8aBp0jKm9XqY1zN4kVcD6sR8eW2nP5oU+0</span>
          <button className="btn btn-ghost btn-icon btn-sm" title="Copy"><Icon.Copy size={11} /></button>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
          Pinned in <span className="mono">~/.buildpilot/known_hosts.json</span> · added 2 months ago
        </div>
      </div>
    </div>
  );
}

function KV({ k, v, mono }) {
  return (
    <div className="host-kv">
      <span className="micro">{k}</span>
      <span className={mono ? "mono" : ""} style={{ fontSize: 12, color: "var(--text-secondary)" }}>{v}</span>
    </div>
  );
}

window.BPHosts = { HostsScreen };
