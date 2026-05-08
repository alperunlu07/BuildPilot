import type { RegisterDevicesStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { ascErrorMessage, ascRequest, type AscCredentials } from './_asc';

// Add device UDIDs to the developer portal so ad-hoc / dev profiles can
// include them. ASC API endpoint: POST /v1/devices.
//
// Input is a multiline `udids` field — one "name=UDID" per line, or just a
// UDID per line (auto-named). We submit each one in turn; existing devices
// (409 Conflict) are treated as success.
const UDID_RE = /^[a-fA-F0-9-]{20,}$/;

export interface DeviceInput {
  name: string;
  udid: string;
  platform: 'IOS' | 'MAC_OS';
}

export function parseUdidLines(
  udids: string,
  defaultPlatform: 'IOS' | 'MAC_OS' = 'IOS',
): DeviceInput[] {
  const out: DeviceInput[] = [];
  for (const raw of udids.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let name: string;
    let udid: string;
    const eq = line.indexOf('=');
    if (eq > 0) {
      name = line.slice(0, eq).trim();
      udid = line.slice(eq + 1).trim();
    } else {
      udid = line;
      name = `Device-${udid.slice(0, 8)}`;
    }
    if (!UDID_RE.test(udid)) {
      throw new Error(`registerDevices: "${udid}" doesn't look like a valid UDID`);
    }
    out.push({ name, udid, platform: defaultPlatform });
  }
  if (out.length === 0) throw new Error('registerDevices: no UDIDs provided');
  return out;
}

export async function runRegisterDevices(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<RegisterDevicesStepData>;
  if (!d.keyId || !d.issuerId) {
    throw new Error('registerDevices: keyId + issuerId required');
  }
  if (!d.udids || d.udids.trim().length === 0) {
    throw new Error('registerDevices: missing "udids"');
  }
  const platform = (d.platform ?? 'IOS') as 'IOS' | 'MAC_OS';
  const devices = parseUdidLines(d.udids, platform);
  const creds: AscCredentials = {
    keyId: d.keyId,
    issuerId: d.issuerId,
    privateKeyPath: d.apiKeyPath,
    privateKeyPem: d.apiKeyContents,
  };

  let added = 0;
  let already = 0;
  for (const dev of devices) {
    const res = await ascRequest({
      creds,
      method: 'POST',
      path: '/v1/devices',
      body: {
        data: {
          type: 'devices',
          attributes: {
            name: dev.name,
            udid: dev.udid,
            platform: dev.platform,
          },
        },
      },
    });
    if (res.ok) {
      added += 1;
      ctx.log(`+ ${dev.name} ${dev.udid}`, 'success');
      continue;
    }
    // 409 Conflict / 422 already-exists — treat as already registered.
    if (res.status === 409 || res.status === 422) {
      already += 1;
      ctx.log(`= ${dev.name} ${dev.udid} (already registered)`, 'info');
      continue;
    }
    throw new Error(`registerDevices ${dev.udid}: ${ascErrorMessage(res)}`);
  }
  ctx.log(`registerDevices summary: ${added} added, ${already} already registered`, 'success');
}
