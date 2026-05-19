// settings.jsx — Settings page (multi-section)
const { useState: useStateS } = React;

const SETTINGS_SECTIONS = [
  { id: "general",   label: "General",       icon: "Settings" },
  { id: "security",  label: "Security",      icon: "Lock" },
  { id: "notify",    label: "Notifications", icon: "Bell" },
  { id: "telegram",  label: "Telegram",      icon: "Send" },
  { id: "webhooks",  label: "Webhooks",      icon: "Zap" },
  { id: "ai",        label: "AI Integrations", icon: "Sparkles" },
  { id: "retention", label: "Retention",     icon: "Database" },
  { id: "lanes",     label: "Lanes & Concurrency", icon: "Layers" },
  { id: "vault",     label: "File Vault",    icon: "Lock", soon: true },
  { id: "access",    label: "Users & Access", icon: "Users", soon: true },
  { id: "about",     label: "About",         icon: "Info" },
];

function SettingsScreen() {
  const [section, setSection] = useStateS("general");

  return (
    <div className="page settings-page">
      <div className="page-head">
        <div className="col" style={{ gap: 4 }}>
          <h1 className="page-title">Settings</h1>
          <div className="muted" style={{ fontSize: 12.5 }}>
            Configure BuildPilot · stored in <span className="mono">~/.buildpilot/config.json</span>
          </div>
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          {SETTINGS_SECTIONS.map(s => {
            const I = Icon[s.icon];
            return (
              <button key={s.id}
                      className={"settings-nav-item" + (section === s.id ? " active" : "") + (s.soon ? " soon" : "")}
                      onClick={() => !s.soon && setSection(s.id)}>
                <I size={13} />
                <span className="grow">{s.label}</span>
                {s.soon && <span className="sb-soon">soon</span>}
              </button>
            );
          })}
        </nav>

        <div className="settings-content">
          {section === "general"   && <GeneralSection />}
          {section === "security"  && <SecuritySection />}
          {section === "notify"    && <NotificationsSection />}
          {section === "telegram"  && <TelegramSection />}
          {section === "webhooks"  && <WebhooksSection />}
          {section === "ai"        && <AISection />}
          {section === "retention" && <RetentionSection />}
          {section === "lanes"     && <LanesSection />}
          {section === "about"     && <AboutSection />}
        </div>
      </div>
    </div>
  );
}

function SettingsGroup({ title, desc, children }) {
  return (
    <div className="settings-group">
      <div className="settings-group-head">
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      <div className="settings-group-body">{children}</div>
    </div>
  );
}

function SettingsRow({ label, hint, control, danger }) {
  return (
    <div className={"settings-row" + (danger ? " danger" : "")}>
      <div className="col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>{label}</span>
        {hint && <span className="muted" style={{ fontSize: 11.5, lineHeight: 1.45 }}>{hint}</span>}
      </div>
      <div style={{ flexShrink: 0 }}>{control}</div>
    </div>
  );
}

function Switch({ value, onChange }) {
  return (
    <button className={"switch" + (value ? " on" : "")} onClick={() => onChange && onChange(!value)}>
      <span className="switch-thumb" />
    </button>
  );
}

function InlineInput({ value, mono, w = 200 }) {
  return <input className="field-input" defaultValue={value} style={{ width: w, fontFamily: mono ? "var(--font-mono)" : undefined }} />;
}

function InlineSelect({ value, options, w = 180 }) {
  return (
    <div className="field-select" style={{ width: w }}>
      <span className="mono">{value}</span>
      <Icon.ChevronDown size={11} />
    </div>
  );
}

