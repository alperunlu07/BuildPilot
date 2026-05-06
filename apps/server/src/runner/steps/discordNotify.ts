import type { DiscordNotifyStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';

export async function runDiscordNotify(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<DiscordNotifyStepData>;
  if (!d.webhookUrl) throw new Error('discordNotify: missing "webhookUrl"');
  if (!d.content) throw new Error('discordNotify: missing "content"');

  ctx.log(`discord → ${maskUrl(d.webhookUrl)}`);
  ctx.log(d.content, 'stdout');

  const res = await fetch(d.webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: d.content }),
  });
  // Discord returns 204 No Content on success; treat any 2xx as ok.
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`discord returned ${res.status}: ${body.slice(0, 200)}`);
  }
}

function maskUrl(u: string): string {
  return u.replace(/(\/webhooks\/\d+\/)[^?]+/, '$1<redacted>');
}
