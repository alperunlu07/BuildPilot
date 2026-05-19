import type { TestCase, TestSuite, TestStatus } from '@buildpilot/shared-types';

// Hand-rolled JUnit XML parser — no dependency footprint, and we only need
// to walk `<testsuite>` and `<testcase>` elements with their `<failure>`,
// `<error>`, and `<skipped>` children. JUnit XML in the wild is messy
// (Surefire vs. Jest vs. xUnit vs. swiftlint), but the shape we care about
// is stable enough to extract with a streaming-style attribute pass.

// Decode the handful of XML entities we expect in test output. Anything
// unknown passes through unchanged.
function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&');
}

// Pull `key="value"` pairs out of an opening-tag fragment ("testcase name=\"X\" time=\"0.1\"").
// Values may be single- or double-quoted; we accept either. Hand-rolled
// because we don't want to drag in a real XML parser for this.
function parseAttrs(tagFragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tagFragment)) !== null) {
    out[m[1]!] = decodeXml(m[2] ?? m[3] ?? '');
  }
  return out;
}

function num(v: string | undefined): number | undefined {
  if (v == null || v === '') return undefined;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
}

// Extract inner text of a child element so we can surface failure /
// error message bodies. We accept either CDATA-wrapped or plain content.
function extractInner(body: string, tagName: string): string | undefined {
  // `<failure ...>...</failure>` OR `<failure ... />` self-closing.
  // Attribute scan uses `(?:[^/>]|/[^>])*` so a trailing `/` belongs to
  // the self-closing form, not to the attributes.
  const re = new RegExp(
    `<${tagName}\\b((?:[^/>]|/[^>])*)(?:/>|>([\\s\\S]*?)</${tagName}>)`,
    'i',
  );
  const m = body.match(re);
  if (!m) return undefined;
  const inner = m[2];
  if (inner == null) {
    // self-closing — fall back to the `message` attribute if any.
    // Return an empty string (rather than undefined) when neither is
    // present so the caller still knows the tag matched; otherwise a
    // bare `<skipped/>` would be indistinguishable from "no skipped
    // tag at all".
    const attrs = parseAttrs(m[1] ?? '');
    return attrs.message ?? '';
  }
  // Strip CDATA wrapper if present.
  const cdataMatch = inner.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  const text = cdataMatch ? cdataMatch[1]! : decodeXml(inner);
  // Many tools also stash a useful summary on the `message=` attribute;
  // prepend it when present so the UI shows a one-liner above the trace.
  const attrs = parseAttrs(m[1] ?? '');
  if (attrs.message && !text.includes(attrs.message)) {
    return `${attrs.message}\n${text}`;
  }
  return text;
}

function determineStatus(testcaseBody: string): {
  status: TestStatus;
  message?: string;
} {
  // Order matters: `<error>` and `<failure>` both mean fail; `<skipped>`
  // wins over implicit pass.
  const fail = extractInner(testcaseBody, 'failure');
  if (fail !== undefined) return { status: 'failed', message: fail };
  const err = extractInner(testcaseBody, 'error');
  if (err !== undefined) return { status: 'failed', message: err };
  const skipped = extractInner(testcaseBody, 'skipped');
  if (skipped !== undefined) return { status: 'skipped', message: skipped || undefined };
  return { status: 'passed' };
}

// Scan a `<testsuite ...>...</testsuite>` body for testcase elements and
// return our typed list. Suites containing nested suites (Surefire) are
// flattened by the caller.
function parseSuiteBody(body: string): TestCase[] {
  const out: TestCase[] = [];
  // Match both self-closing testcases (no body, no failure) and full ones.
  // `[^/>]*` instead of `[^>]*` keeps the greedy attribute scan from
  // gobbling the closing `/` in `<testcase ... />`, which would otherwise
  // make the parser think a self-closing tag was an opening one and
  // swallow the next testcase as its body.
  const re = /<testcase\b((?:[^/>]|\/[^>])*)(\/>|>([\s\S]*?)<\/testcase>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const attrs = parseAttrs(m[1] ?? '');
    const inner = m[3] ?? '';
    const { status, message } = inner.length > 0 ? determineStatus(inner) : { status: 'passed' as TestStatus };
    const tc: TestCase = {
      name: attrs.name ?? '(unnamed)',
      status,
    };
    if (attrs.classname) tc.classname = attrs.classname;
    const t = num(attrs.time);
    if (t !== undefined) tc.durationSec = t;
    if (message) tc.message = message;
    if (attrs.file) tc.file = attrs.file;
    const ln = num(attrs.line);
    if (ln !== undefined) tc.line = ln;
    out.push(tc);
  }
  return out;
}

export function parseJunitXml(xml: string): TestSuite[] {
  // Walk every `<testsuite>` opening tag (greedy on attributes that exclude
  // `/` so a self-closing tag doesn't swallow attributes from the next).
  // For each opener we then balance-match its corresponding `</testsuite>`
  // so nested suites (Maven Surefire) emit one entry per nested suite
  // instead of being absorbed by the outer one.
  const suites: TestSuite[] = [];
  const openRe = /<testsuite\b((?:[^/>]|\/[^>])*)(\/>|>)/g;
  let m: RegExpExecArray | null;
  while ((m = openRe.exec(xml)) !== null) {
    const attrs = parseAttrs(m[1] ?? '');
    const isSelfClosing = m[2] === '/>';
    let inner = '';
    if (!isSelfClosing) {
      // Balance-scan: walk forward counting `<testsuite ...>` opens and
      // `</testsuite>` closes; the close at depth 0 ends our suite body.
      let depth = 1;
      let cursor = openRe.lastIndex;
      const innerRe = /<testsuite\b((?:[^/>]|\/[^>])*)(\/>|>)|<\/testsuite>/g;
      innerRe.lastIndex = cursor;
      let n: RegExpExecArray | null;
      while ((n = innerRe.exec(xml)) !== null) {
        if (n[0] === '</testsuite>') {
          depth -= 1;
          if (depth === 0) {
            inner = xml.slice(cursor, n.index);
            // Resume the outer scan AFTER this </testsuite> so we don't
            // re-match nested opens (they're handled when we recurse).
            cursor = n.index + n[0].length;
            break;
          }
        } else if (n[2] === '>') {
          // Non-self-closing nested open.
          depth += 1;
        }
      }
      // No matching close — bail on this suite but keep going.
      if (depth !== 0) {
        continue;
      }
      // openRe.lastIndex remains where it was; let it find further
      // sibling opens (it'll re-scan the nested suite opens too — that's
      // exactly what we want for the flatten-nested behavior).
      void cursor;
    }
    // Trim nested suite bodies so we don't double-count testcases at
    // this level; the inner suite emits its own entry on the next loop
    // iteration.
    const innerNoNested = inner.replace(
      /<testsuite\b(?:[^/>]|\/[^>])*(?:\/>|>[\s\S]*?<\/testsuite>)/g,
      '',
    );
    const tests = parseSuiteBody(innerNoNested);
    const suite: TestSuite = {
      name: attrs.name ?? '(unnamed suite)',
      tests,
    };
    const t = num(attrs.time);
    if (t !== undefined) suite.timeSec = t;
    suites.push(suite);
  }
  return suites;
}
