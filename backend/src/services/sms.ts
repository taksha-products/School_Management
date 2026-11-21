import { toE164IndianMobile } from "../utils/phone";

export interface SendSmsResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

export interface SmsProvider {
  readonly name: string;
  sendSms(toE164: string, body: string): Promise<SendSmsResult>;
}

/**
 * Development / fallback provider — logs the message instead of sending SMS.
 */
class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";

  async sendSms(toE164: string, body: string): Promise<SendSmsResult> {
    // eslint-disable-next-line no-console
    console.info(`[sms:${this.name}] to=${toE164} body=${body}`);
    return { success: true, provider: this.name, messageId: `console-${Date.now()}` };
  }
}

/**
 * Twilio REST API provider (no SDK dependency). Enabled when TWILIO_* env vars are set.
 */
class TwilioSmsProvider implements SmsProvider {
  readonly name = "twilio";

  constructor(
    private readonly accountSid: string,
    private readonly authToken: string,
    private readonly fromNumber: string
  ) {}

  async sendSms(toE164: string, body: string): Promise<SendSmsResult> {
    const url = `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const credentials = Buffer.from(`${this.accountSid}:${this.authToken}`).toString("base64");

    const form = new URLSearchParams({
      To: toE164,
      From: this.fromNumber,
      Body: body
    });

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: form.toString()
      });

      const payload = (await response.json()) as { sid?: string; message?: string; error_message?: string };

      if (!response.ok) {
        return {
          success: false,
          provider: this.name,
          error: payload.error_message ?? payload.message ?? `Twilio HTTP ${response.status}`
        };
      }

      return { success: true, provider: this.name, messageId: payload.sid };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "Twilio request failed"
      };
    }
  }
}

const resolveSmsProvider = (): SmsProvider => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_FROM_NUMBER?.trim();

  if (accountSid && authToken && fromNumber) {
    return new TwilioSmsProvider(accountSid, authToken, fromNumber);
  }

  return new ConsoleSmsProvider();
};

let cachedProvider: SmsProvider | null = null;

const getSmsProvider = (): SmsProvider => {
  if (!cachedProvider) {
    cachedProvider = resolveSmsProvider();
  }
  return cachedProvider;
};

/**
 * Sends a parent login OTP SMS to a normalized 10-digit Indian mobile.
 */
export const sendParentLoginOtp = async (
  tenDigitPhone: string,
  otp: string
): Promise<SendSmsResult> => {
  const provider = getSmsProvider();
  const minutes = Math.max(1, Math.round(Number(process.env.OTP_TTL_SECONDS ?? 300) / 60));
  const body = `Your Taksha login OTP is ${otp}. Valid for ${minutes} minute(s). Do not share this code.`;

  return provider.sendSms(toE164IndianMobile(tenDigitPhone), body);
};
