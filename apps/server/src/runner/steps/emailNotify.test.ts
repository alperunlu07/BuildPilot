import { describe, expect, it } from 'vitest';
import { buildEmailMessage, buildSmtpConfig } from './emailNotify';

describe('buildEmailMessage', () => {
  it('builds a minimal text message with single recipient', () => {
    const msg = buildEmailMessage({
      from: 'ci@example.com',
      to: 'team@example.com',
      subject: 'Build #42 ok',
      bodyText: 'all green',
    });
    expect(msg).toEqual({
      from: 'ci@example.com',
      to: ['team@example.com'],
      subject: 'Build #42 ok',
      text: 'all green',
    });
  });

  it('splits comma / semicolon / whitespace separated recipient lists', () => {
    const msg = buildEmailMessage({
      from: 'ci@example.com',
      to: 'a@x.com, b@x.com;c@x.com d@x.com',
      subject: 's',
      bodyText: 'b',
    });
    expect(msg.to).toEqual(['a@x.com', 'b@x.com', 'c@x.com', 'd@x.com']);
  });

  it('includes optional cc / bcc / html', () => {
    const msg = buildEmailMessage({
      from: 'ci@example.com',
      to: 'team@x.com',
      cc: 'lead@x.com',
      bcc: 'audit@x.com',
      subject: 's',
      bodyHtml: '<p>green</p>',
    });
    expect(msg.cc).toEqual(['lead@x.com']);
    expect(msg.bcc).toEqual(['audit@x.com']);
    expect(msg.html).toBe('<p>green</p>');
    expect(msg.text).toBeUndefined();
  });

  it('allows both text and html', () => {
    const msg = buildEmailMessage({
      from: 'ci@x.com',
      to: 'team@x.com',
      subject: 's',
      bodyText: 'plain',
      bodyHtml: '<b>rich</b>',
    });
    expect(msg.text).toBe('plain');
    expect(msg.html).toBe('<b>rich</b>');
  });

  it('throws on missing from / to / subject / body', () => {
    expect(() => buildEmailMessage({})).toThrow(/from/);
    expect(() => buildEmailMessage({ from: 'a@x.com' })).toThrow(/to/);
    expect(() => buildEmailMessage({ from: 'a@x.com', to: 'b@x.com' })).toThrow(/subject/);
    expect(() =>
      buildEmailMessage({ from: 'a@x.com', to: 'b@x.com', subject: 's' }),
    ).toThrow(/bodyText.*bodyHtml/);
  });
});

describe('buildSmtpConfig', () => {
  it('defaults to STARTTLS on port 587', () => {
    const cfg = buildSmtpConfig({
      smtpHost: 'smtp.example.com',
      smtpUser: 'u',
      smtpPassword: 'p',
    });
    expect(cfg).toEqual({
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      auth: { user: 'u', pass: 'p' },
    });
  });

  it('switches to secure-on-connect for port 465', () => {
    const cfg = buildSmtpConfig({
      smtpHost: 'smtp.example.com',
      smtpPort: 465,
      smtpUser: 'u',
      smtpPassword: 'p',
    });
    expect(cfg.secure).toBe(true);
    expect(cfg.port).toBe(465);
  });

  it('honours explicit smtpSecure override', () => {
    const cfg = buildSmtpConfig({
      smtpHost: 'smtp.example.com',
      smtpPort: 2525,
      smtpSecure: 'true',
      smtpUser: 'u',
      smtpPassword: 'p',
    });
    expect(cfg.secure).toBe(true);
  });

  it('rejects out-of-range ports', () => {
    expect(() =>
      buildSmtpConfig({
        smtpHost: 'smtp.example.com',
        smtpPort: 99999,
        smtpUser: 'u',
        smtpPassword: 'p',
      }),
    ).toThrow(/smtpPort/);
  });

  it('throws on missing host or credentials', () => {
    expect(() => buildSmtpConfig({})).toThrow(/smtpHost/);
    expect(() => buildSmtpConfig({ smtpHost: 'a' })).toThrow(/smtpUser/);
  });
});
