import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { Client, type ConnectConfig } from 'ssh2';
import { getHost } from '../../store/hosts';

// Parse "user@host[:port]" into its three parts.
export function parseHost(spec: string): { user: string; host: string; port: number } {
  const at = spec.indexOf('@');
  if (at < 0) throw new Error(`host must be in user@host[:port] form (got: ${spec})`);
  const user = spec.slice(0, at);
  let rest = spec.slice(at + 1);
  let port = 22;
  const colon = rest.lastIndexOf(':');
  if (colon > 0 && /^\d+$/.test(rest.slice(colon + 1))) {
    port = Number(rest.slice(colon + 1));
    rest = rest.slice(0, colon);
  }
  return { user, host: rest, port };
}

export interface SshAuth {
  identityFile?: string;
  password?: string;
  skipStrictHostKey?: boolean;
}

// Resolve "either pick a saved host OR use inline fields". When hostId is a
// non-empty string, the saved host's credentials win; otherwise we honour the
// inline fields. Throws if neither path provides enough info to connect.
export interface ResolvedHost {
  spec: string; // user@host[:port]
  identityFile?: string;
  password?: string;
  skipStrictHostKey?: boolean;
}

export function resolveHost(input: {
  hostId?: string;
  host?: string;
  identityFile?: string;
  password?: string;
  skipStrictHostKey?: string | boolean;
}): ResolvedHost {
  if (input.hostId && input.hostId.trim().length > 0) {
    const saved = getHost(input.hostId.trim());
    if (!saved) throw new Error(`saved host not found: ${input.hostId}`);
    return {
      spec: saved.host,
      identityFile: saved.identityFile ?? undefined,
      password: saved.password ?? undefined,
      skipStrictHostKey: saved.skipStrictHostKey ?? false,
    };
  }
  if (!input.host || input.host.trim().length === 0) {
    throw new Error('ssh: provide a saved hostId or an inline host string');
  }
  return {
    spec: input.host,
    identityFile: input.identityFile,
    password: input.password,
    skipStrictHostKey: input.skipStrictHostKey === true || input.skipStrictHostKey === 'true',
  };
}

export async function buildConnectConfig(
  hostSpec: string,
  auth: SshAuth,
): Promise<ConnectConfig> {
  const { user, host, port } = parseHost(hostSpec);
  const cfg: ConnectConfig = {
    host,
    port,
    username: user,
    readyTimeout: 30_000,
    keepaliveInterval: 15_000,
  };
  if (auth.identityFile && auth.identityFile.trim().length > 0) {
    const path = expandHome(auth.identityFile.trim());
    cfg.privateKey = await fs.readFile(path);
  } else if (auth.password && auth.password.length > 0) {
    cfg.password = auth.password;
  } else {
    throw new Error('ssh: provide either identityFile or password');
  }
  return cfg;
}

export function expandHome(p: string): string {
  if (p.startsWith('~/') || p === '~') {
    return p.replace(/^~/, homedir());
  }
  return p;
}

export function connect(cfg: ConnectConfig): Promise<Client> {
  const conn = new Client();
  return new Promise((resolve, reject) => {
    conn.once('ready', () => resolve(conn));
    conn.once('error', reject);
    conn.connect(cfg);
  });
}

// Drain a duplex SSH stream into per-line emit calls. Mirrors the engine's
// child-process line splitter so SSH stdout/stderr lands as one log entry
// per line, not one per chunk.
export function pipeStream(
  stream: NodeJS.ReadableStream & { stderr?: NodeJS.ReadableStream; on(event: 'close', cb: (code: number) => void): unknown },
  emit: (line: string, level: 'stdout' | 'stderr') => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const buf: Record<'stdout' | 'stderr', string> = { stdout: '', stderr: '' };
    const drain = (chunk: Buffer | string, kind: 'stdout' | 'stderr') => {
      buf[kind] += typeof chunk === 'string' ? chunk : chunk.toString();
      let nl: number;
      while ((nl = buf[kind].indexOf('\n')) !== -1) {
        const line = buf[kind].slice(0, nl).replace(/\r$/, '');
        buf[kind] = buf[kind].slice(nl + 1);
        if (line.length > 0) emit(line, kind);
      }
    };
    stream.on('data', (c: Buffer) => drain(c, 'stdout'));
    stream.stderr?.on('data', (c: Buffer) => drain(c, 'stderr'));
    stream.on('close', (code: number) => {
      for (const k of ['stdout', 'stderr'] as const) {
        if (buf[k].length > 0) emit(buf[k], k);
      }
      resolve(code ?? 0);
    });
    stream.on?.('error' as never, reject as never);
  });
}
