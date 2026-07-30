import "server-only";

/**
 * SMS + WhatsApp via Termii (Nigerian provider). Degrades gracefully when
 * TERMII_API_KEY is unset. Phone numbers are normalized to international format
 * (Termii expects e.g. 2348012345678 for a Nigerian number).
 */

const TERMII_SMS_ENDPOINT = "https://api.ng.termii.com/api/sms/send";

export function isSmsConfigured(): boolean {
  return Boolean(process.env.TERMII_API_KEY);
}

/** Normalize a Nigerian number to Termii's format (drop +, convert 0-prefix → 234). */
export function normalizeNgPhone(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}

type Channel = "generic" | "whatsapp";

async function termiiSend(
  to: string,
  message: string,
  channel: Channel
): Promise<{ sent: boolean }> {
  if (!isSmsConfigured()) {
    console.info(`[sms:${channel}] (not configured) would send to ${to}: ${message.slice(0, 60)}…`);
    return { sent: false };
  }
  try {
    const res = await fetch(TERMII_SMS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: process.env.TERMII_API_KEY,
        to: normalizeNgPhone(to),
        from: process.env.TERMII_SENDER_ID ?? "EventMerge",
        sms: message,
        type: "plain",
        channel,
      }),
    });
    if (!res.ok) {
      console.error(`[sms:${channel}] Termii error`, res.status, await res.text().catch(() => ""));
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    console.error(`[sms:${channel}]`, (error as Error).message);
    return { sent: false };
  }
}

export function sendSms(to: string, message: string): Promise<{ sent: boolean }> {
  return termiiSend(to, message, "generic");
}

export function sendWhatsApp(to: string, message: string): Promise<{ sent: boolean }> {
  return termiiSend(to, message, "whatsapp");
}
