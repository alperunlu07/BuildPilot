import type { EmailNotifyStepData } from '@buildpilot/shared-types';
import type { StepContext } from '../engine';
import { suppressForMatrixSummary } from './_matrixGuard';

// Loose ambient type so tsc passes whether nodemailer is installed or not.
// emailNotify is a Phase 3 step type — when the user actually wires it into
// a pipeline they're expected to `pnpm add nodemailer` in apps/server. The
// runtime path below dynamically imports nodemailer and surfaces a clear
// install hint if it's missing.
type NodemailerModule = {
  createTransport(opts: SmtpConfig): {
    sendMail(msg: EmailMessage): Promise<{ messageId: string; accepted: string[]; rejected: string[] }>;
  };
};

export interface EmailMessage {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
}

export interface SmtpConfig {
  host: string;
  port: number;
  // 'true' for port 465 (TLS-on-connect); 'false' for STARTTLS on 587.
  secure: boolean;
  auth: { user: string; pass: string };
}

function splitAddrs(s: string | undefined): string[] {
  if (!s || s.trim().length === 0) return [];
  return s
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function buildEmailMessage(d: Partial<EmailNotifyStepData>): EmailMessage {
  if (!d.from || d.from.trim().length === 0) {
    throw new Error('emailNotify: missing "from"');
  }
  const to = splitAddrs(d.to);
  if (to.length === 0) {
    throw new Error('emailNotify: at least one "to" address required');
  }
  if (!d.subject || d.subject.trim().length === 0) {
    throw new Error('emailNotify: missing "subject"');
  }
  const hasText = d.bodyText && d.bodyText.trim().length > 0;
  const hasHtml = d.bodyHtml && d.bodyHtml.trim().length > 0;
  if (!hasText && !hasHtml) {
    throw new Error('emailNotify: at least one of "bodyText" / "bodyHtml" is required');
  }
  const msg: EmailMessage = {
    from: d.from,
    to,
    subject: d.subject,
  };
  const cc = splitAddrs(d.cc);
  if (cc.length > 0) msg.cc = cc;
  const bcc = splitAddrs(d.bcc);
  if (bcc.length > 0) msg.bcc = bcc;
  if (hasText) msg.text = d.bodyText!;
  if (hasHtml) msg.html = d.bodyHtml!;
  return msg;
}

export function buildSmtpConfig(d: Partial<EmailNotifyStepData>): SmtpConfig {
  if (!d.smtpHost || d.smtpHost.trim().length === 0) {
    throw new Error('emailNotify: missing "smtpHost"');
  }
  const port = d.smtpPort ? Number(d.smtpPort) : 587;
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`emailNotify: invalid "smtpPort" ${d.smtpPort}`);
  }
  // Default: STARTTLS on 587 (most providers). 465 → secure-on-connect.
  const secure = d.smtpSecure
    ? d.smtpSecure === 'true'
    : port === 465;
  if (!d.smtpUser || !d.smtpPassword) {
    throw new Error('emailNotify: missing "smtpUser" / "smtpPassword"');
  }
  return {
    host: d.smtpHost,
    port,
    secure,
    auth: { user: d.smtpUser, pass: d.smtpPassword },
  };
}

export async function runEmailNotify(
  ctx: StepContext,
  data: Record<string, unknown>,
): Promise<void> {
  const d = data as Partial<EmailNotifyStepData>;
  const msg = buildEmailMessage(d);
  const cfg = buildSmtpConfig(d);

  if (suppressForMatrixSummary(ctx)) {
    ctx.log('emailNotify: skipped (matrix child — parent will send rolled-up summary)');
    return;
  }

  ctx.log(`smtp ${cfg.auth.user}@${cfg.host}:${cfg.port} ${cfg.secure ? '(TLS)' : '(STARTTLS)'}`);
  ctx.log(`→ ${msg.to.join(', ')}${msg.cc ? ` cc:${msg.cc.join(',')}` : ''}`);
  ctx.log(`subject: ${msg.subject}`);

  let nm: NodemailerModule;
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — optional dependency, resolved at runtime
    const mod = await import('nodemailer');
    nm = (mod as { default?: NodemailerModule }).default ?? (mod as NodemailerModule);
  } catch (err) {
    throw new Error(
      `emailNotify requires "nodemailer". Install with: pnpm --filter @buildpilot/server add nodemailer\nOriginal error: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const transporter = nm.createTransport(cfg);
  const info = await transporter.sendMail(msg);
  ctx.log(`sent ${info.messageId}`, 'success');
  if (info.rejected && info.rejected.length > 0) {
    ctx.log(`rejected: ${info.rejected.join(', ')}`, 'failure');
    throw new Error(`SMTP rejected ${info.rejected.length} recipient(s)`);
  }
}
