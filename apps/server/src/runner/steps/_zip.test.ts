import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { readZipEntry } from './_zip';

const written: string[] = [];

afterEach(async () => {
  await Promise.all(written.splice(0).map((p) => fs.rm(p, { force: true })));
});

// Builds a real zip so the reader is exercised against actual offsets rather
// than a hand-waved fixture.
async function writeZip(
  members: Array<{ name: string; body: string; deflate: boolean }>,
): Promise<string> {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const m of members) {
    const nameBuf = Buffer.from(m.name, 'utf8');
    const uncompressed = Buffer.from(m.body, 'utf8');
    const data = m.deflate ? deflateRawSync(uncompressed) : uncompressed;
    const method = m.deflate ? 8 : 0;

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(uncompressed.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(uncompressed.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(members.length, 8);
  eocd.writeUInt16LE(members.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);

  const path = join(tmpdir(), `bp-zip-${Math.floor(performance.now() * 1000)}.zip`);
  await fs.writeFile(path, Buffer.concat([...locals, cd, eocd]));
  written.push(path);
  return path;
}

describe('readZipEntry', () => {
  it('reads a deflated member', async () => {
    const body = JSON.stringify({ m_CcdManagedData: { Badge: 'latest' } });
    const path = await writeZip([
      { name: 'base/dex/classes.dex', body: 'x'.repeat(500), deflate: true },
      { name: 'base/assets/aa/settings.json', body, deflate: true },
    ]);
    const got = await readZipEntry(path, ['base/assets/aa/settings.json']);
    expect(got?.toString('utf8')).toBe(body);
  });

  it('reads a stored member', async () => {
    const path = await writeZip([{ name: 'a/b.json', body: '{"ok":true}', deflate: false }]);
    expect((await readZipEntry(path, ['a/b.json']))?.toString('utf8')).toBe('{"ok":true}');
  });

  // Callers pass both the AAB layout (base/assets/...) and the APK one.
  it('takes the first candidate name that exists', async () => {
    const path = await writeZip([{ name: 'assets/aa/settings.json', body: 'apk', deflate: true }]);
    const got = await readZipEntry(path, ['base/assets/aa/settings.json', 'assets/aa/settings.json']);
    expect(got?.toString('utf8')).toBe('apk');
  });

  it('returns null when no candidate is present', async () => {
    const path = await writeZip([{ name: 'other.txt', body: 'hi', deflate: false }]);
    expect(await readZipEntry(path, ['assets/aa/settings.json'])).toBeNull();
  });
});
