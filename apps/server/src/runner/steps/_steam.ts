// Shared helpers for Phase 6.5 Steam (Steamworks SDK) steps.
//
// Two main concerns:
//   1. Build the VDF text that `steamcmd +run_app_build` consumes. VDF is
//      Valve's KeyValues syntax — a JSON-ish nested map but written with
//      curly braces and quoted strings + no commas. We render it from a
//      typed model so steps don't have to hand-author VDF.
//   2. Talk to the Steamworks Web API (build-state lookup, SetAppBuildLive)
//      with a publisher key. The publisher key is treated as a secret and
//      lives in `SENSITIVE_FIELDS` so it's encrypted at rest.

export interface SteamDepot {
  // Numeric depot id from the Steamworks partner site.
  id: string;
  // ContentRoot-relative file mappings. Most projects ship one mapping
  // covering the whole build output dir.
  fileMappings: Array<{
    localPath: string;
    depotPath?: string;
    recursive?: boolean;
  }>;
}

export interface SteamAppBuildModel {
  appId: string;
  // Description shown in the Steamworks build history.
  description: string;
  // ContentRoot relative to the VDF file. Almost always "../" or absolute.
  contentRoot: string;
  // BuildOutput dir for steamcmd's intermediate logs (default ../output).
  buildOutput?: string;
  // Branch the VDF should publish to. Empty means "leave at not-set" — the
  // operator promotes via `steamSetLive` later.
  setLive?: string;
  // Whether to mark the build as a preview-only test build.
  preview?: boolean;
  depots: SteamDepot[];
}

function quote(s: string): string {
  return '"' + s.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

// Render the app_build VDF as text. Indentation matches Valve's tooling
// output for grep-friendliness. Depots are emitted as inline references
// (the depots map points at separate depot_build_<id>.vdf files when
// fileMappings is empty, otherwise inline).
export function buildAppBuildVdf(model: SteamAppBuildModel): string {
  const lines: string[] = [];
  lines.push('"AppBuild"');
  lines.push('{');
  lines.push(`  "AppID" ${quote(model.appId)}`);
  lines.push(`  "Desc" ${quote(model.description)}`);
  if (model.preview) lines.push(`  "Preview" "1"`);
  if (model.setLive && model.setLive.length > 0) {
    lines.push(`  "SetLive" ${quote(model.setLive)}`);
  }
  lines.push(`  "ContentRoot" ${quote(model.contentRoot)}`);
  lines.push(`  "BuildOutput" ${quote(model.buildOutput ?? '../output')}`);
  lines.push('  "Depots"');
  lines.push('  {');
  for (const depot of model.depots) {
    if (depot.fileMappings.length === 0) {
      // Reference an external depot VDF rather than inlining.
      lines.push(`    ${quote(depot.id)} ${quote(`depot_build_${depot.id}.vdf`)}`);
      continue;
    }
    lines.push(`    ${quote(depot.id)}`);
    lines.push('    {');
    lines.push('      "FileMapping"');
    lines.push('      {');
    for (const fm of depot.fileMappings) {
      lines.push('        "LocalPath" ' + quote(fm.localPath));
      lines.push('        "DepotPath" ' + quote(fm.depotPath ?? '.'));
      lines.push('        "recursive" ' + quote(fm.recursive === false ? '0' : '1'));
    }
    lines.push('      }');
    lines.push('    }');
  }
  lines.push('  }');
  lines.push('}');
  return lines.join('\n') + '\n';
}

export interface SteamWebApiOpts {
  // Publisher Web API key from
  // https://partner.steamgames.com/dashboard → API access.
  webApiKey: string;
  // Steamworks API host. Override only for testing against a recorded
  // mock server.
  baseUrl?: string;
}

const DEFAULT_BASE = 'https://partner.steam-api.com';

// Set a build live on a branch. Endpoint:
//   POST /ISteamApps/SetAppBuildLive/v0001/?appid=<id>&buildid=<id>&betakey=<branch>&description=&key=<webApiKey>
// Form-urlencoded payload. Returns 200 + `{"response":{"result":1}}` on
// success or `{"response":{"errorcode":xx,"errormsg":"…"}}` on failure.
export interface SetLiveOpts {
  appId: string;
  buildId: string;
  branch: string;
  description?: string;
}

export async function steamSetAppBuildLive(
  api: SteamWebApiOpts,
  opts: SetLiveOpts,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const base = api.baseUrl ?? DEFAULT_BASE;
  const url = `${base}/ISteamApps/SetAppBuildLive/v2/`;
  const body = new URLSearchParams();
  body.append('key', api.webApiKey);
  body.append('appid', opts.appId);
  body.append('buildid', opts.buildId);
  body.append('betakey', opts.branch);
  if (opts.description) body.append('description', opts.description);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    return { ok: false, status: res.status, error: text.slice(0, 500) };
  }
  const inner = (parsed as { response?: { result?: number; errormsg?: string; errorcode?: number } } | null)?.response;
  if (inner?.result === 1) return { ok: true };
  return {
    ok: false,
    status: res.status,
    error: `${inner?.errorcode ?? '?'} ${inner?.errormsg ?? text.slice(0, 200)}`,
  };
}

// `steamcmd` argv builder. The `+command` syntax stacks calls in a single
// session — login + run_app_build + quit happens in one process.
export interface SteamcmdInvocation {
  steamcmdPath?: string;
  username: string;
  // Either a password OR a Steam Guard mobile auth code (typically requires
  // sentry/ssfn cache pre-imported by `steamcmdSetup`).
  password: string;
  steamGuardCode?: string;
  // Path to the VDF that drives the upload.
  vdfPath: string;
}

export function buildSteamcmdUploadCommand(d: SteamcmdInvocation): string {
  const path = d.steamcmdPath ?? 'steamcmd';
  const parts: string[] = [path];
  parts.push('+@ShutdownOnFailedCommand', '1');
  parts.push('+@NoPromptForPassword', '1');
  parts.push('+login', shQuote(d.username), shQuote(d.password));
  if (d.steamGuardCode && d.steamGuardCode.length > 0) {
    parts.push(shQuote(d.steamGuardCode));
  }
  parts.push('+run_app_build', shQuote(d.vdfPath));
  parts.push('+quit');
  return parts.join(' ');
}

function shQuote(s: string): string {
  return `'${s.replace(/'/g, "'\\''")}'`;
}
