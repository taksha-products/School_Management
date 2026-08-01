import crypto from "crypto";

import axios, { isAxiosError } from "axios";
import Razorpay from "razorpay";

export interface CreateOrderOptions {
  amount: number;
  currency: "INR";
  receipt: string;
  notes: Record<string, string>;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  receipt: string;
  status: string;
}

export interface RazorpayPaymentDetails {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method: string;
  email: string;
  contact: string;
  description: string;
  notes: Record<string, string>;
}

interface RazorpayApiErrorBody {
  error?: { description?: string; reason?: string; code?: string };
}

interface RazorpayQrCreateResponse {
  id: string;
  image_url: string;
  close_by: number;
}

interface RazorpayQrCodeEntity {
  id: string;
  image_url: string;
  close_by: number;
  status: "active" | "closed";
  payment_amount?: number;
  payments_amount_received?: number;
}

let razorpayInstance: Razorpay | null = null;

const getRazorpayCredentials = (): { keyId: string; keySecret: string } => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    throw new Error("Razorpay credentials are not configured");
  }

  return { keyId, keySecret };
};

const parseRazorpayError = (error: unknown): string => {
  if (isAxiosError(error)) {
    const data = error.response?.data as RazorpayApiErrorBody | undefined;
    return (
      data?.error?.description ??
      data?.error?.reason ??
      error.message
    );
  }

  const razorpayError = error as {
    error?: { description?: string; reason?: string; code?: string };
    statusCode?: number;
  };
  return (
    razorpayError.error?.description ??
    razorpayError.error?.reason ??
    (error instanceof Error ? error.message : "Razorpay request failed")
  );
};

const getBasicAuthHeader = (): string => {
  const { keyId, keySecret } = getRazorpayCredentials();
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
};

const getRazorpay = (): Razorpay => {
  const { keyId, keySecret } = getRazorpayCredentials();

  if (!razorpayInstance) {
    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  }

  return razorpayInstance;
};

/**
 * Creates a Razorpay order for online checkout.
 */
export const createOrder = async (options: CreateOrderOptions): Promise<RazorpayOrder> => {
  try {
    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: options.amount,
      currency: options.currency,
      receipt: options.receipt.slice(0, 40),
      notes: options.notes
    });

    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      receipt: order.receipt ?? options.receipt,
      status: order.status
    };
  } catch (error: unknown) {
    const message = parseRazorpayError(error);

    console.error("Razorpay createOrder failed:", {
      message,
      code: (error as RazorpayApiErrorBody).error?.code
    });

    const wrapped = new Error(message) as Error & { statusCode?: number };
    wrapped.statusCode = 502;
    throw wrapped;
  }
};

export interface UpiQrResult {
  qrCodeUrl: string;
  qrCodeId: string;
  expiresAt: number;
}

/**
 * Creates a single-use UPI QR code for in-office collection (works in test mode).
 */
export const createUpiQr = async (options: {
  amount: number;
  description: string;
  notes?: Record<string, string>;
  expiryMinutes?: number;
}): Promise<UpiQrResult> => {
  const { amount, description, notes = {}, expiryMinutes = 15 } = options;
  const closeBy = Math.floor(Date.now() / 1000) + expiryMinutes * 60;

  try {
    const response = await axios.post<RazorpayQrCreateResponse>(
      "https://api.razorpay.com/v1/payments/qr_codes",
      {
        type: "upi_qr",
        name: "Fee Payment",
        usage: "single_use",
        fixed_amount: true,
        payment_amount: amount,
        description: description.slice(0, 255),
        close_by: closeBy,
        notes
      },
      {
        headers: {
          Authorization: getBasicAuthHeader(),
          "Content-Type": "application/json"
        }
      }
    );

    return {
      qrCodeId: response.data.id,
      qrCodeUrl: response.data.image_url,
      expiresAt: response.data.close_by
    };
  } catch (error: unknown) {
    const message = parseRazorpayError(error);
    console.error("Razorpay createUpiQr failed:", message);
    throw new Error(message);
  }
};

/**
 * Fetches a QR code entity from Razorpay (status, payments received, etc.).
 */
export const fetchQrCode = async (qrCodeId: string): Promise<RazorpayQrCodeEntity> => {
  try {
    const response = await axios.get<RazorpayQrCodeEntity>(
      `https://api.razorpay.com/v1/payments/qr_codes/${qrCodeId}`,
      {
        headers: {
          Authorization: getBasicAuthHeader()
        }
      }
    );
    return response.data;
  } catch (error: unknown) {
    const message = parseRazorpayError(error);
    console.error("Razorpay fetchQrCode failed:", message);
    throw new Error(message);
  }
};

/**
 * Returns true when Razorpay reports the QR has received payment.
 */
export const isQrCodePaidOnRazorpay = (qr: RazorpayQrCodeEntity): boolean => {
  if (qr.status === "closed") {
    return true;
  }
  return (qr.payments_amount_received ?? 0) >= (qr.payment_amount ?? 0) && (qr.payment_amount ?? 0) > 0;
};

/**
 * Verifies a Razorpay webhook signature using the raw request body.
 */
export const verifyWebhookSignature = (
  rawBody: string,
  signature: string,
  webhookSecret: string
): boolean => {
  const expected = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
};

/**
 * Verifies the payment signature returned after Razorpay checkout on the client.
 */
export const verifyPaymentSignature = (params: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}): boolean => {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) {
    return false;
  }

  const body = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
  const expected = crypto.createHmac("sha256", keySecret).update(body).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(params.razorpaySignature));
  } catch {
    return false;
  }
};

/**
 * Fetches payment details from the Razorpay API.
 */
export const fetchPayment = async (razorpayPaymentId: string): Promise<RazorpayPaymentDetails> => {
  try {
    const razorpay = getRazorpay();
    const payment = await razorpay.payments.fetch(razorpayPaymentId);

    const notes: Record<string, string> = {};
    if (payment.notes && typeof payment.notes === "object") {
      for (const [key, value] of Object.entries(payment.notes)) {
        if (typeof value === "string") {
          notes[key] = value;
        }
      }
    }

    return {
      id: String(payment.id),
      amount: Number(payment.amount),
      currency: payment.currency,
      status: payment.status,
      method: payment.method ?? "other",
      email: String(payment.email ?? ""),
      contact: String(payment.contact ?? ""),
      description: String(payment.description ?? ""),
      notes
    };
  } catch (error) {
    console.error("Razorpay fetchPayment failed:", error instanceof Error ? error.message : error);
    throw error;
  }
};

/** Returns the public Razorpay key id (safe for frontend). */
export const getRazorpayKeyId = (): string => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  if (!keyId) {
    throw new Error("RAZORPAY_KEY_ID is not configured");
  }
  return keyId;
};
