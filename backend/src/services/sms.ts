import { toE164IndianMobile } from "../utils/phone";

export interface SendSmsResult {
  success: boolean;
  provider: string;
  messageId?: string;
  error?: string;
}

interface SmsProvider {
  readonly name: string;
  sendOtp(toE164: string, otp: string, expiryMinutes: number): Promise<SendSmsResult>;
}

/**
 * Local-only provider. Enabled only when SMS_PROVIDER=console (never used automatically).
 */
class ConsoleSmsProvider implements SmsProvider {
  readonly name = "console";

  async sendOtp(toE164: string, otp: string, expiryMinutes: number): Promise<SendSmsResult> {
    // eslint-disable-next-line no-console
    console.info(
      `[sms:${this.name}] to=${toE164} otp=${otp} expiresInMinutes=${expiryMinutes}`
    );
    return { success: true, provider: this.name, messageId: `console-${Date.now()}` };
  }
}

/**
 * MSG91 Send OTP (v5). Required for real SMS delivery.
 * Docs: https://control.msg91.com/api/v5/otp
 */
class Msg91OtpProvider implements SmsProvider {
  readonly name = "msg91";

  constructor(
    private readonly authKey: string,
    private readonly templateId: string,
    private readonly senderId?: string
  ) {}

  async sendOtp(toE164: string, otp: string, expiryMinutes: number): Promise<SendSmsResult> {
    const mobile = toE164.replace(/\D/g, ""); // +9198… → 9198…
    const params = new URLSearchParams({
      template_id: this.templateId,
      mobile,
      otp,
      otp_expiry: String(Math.max(1, expiryMinutes)),
      otp_length: String(otp.length),
      realTimeResponse: "1"
    });
    if (this.senderId) {
      params.set("sender", this.senderId);
    }

    const url = `https://control.msg91.com/api/v5/otp?${params.toString()}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          authkey: this.authKey
        },
        body: JSON.stringify({ OTP: otp })
      });

      const payload = (await response.json().catch(() => ({}))) as {
        type?: string;
        message?: string;
        request_id?: string;
        code?: string | number;
      };

      const failed =
        !response.ok ||
        payload.type === "error" ||
        String(payload.code ?? "") === "201";

      if (failed) {
        return {
          success: false,
          provider: this.name,
          error: payload.message ?? `MSG91 HTTP ${response.status}`
        };
      }

      return {
        success: true,
        provider: this.name,
        messageId: payload.request_id
      };
    } catch (error) {
      return {
        success: false,
        provider: this.name,
        error: error instanceof Error ? error.message : "MSG91 request failed"
      };
    }
  }
}

class UnconfiguredSmsProvider implements SmsProvider {
  readonly name = "unconfigured";

  async sendOtp(): Promise<SendSmsResult> {
    return {
      success: false,
      provider: this.name,
      error:
        "SMS is not configured. Set MSG91_AUTH_KEY and MSG91_TEMPLATE_ID (or SMS_PROVIDER=console for local only)."
    };
  }
}

const resolveSmsProvider = (): SmsProvider => {
  const mode = process.env.SMS_PROVIDER?.trim().toLowerCase();

  if (mode === "console") {
    return new ConsoleSmsProvider();
  }

  const authKey = process.env.MSG91_AUTH_KEY?.trim();
  const templateId = process.env.MSG91_TEMPLATE_ID?.trim();
  if (authKey && templateId) {
    return new Msg91OtpProvider(
      authKey,
      templateId,
      process.env.MSG91_SENDER_ID?.trim() || undefined
    );
  }

  return new UnconfiguredSmsProvider();
};

let cachedProvider: SmsProvider | null = null;

const getSmsProvider = (): SmsProvider => {
  if (!cachedProvider) {
    cachedProvider = resolveSmsProvider();
  }
  return cachedProvider;
};

/** Test helper — clears cached provider so env changes take effect. */
export const resetSmsProviderForTests = (): void => {
  cachedProvider = null;
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
  return provider.sendOtp(toE164IndianMobile(tenDigitPhone), otp, minutes);
};
