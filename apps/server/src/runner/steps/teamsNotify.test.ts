import { describe, expect, it } from 'vitest';
import { buildTeamsPayload } from './teamsNotify';

describe('buildTeamsPayload', () => {
  it('builds a simple text payload by default', () => {
    expect(buildTeamsPayload({ text: 'hello' })).toEqual({ text: 'hello' });
  });

  it('builds a MessageCard with title and themeColor', () => {
    const payload = buildTeamsPayload({
      format: 'messageCard',
      title: 'Build #42 succeeded',
      text: 'All steps green.',
      themeColor: '00FF00',
    });
    expect(payload).toMatchObject({
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: 'Build #42 succeeded',
      title: 'Build #42 succeeded',
      text: 'All steps green.',
      themeColor: '00FF00',
    });
  });

  it('forwards raw Adaptive Card JSON verbatim', () => {
    const card = {
      type: 'AdaptiveCard',
      version: '1.5',
      body: [{ type: 'TextBlock', text: 'hi' }],
    };
    const payload = buildTeamsPayload({ format: 'raw', text: JSON.stringify(card) });
    expect(payload).toEqual(card);
  });

  it('throws when text is missing', () => {
    expect(() => buildTeamsPayload({})).toThrow(/text/);
  });

  it('throws when raw format receives non-JSON', () => {
    expect(() => buildTeamsPayload({ format: 'raw', text: 'not-json' })).toThrow(/raw/);
  });

  it('messageCard works without optional fields', () => {
    const payload = buildTeamsPayload({ format: 'messageCard', text: 'plain' });
    expect(payload).toMatchObject({
      '@type': 'MessageCard',
      summary: 'BuildPilot',
      text: 'plain',
    });
    expect((payload as Record<string, unknown>).title).toBeUndefined();
  });
});
