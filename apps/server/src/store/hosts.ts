import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { HostCapabilities, SshHost } from '@buildpilot/shared-types';

// Hosts live alongside config.json — single global list, not per-project.
// File-backed (not SQLite) so a user can hand-edit / version-control it.
const CONFIG_DIR = join(homedir(), '.buildpilot');
const HOSTS_FILE = join(CONFIG_DIR, 'hosts.json');

interface HostsFile {
  hosts: SshHost[];
}

function readFile(): HostsFile {
  if (!existsSync(HOSTS_FILE)) return { hosts: [] };
  try {
    const raw = readFileSync(HOSTS_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as HostsFile;
    if (!Array.isArray(parsed.hosts)) return { hosts: [] };
    return parsed;
  } catch {
    return { hosts: [] };
  }
}

function writeFile(file: HostsFile): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(HOSTS_FILE, JSON.stringify(file, null, 2), 'utf-8');
}

export interface SshHostInput {
  name: string;
  host: string;
  identityFile?: string | null;
  password?: string | null;
  skipStrictHostKey?: boolean;
  description?: string | null;
}

export function listHosts(): SshHost[] {
  return readFile().hosts.slice().sort((a, b) => a.name.localeCompare(b.name));
}

export function getHost(id: string): SshHost | null {
  return readFile().hosts.find((h) => h.id === id) ?? null;
}

export function createHost(input: SshHostInput): SshHost {
  const file = readFile();
  const now = Date.now();
  const host: SshHost = {
    id: randomUUID(),
    name: input.name,
    host: input.host,
    identityFile: input.identityFile ?? null,
    password: input.password ?? null,
    skipStrictHostKey: input.skipStrictHostKey ?? false,
    description: input.description ?? null,
    createdAt: now,
    updatedAt: now,
  };
  file.hosts.push(host);
  writeFile(file);
  return host;
}

export function updateHost(id: string, patch: Partial<SshHostInput>): SshHost | null {
  const file = readFile();
  const idx = file.hosts.findIndex((h) => h.id === id);
  if (idx < 0) return null;
  const existing = file.hosts[idx]!;
  const merged: SshHost = {
    ...existing,
    name: patch.name ?? existing.name,
    host: patch.host ?? existing.host,
    identityFile: patch.identityFile ?? existing.identityFile,
    password: patch.password ?? existing.password,
    skipStrictHostKey: patch.skipStrictHostKey ?? existing.skipStrictHostKey,
    description: patch.description ?? existing.description,
    updatedAt: Date.now(),
  };
  file.hosts[idx] = merged;
  writeFile(file);
  return merged;
}

export function deleteHost(id: string): boolean {
  const file = readFile();
  const before = file.hosts.length;
  file.hosts = file.hosts.filter((h) => h.id !== id);
  if (file.hosts.length === before) return false;
  writeFile(file);
  return true;
}

export function setHostCapabilities(id: string, caps: HostCapabilities | null): SshHost | null {
  const file = readFile();
  const idx = file.hosts.findIndex((h) => h.id === id);
  if (idx < 0) return null;
  const existing = file.hosts[idx]!;
  const merged: SshHost = {
    ...existing,
    capabilities: caps ?? undefined,
    updatedAt: Date.now(),
  };
  file.hosts[idx] = merged;
  writeFile(file);
  return merged;
}
