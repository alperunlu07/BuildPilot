import { writeFile } from 'node:fs/promises';
import type { OtaManifestGenerateStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

// Generate an `itms-services://` manifest plist for ad-hoc / enterprise OTA
// distribution. Pairs with s3Upload / sftpUpload to host both the .ipa and
// the manifest under HTTPS; users tap an `itms-services://?action=download-
// manifest&url=https://…/manifest.plist` link in Mobile Safari to install.
//
// Required fields:
//   - ipaUrl       (HTTPS, the hosted .ipa)
//   - bundleId     (matches CFBundleIdentifier)
//   - bundleVersion (string — CFBundleVersion / build number)
//   - title
//   - outputPath   (where to write the .plist)
// Optional:
//   - icon57Url, icon512Url for tap-link tile imagery (Apple still uses 57px)
//   - subtitle, releaseNotes — purely cosmetic
export interface OtaManifestModel {
  bundleId: string;
  bundleVersion: string;
  title: string;
  ipaUrl: string;
  icon57Url?: string;
  icon512Url?: string;
  subtitle?: string;
}

export function buildOtaManifestPlist(m: OtaManifestModel): string {
  const assets: string[] = [];
  assets.push(
    `<dict>
        <key>kind</key><string>software-package</string>
        <key>url</key><string>${escapeXml(m.ipaUrl)}</string>
      </dict>`,
  );
  if (m.icon57Url) {
    assets.push(
      `<dict>
        <key>kind</key><string>display-image</string>
        <key>url</key><string>${escapeXml(m.icon57Url)}</string>
      </dict>`,
    );
  }
  if (m.icon512Url) {
    assets.push(
      `<dict>
        <key>kind</key><string>full-size-image</string>
        <key>url</key><string>${escapeXml(m.icon512Url)}</string>
      </dict>`,
    );
  }
  const subtitleEntry = m.subtitle
    ? `\n          <key>subtitle</key><string>${escapeXml(m.subtitle)}</string>`
    : '';

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        ${assets.join('\n        ')}
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key><string>${escapeXml(m.bundleId)}</string>
        <key>bundle-version</key><string>${escapeXml(m.bundleVersion)}</string>
        <key>kind</key><string>software</string>
        <key>title</key><string>${escapeXml(m.title)}</string>${subtitleEntry}
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function runOtaManifestGenerate(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<OtaManifestGenerateStepData>;
  if (!d.bundleId || !d.bundleVersion || !d.title || !d.ipaUrl || !d.outputPath) {
    throw new Error(
      'otaManifestGenerate: bundleId + bundleVersion + title + ipaUrl + outputPath all required',
    );
  }
  const xml = buildOtaManifestPlist({
    bundleId: d.bundleId,
    bundleVersion: d.bundleVersion,
    title: d.title,
    ipaUrl: d.ipaUrl,
    icon57Url: d.icon57Url,
    icon512Url: d.icon512Url,
    subtitle: d.subtitle,
  });
  await writeFile(d.outputPath, xml, 'utf-8');
  ctx.log(`wrote ota manifest to ${d.outputPath} (${xml.length} bytes)`, 'success');
  if (d.installUrlBase && d.installUrlBase.trim().length > 0) {
    const tap = `itms-services://?action=download-manifest&url=${encodeURIComponent(d.installUrlBase + '/' + d.outputPath.split('/').pop())}`;
    ctx.log(`install link: ${tap}`);
  }
}