// Sections
function GeneralSection() {
  const [bindHost, setBindHost] = useStateS("127.0.0.1");
  return (
    <>
      <SettingsGroup title="Server" desc="Process bound to your machine. No traffic leaves the host.">
        <SettingsRow label="Bind host" hint="Use 0.0.0.0 only behind Tailscale or a trusted LAN."
                     control={<InlineSelect value={bindHost} options={["127.0.0.1", "0.0.0.0"]} w={140} />} />
        {bindHost === "0.0.0.0" && (
          <div className="settings-banner danger">
            <Icon.AlertTriangle size={13} />
            <div className="col" style={{ gap: 2, flex: 1 }}>
              <span style={{ fontWeight: 500, fontSize: 12.5 }}>BuildPilot has no authentication yet.</span>
              <span className="muted" style={{ fontSize: 11.5 }}>Binding to 0.0.0.0 exposes the API to your entire network. LAN auth lands in Phase 2.6.B.</span>
            </div>
          </div>
        )}
        <SettingsRow label="Server port" hint="API server (Fastify)"
                     control={<InlineInput value="51731" mono w={100} />} />
        <SettingsRow label="Web port" hint="Vite-served SPA"
                     control={<InlineInput value="51732" mono w={100} />} />
        <SettingsRow label="Default poll interval" hint="Used for new pipelines that don't override"
                     control={<InlineInput value="60" mono w={100} />} />
      </SettingsGroup>

      <SettingsGroup title="Paths" desc="Where BuildPilot stores its data on your machine.">
        <SettingsRow label="Database" control={
          <div className="row gap-2">
            <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>~/.buildpilot/buildpilot.db</span>
            <button className="btn btn-ghost btn-icon btn-sm" title="Copy"><Icon.Copy size={11} /></button>
            <button className="btn btn-ghost btn-icon btn-sm" title="Open in Finder"><Icon.FolderOpen size={11} /></button>
          </div>
        } />
        <SettingsRow label="Artifacts" control={
          <div className="row gap-2">
            <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>~/.buildpilot/artifacts</span>
            <span className="muted mono" style={{ fontSize: 11 }}>(4.2 GB)</span>
            <button className="btn btn-ghost btn-icon btn-sm" title="Open"><Icon.FolderOpen size={11} /></button>
          </div>
        } />
        <SettingsRow label="Logs" control={
          <div className="row gap-2">
            <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>~/.buildpilot/logs</span>
            <span className="muted mono" style={{ fontSize: 11 }}>(184 MB)</span>
            <button className="btn btn-ghost btn-icon btn-sm" title="Open"><Icon.FolderOpen size={11} /></button>
          </div>
        } />
      </SettingsGroup>

      <SettingsGroup title="Appearance">
        <SettingsRow label="Theme" hint="Drives the entire UI palette"
                     control={<InlineSelect value="System" options={["Dark", "Light", "System"]} w={140} />} />
        <SettingsRow label="Density" hint="Comfortable: 32px rows. Compact: 28px rows."
                     control={<InlineSelect value="Comfortable" options={["Comfortable", "Compact"]} w={140} />} />
      </SettingsGroup>
    </>
  );
}

