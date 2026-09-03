import { promises as fs } from 'node:fs';
import { inflateRaw } from 'node:zlib';

// Minimal zip reader for pulling ONE small member out of a large archive.
//
// The alternative — read the whole file and scan it — costs a 165 MB buffer to
// recover a 2 KB settings.json out of an .aab. Seeking through the central
// directory instead keeps the read to a few KB regardless of archive size.
//
// Deliberately narrow: no ZIP64, no encryption, stored and deflate only.
// Anything outside that returns null so callers can degrade rather than fail
// on an archive layout quirk.

const EOCD_SIG = 0x06054b50;
const CD_ENTRY_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const EOCD_MIN_SIZE = 22;
const MAX_ZIP_COMMENT = 0xffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

interface CentralEntry {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
}

async function readAt(fh: fs.FileHandle, offset: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await fh.read(buf, 0, length, offset);
  return bytesRead === length ? buf : buf.subarray(0, bytesRead);
}

function inflateRawAsync(buf: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    inflateRaw(buf, (err, out) => (err ? reject(err) : resolve(out)));
  });
}

function parseCentralDirectory(cd: Buffer, entryCount: number): CentralEntry[] | null {
  const out: CentralEntry[] = [];
  let p = 0;
  for (let n = 0; n < entryCount; n++) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== CD_ENTRY_SIG) return null;
    const method = cd.readUInt16LE(p + 10);
    const compressedSize = cd.readUInt32LE(p + 20);
    const uncompressedSize = cd.readUInt32LE(p + 24);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localOffset = cd.readUInt32LE(p + 42);
    if (p + 46 + nameLen > cd.length) return null;
    out.push({
      name: cd.toString('utf8', p + 46, p + 46 + nameLen),
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

// Returns the first of `names` present in the archive, or null when none match
// (or the archive is outside the supported subset).
export async function readZipEntry(
  filePath: string,
  names: readonly string[],
): Promise<Buffer | null> {
  const fh = await fs.open(filePath, 'r');
  try {
    const { size } = await fh.stat();
    const tailLen = Math.min(size, EOCD_MIN_SIZE + MAX_ZIP_COMMENT);
    const tail = await readAt(fh, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - EOCD_MIN_SIZE; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) return null;
    const entryCount = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    // ZIP64 sentinels — the real values live in a record we don't decode.
    if (entryCount === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) return null;

    const entries = parseCentralDirectory(await readAt(fh, cdOffset, cdSize), entryCount);
    if (entries === null) return null;

    for (const wanted of names) {
      const entry = entries.find((e) => e.name === wanted);
      if (!entry) continue;
      // The central directory's sizes are authoritative, but the data offset
      // depends on the LOCAL header's own name/extra lengths, which are free to
      // differ from the central copy.
      const local = await readAt(fh, entry.localOffset, 30);
      if (local.length < 30 || local.readUInt32LE(0) !== LOCAL_SIG) return null;
      const dataStart =
        entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const raw = await readAt(fh, dataStart, entry.compressedSize);
      if (entry.method === METHOD_STORED) return raw;
      if (entry.method === METHOD_DEFLATE) return await inflateRawAsync(raw);
      return null;
    }
    return null;
  } finally {
    await fh.close();
  }
}
