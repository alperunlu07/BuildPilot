// Phase 4 Cluster A trigger helpers — pure functions that decide whether
// a poll result should fire a build, kept out of the poller loop so the
// scheduling code stays small and the matching rules are unit-testable.

// Convert a glob ("v*.*.*" / "release/**") into a regex. Supports:
//   `*`  → matches any run of non-slash characters
//   `**` → matches any run including slashes (the only multi-segment wildcard)
//   `?`  → matches a single non-slash character
// All other regex metacharacters are escaped.
export function globToRegExp(glob: string): RegExp {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    const ch = glob[i]!;
    if (ch === '*') {
      if (glob[i + 1] === '*') {
        out += '.*';
        i += 2;
      } else {
        out += '[^/]*';
        i += 1;
      }
    } else if (ch === '?') {
      out += '[^/]';
      i += 1;
    } else if ('\\^$.+|()[]{}'.includes(ch)) {
      out += '\\' + ch;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return new RegExp('^' + out + '$');
}

// Tag pattern is a single glob; blank means "no tag trigger". `tagPattern`
// matches against the full tag refname after `refs/tags/` is stripped.
export function matchesTagPattern(tag: string, pattern: string | undefined): boolean {
  if (!pattern || pattern.trim().length === 0) return false;
  return globToRegExp(pattern.trim()).test(tag);
}

// Path filter: newline-separated globs. Returns true when at least one
// changed file matches at least one glob. An empty filter spec is treated
// as "no filter" — every change passes (caller decides).
export function pathsMatchFilter(changedPaths: string[], filterSpec: string | undefined): boolean {
  if (!filterSpec || filterSpec.trim().length === 0) return true;
  const patterns = filterSpec
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map(globToRegExp);
  if (patterns.length === 0) return true;
  return changedPaths.some((p) => patterns.some((rx) => rx.test(p)));
}

// Minimal 5-field cron parser. Supports `*`, `*/N`, plain integers and
// comma-separated lists. NOT supported: ranges (`1-5`), names (`mon`), `?`,
// `L`, `W`, `#`. Returns null when the expression is invalid.
export interface CronSpec {
  minute: Set<number>;
  hour: Set<number>;
  dom: Set<number>;
  month: Set<number>;
  dow: Set<number>;
}

const CRON_FIELD_BOUNDS: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6], // day of week (0 = Sun)
];

function parseCronField(spec: string, [lo, hi]: [number, number]): Set<number> | null {
  const out = new Set<number>();
  for (const piece of spec.split(',')) {
    if (piece === '*') {
      for (let i = lo; i <= hi; i++) out.add(i);
    } else if (/^\*\/(\d+)$/.test(piece)) {
      const step = Number(piece.slice(2));
      if (step <= 0) return null;
      for (let i = lo; i <= hi; i += step) out.add(i);
    } else if (/^\d+$/.test(piece)) {
      const n = Number(piece);
      if (n < lo || n > hi) return null;
      out.add(n);
    } else {
      return null;
    }
  }
  return out;
}

export function parseCron(expr: string): CronSpec | null {
  if (!expr || expr.trim().length === 0) return null;
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const sets: Set<number>[] = [];
  for (let i = 0; i < 5; i++) {
    const parsed = parseCronField(fields[i]!, CRON_FIELD_BOUNDS[i]!);
    if (!parsed) return null;
    sets.push(parsed);
  }
  return {
    minute: sets[0]!,
    hour: sets[1]!,
    dom: sets[2]!,
    month: sets[3]!,
    dow: sets[4]!,
  };
}

// Evaluated in UTC so daylight-saving transitions don't move scheduled fire
// times. Matches Vixie cron's "OR" semantics when both dom and dow are
// constrained (either alone is sufficient to fire).
export function matchesCron(spec: CronSpec, dateUtc: Date): boolean {
  const m = dateUtc.getUTCMinutes();
  const h = dateUtc.getUTCHours();
  const dom = dateUtc.getUTCDate();
  const month = dateUtc.getUTCMonth() + 1;
  const dow = dateUtc.getUTCDay();
  if (!spec.minute.has(m) || !spec.hour.has(h) || !spec.month.has(month)) return false;
  const domBound = spec.dom.size < 31;
  const dowBound = spec.dow.size < 7;
  if (domBound && dowBound) {
    return spec.dom.has(dom) || spec.dow.has(dow);
  }
  if (domBound) return spec.dom.has(dom);
  if (dowBound) return spec.dow.has(dow);
  return true;
}
