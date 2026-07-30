import "server-only";

/**
 * Email via Resend. Degrades gracefully: if RESEND_API_KEY is unset we log the
 * intent and return `{ sent: false }` instead of throwing, so ticket issuance is
 * never blocked by notification config.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    console.info(`[email] (not configured) would send "${params.subject}" to ${params.to}`);
    return { sent: false };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM ?? "EventMerge <onboarding@resend.dev>",
        to: params.to,
        subject: params.subject,
        html: params.html,
      }),
    });
    if (!res.ok) {
      console.error("[email] Resend error", res.status, await res.text().catch(() => ""));
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    console.error("[email]", (error as Error).message);
    return { sent: false };
  }
}
