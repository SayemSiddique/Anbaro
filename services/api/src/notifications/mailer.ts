/**
 * Transactional email via Postmark's HTTP API. When POSTMARK_SERVER_TOKEN is
 * unset (local dev, CI, and while a Postmark account is still being provisioned)
 * the default transport logs and skips, so every email-backed flow — invitations,
 * password reset, verification, alert delivery — stays exercisable without a
 * provider. Set the token in production to start real delivery; no code changes.
 */
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'Anbaro <no-reply@anbaro.app>';
const WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';

export type EmailMessage = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
  /** Postmark message stream; alerts should use a broadcast stream if configured. */
  messageStream?: string;
};

export type MailTransport = (message: EmailMessage) => Promise<{ delivered: boolean }>;

const postmarkTransport: MailTransport = async (message) => {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  if (!token) {
    console.info(
      `[mailer] POSTMARK_SERVER_TOKEN unset — skipping "${message.subject}" to ${message.to}`,
    );
    return { delivered: false };
  }
  const response = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: EMAIL_FROM,
      To: message.to,
      Subject: message.subject,
      TextBody: message.textBody,
      ...(message.htmlBody ? { HtmlBody: message.htmlBody } : {}),
      MessageStream: message.messageStream ?? 'outbound',
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`Postmark send failed (${response.status}): ${detail}`);
  }
  return { delivered: true };
};

let transport: MailTransport = postmarkTransport;

/** Swap the transport (tests capture sent mail; production keeps Postmark). */
export function setMailTransport(next: MailTransport | null): void {
  transport = next ?? postmarkTransport;
}

export function sendEmail(message: EmailMessage): Promise<{ delivered: boolean }> {
  return transport(message);
}

function webUrl(path: string): string {
  return `${WEB_ORIGIN.replace(/\/$/, '')}${path}`;
}

export function sendInvitationEmail(input: {
  to: string;
  organizationName: string;
  acceptanceToken: string;
}): Promise<{ delivered: boolean }> {
  const link = webUrl(`/invite?token=${encodeURIComponent(input.acceptanceToken)}`);
  return sendEmail({
    to: input.to,
    subject: `You've been invited to ${input.organizationName} on Anbaro`,
    textBody: `You've been invited to join ${input.organizationName} on Anbaro.\n\nAccept your invitation:\n${link}\n\nThis link expires in 7 days. If you weren't expecting this, you can ignore this email.`,
  });
}

export function sendPasswordResetEmail(input: {
  to: string;
  name: string;
  resetToken: string;
}): Promise<{ delivered: boolean }> {
  const link = webUrl(`/reset-password?token=${encodeURIComponent(input.resetToken)}`);
  return sendEmail({
    to: input.to,
    subject: 'Reset your Anbaro password',
    textBody: `Hi ${input.name},\n\nReset your Anbaro password:\n${link}\n\nThis link expires in 1 hour. If you didn't request this, you can safely ignore this email — your password is unchanged.`,
  });
}

export function sendVerificationEmail(input: {
  to: string;
  name: string;
  verificationToken: string;
}): Promise<{ delivered: boolean }> {
  const link = webUrl(`/verify-email?token=${encodeURIComponent(input.verificationToken)}`);
  return sendEmail({
    to: input.to,
    subject: 'Verify your Anbaro email',
    textBody: `Hi ${input.name},\n\nConfirm your email address for Anbaro:\n${link}\n\nThis link expires in 24 hours.`,
  });
}
