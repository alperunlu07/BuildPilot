import { describe, expect, it } from 'vitest';
import { buildOtaManifestPlist } from './otaManifestGenerate';

describe('buildOtaManifestPlist', () => {
  it('embeds bundle metadata + ipa url', () => {
    const xml = buildOtaManifestPlist({
      bundleId: 'com.example.app',
      bundleVersion: '42',
      title: 'My App',
      ipaUrl: 'https://cdn.example.com/builds/MyApp-42.ipa',
    });
    expect(xml).toContain('<key>bundle-identifier</key><string>com.example.app</string>');
    expect(xml).toContain('<key>bundle-version</key><string>42</string>');
    expect(xml).toContain('<key>title</key><string>My App</string>');
    expect(xml).toContain('https://cdn.example.com/builds/MyApp-42.ipa');
  });

  it('includes optional icons + subtitle', () => {
    const xml = buildOtaManifestPlist({
      bundleId: 'a',
      bundleVersion: '1',
      title: 't',
      ipaUrl: 'u',
      icon57Url: 'i57',
      icon512Url: 'i512',
      subtitle: 'beta',
    });
    expect(xml).toContain('display-image');
    expect(xml).toContain('full-size-image');
    expect(xml).toContain('<string>beta</string>');
  });

  it('escapes ampersands and quotes', () => {
    const xml = buildOtaManifestPlist({
      bundleId: 'com.example',
      bundleVersion: '1',
      title: 'A & B "test"',
      ipaUrl: 'https://x?q=1&r=2',
    });
    expect(xml).toContain('A &amp; B &quot;test&quot;');
    expect(xml).toContain('q=1&amp;r=2');
  });
});
