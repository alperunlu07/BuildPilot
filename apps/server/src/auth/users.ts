// Cluster 11.A — user table CRUD with bcrypt password hashing.
//
// The table exists on every install (created by `initDb`) regardless of
// whether `config.auth.enabled` is true. Routes that mutate state (see
// `api/users.ts`) refuse to do anything destructive when auth is off and
// no users have been created yet — there's no admin to delete from.

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type {
  CreateUserInput,
  NotificationPrefs,
  UpdateUserInput,
  User,
  UserRole,
} from '@buildpilot/shared-types';
import { DEFAULT_NOTIFICATION_PREFS } from '@buildpilot/shared-types';
import { getDb } from '../store/db';

// 10 rounds is the de-facto default — fast enough for an interactive
// login (~100ms on a modern CPU) and slow enough to deter offline brute
// force against a stolen db.sqlite.
const BCRYPT_ROUNDS = 10;

interface UserRow {
  id: string;
  username: string;
  display_name: string;
  password_hash: string;
  role: string;
  notification_prefs_json: string;
  created_at: number;
  updated_at: number;
  last_login_at: number | null;
}

function parsePrefs(json: string): NotificationPrefs {
  try {
    const parsed = JSON.parse(json) as Partial<NotificationPrefs>;
    return { ...DEFAULT_NOTIFICATION_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_NOTIFICATION_PREFS };
  }
}

function rowToUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    role: (row.role as UserRole) ?? 'viewer',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    notificationPrefs: parsePrefs(row.notification_prefs_json),
  };
}

// Internal-only — returned by getUserByUsernameWithHash so the login flow can
// compare the candidate password. Public APIs always strip the hash.
export interface UserWithHash extends User {
  passwordHash: string;
}

function rowToUserWithHash(row: UserRow): UserWithHash {
  return { ...rowToUser(row), passwordHash: row.password_hash };
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

export function listUsers(): User[] {
  const rows = getDb()
    .prepare('SELECT * FROM users ORDER BY username ASC')
    .all() as UserRow[];
  return rows.map(rowToUser);
}

export function countUsers(): number {
  const row = getDb().prepare('SELECT COUNT(*) as n FROM users').get() as { n: number };
  return row.n;
}

export function getUser(id: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserByUsername(username: string): User | null {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;
  return row ? rowToUser(row) : null;
}

export function getUserByUsernameWithHash(username: string): UserWithHash | null {
  const row = getDb()
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username) as UserRow | undefined;
  return row ? rowToUserWithHash(row) : null;
}

export async function createUser(input: CreateUserInput): Promise<User> {
  const username = input.username.trim().toLowerCase();
  if (!username) throw new Error('username is required');
  if (!input.password) throw new Error('password is required');
  const existing = getUserByUsername(username);
  if (existing) throw new Error('username already in use');
  const now = Date.now();
  // The very first user created becomes admin regardless of what the
  // caller passed — useful for the bootstrap flow when nobody has signed
  // in yet to grant the role.
  const role: UserRole = countUsers() === 0 ? 'admin' : (input.role ?? 'viewer');
  const id = randomUUID();
  const hash = await hashPassword(input.password);
  getDb()
    .prepare(
      `INSERT INTO users (
        id, username, display_name, password_hash, role,
        notification_prefs_json, created_at, updated_at, last_login_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .run(
      id,
      username,
      input.displayName ?? username,
      hash,
      role,
      JSON.stringify(DEFAULT_NOTIFICATION_PREFS),
      now,
      now,
    );
  return getUser(id)!;
}

export async function updateUser(id: string, patch: UpdateUserInput): Promise<User | null> {
  const current = getUser(id);
  if (!current) return null;
  const now = Date.now();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.displayName !== undefined) {
    fields.push('display_name = ?');
    values.push(patch.displayName);
  }
  if (patch.role !== undefined) {
    fields.push('role = ?');
    values.push(patch.role);
  }
  if (patch.password) {
    const hash = await hashPassword(patch.password);
    fields.push('password_hash = ?');
    values.push(hash);
  }
  if (patch.notificationPrefs !== undefined) {
    fields.push('notification_prefs_json = ?');
    values.push(JSON.stringify({ ...DEFAULT_NOTIFICATION_PREFS, ...patch.notificationPrefs }));
  }
  if (fields.length === 0) return current;
  fields.push('updated_at = ?');
  values.push(now);
  values.push(id);
  getDb().prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getUser(id);
}

export function deleteUser(id: string): boolean {
  const r = getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  return r.changes > 0;
}

export function markLoginAt(id: string, ts: number): void {
  getDb().prepare('UPDATE users SET last_login_at = ? WHERE id = ?').run(ts, id);
}