function SecuritySection() {
  return (
    <>
      <SettingsGroup title="Master key" desc="Encrypts all sensitive fields with AES-256-GCM at rest.">
        <SettingsRow label="Master key path" hint="Never commit · loaded into memory at startup"
                     control={
                       <div className="row gap-2">
                         <span className="mono" style={{ fontSize: 11.5 }}>~/.buildpilot/master.key</span>
                         <button className="btn btn-secondary btn-sm"><Icon.Eye size={10} /> Reveal</button>
                       </div>
                     } />
        <SettingsRow label="Rotate master key" hint="Re-encrypts every sensitive field. Destructive — old key becomes unusable."
                     control={<button className="btn btn-danger btn-sm">Rotate…</button>}
                     danger />
      </SettingsGroup>

      <SettingsGroup title="Encrypted fields" desc="All fields marked sensitive are stored with the enc:1: envelope.">
        <div className="settings-table">
          <div className="settings-table-head">
            <div style={{ flex: 1 }}>Field</div>
            <div style={{ flex: "0 0 200px" }}>Step types</div>
            <div style={{ flex: "0 0 100px" }}>Status</div>
          </div>
          {[
            { f: "botToken", t: "telegram, telegramApproval" },
            { f: "apiKey", t: "iosASCSubmit, webhook" },
            { f: "p12Password", t: "iosSign, iosImportCerts" },
            { f: "steamPassword", t: "steamcmdLogin, steamcmdUpload" },
            { f: "sshPassword", t: "sshRun, sshUpload" },
            { f: "playJsonKey", t: "playUpload" },
            { f: "webhookSecret", t: "webhook · GitHub/GitLab" },
          ].map(r => (
            <div key={r.f} className="settings-table-row">
              <div style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 11.5 }}>{r.f}</div>
              <div style={{ flex: "0 0 200px", fontSize: 11.5, color: "var(--text-muted)" }}>{r.t}</div>
              <div style={{ flex: "0 0 100px" }}>
                <span className="pill pill-success" style={{ fontSize: 10 }}><Icon.Lock size={9} /> enc:1:</span>
              </div>
            </div>
          ))}
        </div>
      </SettingsGroup>

      <SettingsGroup title="Migration log" desc="Plaintext → encrypted migrations applied on startup.">
        <div className="card env-card" style={{ background: "var(--bg-base)" }}>
          {[
            { ts: "2026-04-18 14:08", msg: "Migrated 12 botToken values to enc:1:" },
            { ts: "2026-04-18 14:08", msg: "Migrated 4 p12Password values to enc:1:" },
            { ts: "2026-04-18 14:08", msg: "Migrated 8 sshPassword values to enc:1:" },
          ].map((e, i) => (
            <div key={i} className="env-row" style={{ padding: "6px 14px" }}>
              <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>{e.ts}</span>
              <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{e.msg}</span>
            </div>
          ))}
        </div>
      </SettingsGroup>
    </>
  );
}

function NotificationsSection() {
  return (
    <>
      <SettingsGroup title="Native notifications" desc="Browser notifications for build events.">
        <SettingsRow label="Enable browser notifications" hint="Requires permission grant"
                     control={<Switch value={true} />} />
        <SettingsRow label="Sound on build complete" control={<Switch value={true} />} />
        <SettingsRow label="Sound on build failure" control={<Switch value={true} />} />
      </SettingsGroup>

      <SettingsGroup title="Quiet hours" desc="Suppress sounds outside these hours. Toasts still appear.">
        <SettingsRow label="Enable quiet hours" control={<Switch value={false} />} />
        <SettingsRow label="From" control={<InlineInput value="22:00" mono w={100} />} />
        <SettingsRow label="To" control={<InlineInput value="08:00" mono w={100} />} />
      </SettingsGroup>

      <SettingsGroup title="Web push" desc="Push notifications via service worker. Useful on phones (PWA).">
        <SettingsRow label="Enable web push" hint="Coming in Phase 2.6"
                     control={<button className="btn btn-secondary btn-sm" disabled>Install service worker</button>} />
      </SettingsGroup>
    </>
  );
}

function TelegramSection() {
  return (
    <SettingsGroup title="Telegram bot" desc="Send build notifications and approval prompts via Telegram.">
      <SettingsRow label="Bot token" hint="From @BotFather · stored encrypted at rest"
                   control={
                     <div className="row gap-2">
                       <input className="field-input mono" type="password" defaultValue="7239482101:AAEh4G6sV9mP_KFc5pJ1xK4z7Y3wL2N8qK" style={{ width: 280 }} />
                       <button className="btn btn-ghost btn-icon btn-sm"><Icon.Eye size={11} /></button>
                     </div>
                   } />
      <SettingsRow label="Chat ID" hint="Group or channel ID. Use the /getid command on @userinfobot."
                   control={<InlineInput value="-1001923847562" mono w={200} />} />
      <SettingsRow label="Parse mode"
                   control={<InlineSelect value="Markdown" options={["Markdown", "HTML", "None"]} w={140} />} />
      <SettingsRow label="Send test message" hint="Posts a hello-world to the configured chat"
                   control={<button className="btn btn-secondary btn-sm"><Icon.Send size={10} /> Send</button>} />
    </SettingsGroup>
  );
}

