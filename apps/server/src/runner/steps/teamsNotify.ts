import type { TeamsNotifyStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

// Microsoft Teams supports two webhook surfaces:
//   - Legacy Office 365 connector: accepts `{ "text": "..." }` or a richer
//     "MessageCard" with title + themeColor + sections.
//   - Power Automate Workflow: accepts an Adaptive Card payload. Most teams
//     are migrating onto this since legacy connectors are being deprecated
//     in October 2025; users can paste either webhook URL.
//
// We support legacy `simple` (text-only) and `messageCard` (title + color)
// formats by default. For Power Automate workflows users can drop a raw
// Adaptive Card into the `text` field with format=`raw` and we forward it
// verbatim — they're already authoring JSON anyway.
export function buildTeamsPayload(
  d: Partial<TeamsNotifyStepData>,
): Record<string, unknown> {
  if (!d.text || d.text.trim().length === 0) {
    throw new Error('teamsNotify: missing "text"');
  }
  const format = d.format ?? 'simple';
  if (format === 'simple') {
    return { text: d.text };
  }
  if (format === 'messageCard') {
    const card: Record<string, unknown> = {
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: d.title ?? 'BuildPilot',
      text: d.text,
    };
    if (d.title) card.title = d.title;
    if (d.themeColor) card.themeColor = d.themeColor;
    return card;
  }
  if (format === 'raw') {
    try {
      const parsed = JSON.parse(d.text);
      if (typeof parsed !== 'object' || parsed === null) {
        throw new Error('parsed payload is not an object');
      }
      return parsed as Record<string, unknown>;
    } catch (err) {
      throw new Error(
        `teamsNotify: format=raw expects valid JSON in "text" — ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
  throw new Error(`teamsNotify: unknown format "${format}"`);
}

export async function runTeamsNotify(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<TeamsNotifyStepData>;
  if (!d.webhookUrl) throw new Error('teamsNotify: missing "webhookUrl"');
  const payload = buildTeamsPayload(d);

  ctx.log(`teams → ${maskUrl(d.webhookUrl)}`);
  ctx.log(d.text ?? '', 'stdout');

  const res = await fetch(d.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`teams returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

function maskUrl(u: string): string {
  // Teams legacy connector path: /webhookb2/<guid>@<guid>/IncomingWebhook/<guid>/<guid>
  // Power Automate: /workflows/<guid>/triggers/<name>/...
  return u.replace(/(\/webhookb2\/|\/workflows\/)[^?]+/, '$1<redacted>');
}
