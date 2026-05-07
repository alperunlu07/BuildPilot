import { shellQuote } from './_exec';

export const CFBUNDLE_VERSION_KEY = ':CFBundleVersion';

export function buildPlistBuddyCommand(inner: string, plistPath: string): string {
  return `/usr/libexec/PlistBuddy -c ${shellQuote(inner)} ${shellQuote(plistPath)}`;
}