function WebhooksSection() {
  return (
    <>
      <SettingsGroup title="Inbound webhooks" desc="GitHub, GitLab, Gitea can hit these to trigger pipelines.">
        <SettingsRow label="GitHub" hint={<>Set <span className="mono">BUILDPILOT_GITHUB_SECRET</span> in your env</>}
                     control={
                       <div className="row gap-2">
                         <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>POST /api/webhooks/github/:id</span>
                         <button className="btn btn-ghost btn-icon btn-sm"><Icon.Copy size={11} /></button>
                       </div>
                     } />
        <SettingsRow label="GitLab" hint="Set BUILDPILOT_GITLAB_SECRET in your env"
                     control={
                       <div className="row gap-2">
                         <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>POST /api/webhooks/gitlab/:id</span>
                         <button className="btn btn-ghost btn-icon btn-sm"><Icon.Copy size={11} /></button>
                       </div>
                     } />
        <SettingsRow label="Generic API" hint="Token-authenticated trigger from any tool"
                     control={
                       <div className="row gap-2">
                         <span className="mono" style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>POST /api/triggers/:id?token=…</span>
                         <button className="btn btn-ghost btn-icon btn-sm"><Icon.Copy size={11} /></button>
                       </div>
                     } />
      </SettingsGroup>

      <SettingsGroup title=".env example" desc="Add these to your shell before launching BuildPilot.">
        <pre className="settings-code">{`# BuildPilot webhook secrets
export BUILDPILOT_GITHUB_SECRET="$(openssl rand -hex 32)"
export BUILDPILOT_GITLAB_SECRET="$(openssl rand -hex 32)"
export BUILDPILOT_TRIGGER_TOKEN_my_pipeline="$(openssl rand -hex 32)"`}</pre>
      </SettingsGroup>
    </>
  );
}

