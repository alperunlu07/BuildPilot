// Minimal ANSI SGR (Select Graphic Rendition) parser. Splits an input
// string into a list of (text, style) segments so the LogTable can render
// inline color without a heavy dep (anser / ansi-to-html are 30–60 KB).
//
// Supports:
//   - basic colors      30–37  / 40–47
//   - bright colors     90–97  / 100–107
//   - 256-color         38;5;N / 48;5;N
//   - 24-bit RGB        38;2;R;G;B / 48;2;R;G;B
//   - bold / dim / italic / underline / inverse
//   - reset (0)
// Unknown SGR codes silently no-op (instead of throwing). Non-SGR escape
// sequences (e.g. CSI K erase-line that some tools emit) are stripped.

import type { CSSProperties } from 'react';

export interface AnsiSegment {
  text: string;
  style: CSSProperties;
}

// xterm 16-color basic palette — picked to look reasonable on a dark BG.
const BASE_COLORS = [
  '#1f2937', // black
  '#ef4444', // red
  '#10b981', // green
  '#eab308', // yellow
  '#3b82f6', // blue
  '#a855f7', // magenta
  '#06b6d4', // cyan
  '#e2e8f0', // white
];
const BRIGHT_COLORS = [
  '#475569',
  '#f87171',
  '#34d399',
  '#facc15',
  '#60a5fa',
  '#c084fc',
  '#22d3ee',
  '#f1f5f9',
];

// xterm 256 palette is approximated for codes ≥ 16: 16-231 = 6×6×6 cube,
// 232-255 = greyscale ramp. Faithfully matches the standard formula.
function xterm256(n: number): string {
  if (n < 16) return n < 8 ? BASE_COLORS[n]! : BRIGHT_COLORS[n - 8]!;
  if (n >= 232) {
    const v = 8 + (n - 232) * 10;
    return `rgb(${v},${v},${v})`;
  }
  const idx = n - 16;
  const r = Math.floor(idx / 36) % 6;
  const g = Math.floor(idx / 6) % 6;
  const b = idx % 6;
  const scale = (c: number) => (c === 0 ? 0 : 55 + c * 40);
  return `rgb(${scale(r)},${scale(g)},${scale(b)})`;
}

interface AnsiState {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
}

function stateToCss(s: AnsiState): CSSProperties {
  const style: CSSProperties = {};
  const fg = s.inverse ? s.bg : s.fg;
  const bg = s.inverse ? s.fg : s.bg;
  if (fg) style.color = fg;
  if (bg) style.backgroundColor = bg;
  if (s.bold) style.fontWeight = 700;
  if (s.dim) style.opacity = 0.75;
  if (s.italic) style.fontStyle = 'italic';
  if (s.underline) style.textDecoration = 'underline';
  return style;
}

// Applies a sequence of SGR parameters in-place onto `state`.
function applySgr(state: AnsiState, params: number[]): void {
  for (let i = 0; i < params.length; i++) {
    const code = params[i]!;
    if (code === 0) {
      for (const k of Object.keys(state) as (keyof AnsiState)[]) delete state[k];
      continue;
    }
    if (code === 1) { state.bold = true; continue; }
    if (code === 2) { state.dim = true; continue; }
    if (code === 3) { state.italic = true; continue; }
    if (code === 4) { state.underline = true; continue; }
    if (code === 7) { state.inverse = true; continue; }
    if (code === 22) { state.bold = false; state.dim = false; continue; }
    if (code === 23) { state.italic = false; continue; }
    if (code === 24) { state.underline = false; continue; }
    if (code === 27) { state.inverse = false; continue; }
    if (code >= 30 && code <= 37) { state.fg = BASE_COLORS[code - 30]; continue; }
    if (code === 39) { delete state.fg; continue; }
    if (code >= 40 && code <= 47) { state.bg = BASE_COLORS[code - 40]; continue; }
    if (code === 49) { delete state.bg; continue; }
    if (code >= 90 && code <= 97) { state.fg = BRIGHT_COLORS[code - 90]; continue; }
    if (code >= 100 && code <= 107) { state.bg = BRIGHT_COLORS[code - 100]; continue; }
    if (code === 38 || code === 48) {
      const target: 'fg' | 'bg' = code === 38 ? 'fg' : 'bg';
      const mode = params[i + 1];
      if (mode === 5 && params[i + 2] !== undefined) {
        state[target] = xterm256(params[i + 2]!);
        i += 2;
      } else if (mode === 2 && params[i + 4] !== undefined) {
        state[target] = `rgb(${params[i + 2]},${params[i + 3]},${params[i + 4]})`;
        i += 4;
      }
    }
    // anything else: silently ignore
  }
}

// CSI sequence: ESC [ params … final-byte. We only honor SGR (final=m); all
// other CSI sequences are dropped so cursor / erase codes don't pollute logs.
// eslint-disable-next-line no-control-regex
const CSI_RE = /\x1b\[([0-9;]*)([A-Za-z])/g;

export function renderAnsi(input: string): AnsiSegment[] {
  if (!input || !input.includes('\x1b')) {
    return [{ text: input ?? '', style: {} }];
  }
  const state: AnsiState = {};
  const segments: AnsiSegment[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CSI_RE.lastIndex = 0;
  while ((m = CSI_RE.exec(input))) {
    if (m.index > last) {
      segments.push({ text: input.slice(last, m.index), style: stateToCss(state) });
    }
    if (m[2] === 'm') {
      const params = m[1] ? m[1].split(';').map((p) => parseInt(p, 10) || 0) : [0];
      applySgr(state, params);
    }
    last = m.index + m[0].length;
  }
  if (last < input.length) {
    segments.push({ text: input.slice(last), style: stateToCss(state) });
  }
  // Merge contiguous segments with identical style to keep the DOM shallow.
  const merged: AnsiSegment[] = [];
  for (const seg of segments) {
    if (seg.text.length === 0) continue;
    const prev = merged[merged.length - 1];
    if (prev && sameStyle(prev.style, seg.style)) {
      prev.text += seg.text;
    } else {
      merged.push(seg);
    }
  }
  return merged.length > 0 ? merged : [{ text: '', style: {} }];
}

function sameStyle(a: CSSProperties, b: CSSProperties): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  for (const k of ak) {
    if ((a as Record<string, unknown>)[k] !== (b as Record<string, unknown>)[k]) return false;
  }
  return true;
}

// Convenience for callers that only want the plain text — e.g. log download.
// eslint-disable-next-line no-control-regex
const ANY_ESC_RE = /\x1b\[[0-9;]*[A-Za-z]/g;
export function stripAnsi(input: string): string {
  return input.replace(ANY_ESC_RE, '');
}
