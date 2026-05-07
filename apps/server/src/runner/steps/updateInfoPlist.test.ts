import { describe, expect, it } from 'vitest';
import { buildUpdateInfoPlistCommand } from './updateInfoPlist';

describe('buildUpdateInfoPlistCommand', () => {
  it('builds the canonical Set invocation', () => {
    expect(
      buildUpdateInfoPlistCommand({
        plistPath: 'MyApp/Info.plist',
        key: ':CFBundleDisplayName',
        value: 'MyApp',
        operation: 'set',
      }),
    ).toBe(
      `/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName MyApp' 'MyApp/Info.plist'`,
    );
  });

  it('defaults to the set operation when none is given', () => {
    expect(
      buildUpdateInfoPlistCommand({
        plistPath: 'Info.plist',
        key: ':CFBundleDisplayName',
        value: 'MyApp',
      }),
    ).toBe(`/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName MyApp' 'Info.plist'`);
  });

  it('builds the canonical Add invocation for add-string', () => {
    expect(
      buildUpdateInfoPlistCommand({
        plistPath: 'Info.plist',
        key: ':MyKey',
        value: 'newvalue',
        operation: 'add-string',
      }),
    ).toBe(`/usr/libexec/PlistBuddy -c 'Add :MyKey string newvalue' 'Info.plist'`);
  });

  it('builds the canonical Delete invocation without value', () => {
    expect(
      buildUpdateInfoPlistCommand({
        plistPath: 'Info.plist',
        key: ':MyKey',
        operation: 'delete',
      }),
    ).toBe(`/usr/libexec/PlistBuddy -c 'Delete :MyKey' 'Info.plist'`);
  });

  it('omits value from Delete even when one is supplied', () => {
    expect(
      buildUpdateInfoPlistCommand({
        plistPath: 'Info.plist',
        key: ':MyKey',
        value: 'ignored',
        operation: 'delete',
      }),
    ).toBe(`/usr/libexec/PlistBuddy -c 'Delete :MyKey' 'Info.plist'`);
  });

  it('shell-quotes a plist path with spaces', () => {
    expect(
      buildUpdateInfoPlistCommand({
        plistPath: 'My App/Info.plist',
        key: ':CFBundleDisplayName',
        value: 'MyApp',
      }),
    ).toBe(
      `/usr/libexec/PlistBuddy -c 'Set :CFBundleDisplayName MyApp' 'My App/Info.plist'`,
    );
  });

  it('throws when set operation is missing value', () => {
    expect(() =>
      buildUpdateInfoPlistCommand({
        plistPath: 'Info.plist',
        key: ':CFBundleDisplayName',
        operation: 'set',
      }),
    ).toThrow(/value/);
  });

  it('throws when add-string operation is missing value', () => {
    expect(() =>
      buildUpdateInfoPlistCommand({
        plistPath: 'Info.plist',
        key: ':MyKey',
        operation: 'add-string',
      }),
    ).toThrow(/value/);
  });

  it('throws when key is missing', () => {
    expect(() =>
      buildUpdateInfoPlistCommand({ plistPath: 'Info.plist', value: 'v', operation: 'set' }),
    ).toThrow(/key/);
  });

  it('throws when key is missing on delete', () => {
    expect(() =>
      buildUpdateInfoPlistCommand({ plistPath: 'Info.plist', operation: 'delete' }),
    ).toThrow(/key/);
  });

  it('throws when plistPath is missing', () => {
    expect(() =>
      buildUpdateInfoPlistCommand({ key: ':CFBundleDisplayName', value: 'v', operation: 'set' }),
    ).toThrow(/plistPath/);
  });

  it('throws on an invalid operation', () => {
    expect(() =>
      buildUpdateInfoPlistCommand({
        plistPath: 'Info.plist',
        key: ':MyKey',
        value: 'v',
        // @ts-expect-error testing the runtime guard
        operation: 'bogus',
      }),
    ).toThrow(/operation/);
  });
});