function AISection() {
  return (
    <SettingsGroup title="AI tools" desc="Configure the CLIs invoked by the aiPrompt and AI Auto-Fix steps.">
      {[
        { tool: "claude",  path: "/opt/homebrew/bin/claude", v: "0.4.21", model: "claude-sonnet-4-5" },
        { tool: "codex",   path: "/opt/homebrew/bin/codex",  v: "0.6.0",  model: "gpt-5-codex" },
        { tool: "aider",   path: "/opt/homebrew/bin/aider",  v: "0.59.3", model: "claude-sonnet-4-5" },
        { tool: "gemini",  path: "—", v: "—", model: "—", missing: true },
      ].map(t => (
        <div key={t.tool} className="ai-tool-row">
          <span className="row gap-2" style={{ flex: "0 0 100px" }}>
            <Icon.Sparkles size={11} style={{ color: t.missing ? "var(--text-faint)" : "var(--accent)" }} />
            <span className="mono" style={{ fontSize: 12, fontWeight: 500, color: t.missing ? "var(--text-faint)" : "var(--text-primary)" }}>{t.tool}</span>
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span className="mono truncate" style={{ fontSize: 11, color: t.missing ? "var(--text-faint)" : "var(--text-muted)" }}>{t.path}</span>
          </span>
          <span style={{ flex: "0 0 80px", fontSize: 11 }} className="mono muted">{t.v}</span>
          <span style={{ flex: "0 0 180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="mono muted">{t.model}</span>
          <button className={"btn btn-sm " + (t.missing ? "btn-secondary" : "btn-ghost")}>
            {t.missing ? <>Configure</> : <><Icon.Zap size={10} /> Test</>}
          </button>
        </div>
      ))}
    </SettingsGroup>
  );
}

function RetentionSection() {
  return (
    <SettingsGroup title="Retention" desc="Old data is pruned on a daily cron. 0 = keep forever.">
      <SettingsRow label="Builds" hint="Build metadata + step records (SQLite)"
                   control={<div className="row gap-2"><InlineInput value="90" mono w={80} /><span className="muted" style={{ fontSize: 11.5 }}>days</span></div>} />
      <SettingsRow label="Artifacts" hint="Files in ~/.buildpilot/artifacts"
                   control={<div className="row gap-2"><InlineInput value="30" mono w={80} /><span className="muted" style={{ fontSize: 11.5 }}>days</span></div>} />
      <SettingsRow label="Logs" hint="JSONL log files in ~/.buildpilot/logs"
                   control={<div className="row gap-2"><InlineInput value="14" mono w={80} /><span className="muted" style={{ fontSize: 11.5 }}>days</span></div>} />
      <SettingsRow label="Successful builds only" hint="Prune failed builds more aggressively"
                   control={<Switch value={false} />} />
    </SettingsGroup>
  );
}

function LanesSection() {
  return (
    <SettingsGroup title="Lanes" desc="Pin steps to a lane and bound parallelism per lane. Steps run concurrently if their lane has capacity.">
      <div className="settings-table">
        <div className="settings-table-head">
          <div style={{ flex: 1 }}>Lane</div>
          <div style={{ flex: "0 0 140px" }}>Max concurrency</div>
          <div style={{ flex: "0 0 140px" }}>Active now</div>
          <div style={{ flex: "0 0 100px", textAlign: "right" }}></div>
        </div>
        {[
          { name: "build", cap: 2, active: 2 },
          { name: "test", cap: 4, active: 1 },
          { name: "deploy", cap: 1, active: 0 },
          { name: "mac-builder", cap: 1, active: 1, note: "host-pinned" },
        ].map(l => (
          <div key={l.name} className="settings-table-row">
            <div style={{ flex: 1 }} className="row gap-2">
              <Icon.Layers size={11} style={{ color: "var(--text-faint)" }} />
              <span className="mono" style={{ fontSize: 12 }}>{l.name}</span>
              {l.note && <span className="pill" style={{ fontSize: 10 }}>{l.note}</span>}
            </div>
            <div style={{ flex: "0 0 140px" }}><InlineInput value={String(l.cap)} mono w={70} /></div>
            <div style={{ flex: "0 0 140px" }} className="mono">
              <span style={{ color: l.active === l.cap ? "var(--st-running)" : "var(--text-secondary)", fontSize: 12 }}>
                {l.active} / {l.cap}
              </span>
            </div>
            <div style={{ flex: "0 0 100px", textAlign: "right" }}>
              <button className="btn btn-ghost btn-icon btn-sm"><Icon.Trash size={10} /></button>
            </div>
          </div>
        ))}
      </div>
      <button className="btn btn-secondary btn-sm" style={{ marginTop: 12 }}><Icon.Plus size={11} /> New lane</button>
    </SettingsGroup>
  );
}

function AboutSection() {
  return (
    <>
      <SettingsGroup title="BuildPilot" desc="Local-first CI/CD for cross-platform builders.">
        <SettingsRow label="Version" control={<span className="mono" style={{ fontSize: 12 }}>0.1.0 (commit f7b3e2a)</span>} />
        <SettingsRow label="Node runtime" control={<span className="mono" style={{ fontSize: 12 }}>v20.10.0</span>} />
        <SettingsRow label="Database" control={<span className="mono" style={{ fontSize: 12 }}>SQLite 3.46.0 (better-sqlite3)</span>} />
        <SettingsRow label="License" control={<span style={{ fontSize: 12 }}>Apache-2.0</span>} />
      </SettingsGroup>

      <SettingsGroup title="Telemetry" desc="BuildPilot is fully offline. No data leaves your machine — ever.">
        <SettingsRow label="Anonymous diagnostics" hint="OFF by default. Even when on, only crash stacks are sent."
                     control={<Switch value={false} />} />
      </SettingsGroup>

      <div className="settings-banner ok">
        <Icon.Check size={13} />
        <div className="col" style={{ gap: 2, flex: 1 }}>
          <span style={{ fontWeight: 500, fontSize: 12.5 }}>No external connections active.</span>
          <span className="muted" style={{ fontSize: 11.5 }}>BuildPilot server is bound to 127.0.0.1:51731. Only git remotes, configured webhooks and SSH hosts make outbound traffic.</span>
        </div>
      </div>
    </>
  );
}

window.BPSettings = { SettingsScreen };
