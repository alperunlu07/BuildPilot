import type { ClientChannel } from 'ssh2';
import type { HostCapabilities } from '@buildpilot/shared-types';
import { getHost, setHostCapabilities } from '../store/hosts';
import { buildConnectConfig, connect, parseHost } from './steps/_ssh';

// One probe to rule them all. Each section is fenced by a marker line so
// the parser can pick fields out without caring about ordering or extra
// shell noise. Anything missing on the host (e.g. xcodebuild on a Linux
// box) just produces an empty section instead of failing the whole probe.
const PROBE_COMMAND = [
  'echo "::xcode::"',
  'xcodebuild -version 2>/dev/null | head -n 1 || true',
  'echo "::macos::"',
  'sw_vers -productVersion 2>/dev/null || true',
  'echo "::arch::"',
  'uname -m 2>/dev/null || true',
  'echo "::end::"',
].join('; ');

interface MarkedSection {
  // Lines belonging to a marker section, with whitespace trimmed at the
  // boundaries and empty lines dropped.
  [marker: string]: string[];
}

// Pure parser — exported so the test suite can verify edge cases without
// running an actual ssh probe. Stays robust to:
//   - extra noise lines before / after the markers (login banners, motd)
//   - missing sections (xcodebuild not installed)
//   - CRLF line endings (ssh2 occasionally hands them through)
export function parseCapabilities(stdout: string, when: number = Date.now()): HostCapabilities {
  const sections: MarkedSection = {};
  let current: string | null = null;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^::(\w+)::$/.exec(line);
    if (m) {
      current = m[1]!;
      sections[current] = [];
      continue;
    }
    if (!current) continue;
    if (line.length === 0) continue;
    sections[current]!.push(line);
  }

  const xcodeLine = sections.xcode?.[0];
  const macosLine = sections.macos?.[0];
  const archLine = sections.arch?.[0];

  return {
    // Anchor on `Xcode <digit>` so "bash: xcodebuild: command not found"
    // doesn't sneak through (it contains the substring "xcode").
    xcodeVersion: xcodeLine && /^Xcode\s+\d/i.test(xcodeLine) ? xcodeLine : undefined,
    macosVersion: macosLine && /^\d+(\.\d+)*$/.test(macosLine) ? macosLine : undefined,
    arch: archLine && archLine.length > 0 ? archLine : undefined,
    lastCheckedAt: when,
  };
}

// Connect, run the probe, parse, and persist the snapshot back to
// hosts.json. Throws on connection / auth failure so the caller (the API
// route) can surface a clean error to the dashboard.
export async function pingHost(id: string): Promise<HostCapabilities> {
  const host = getHost(id);
  if (!host) throw new Error(`host not found: ${id}`);
  const cfg = await buildConnectConfig(host.host, {
    identityFile: host.identityFile ?? undefined,
    password: host.password ?? undefined,
    skipStrictHostKey: host.skipStrictHostKey ?? false,
  });
  // Force a short timeout — a hung agent shouldn't block the dashboard.
  cfg.readyTimeout = 10_000;

  const conn = await connect(cfg);
  let stdout = '';
  try {
    const stream = await new Promise<ClientChannel>((resolve, reject) => {
      conn.exec(PROBE_COMMAND, (err, s) => (err ? reject(err) : resolve(s)));
    });
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (c: Buffer) => {
        stdout += c.toString();
      });
      stream.stderr?.on('data', (c: Buffer) => {
        stdout += c.toString();
      });
      stream.on('close', () => resolve());
      stream.on('error', reject);
    });
  } finally {
    conn.end();
  }

  const caps = parseCapabilities(stdout);
  setHostCapabilities(id, caps);
  // Quick sanity check — at minimum we should have an arch reading on any
  // POSIX host. If the probe came back completely empty, treat the host as
  // unreachable even though the SSH connection itself succeeded.
  if (!caps.arch) {
    throw new Error('host responded but probe produced no readable output (shell may be non-POSIX)');
  }
  return caps;
}

// Useful externally for the parsed-host helper used by the dashboard.
export function summariseHost(spec: string): string {
  try {
    const { user, host, port } = parseHost(spec);
    return `${user}@${host}:${port}`;
  } catch {
    return spec;
  }
}
