"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getRazorpayKeyId = exports.fetchPayment = exports.verifyPaymentSignature = exports.verifyWebhookSignature = exports.isQrCodePaidOnRazorpay = exports.fetchQrCode = exports.createUpiQr = exports.createOrder = void 0;
const crypto_1 = __importDefault(require("crypto"));
const axios_1 = __importStar(require("axios"));
const razorpay_1 = __importDefault(require("razorpay"));
let razorpayInstance = null;
const getRazorpayCredentials = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keyId || !keySecret) {
        throw new Error("Razorpay credentials are not configured");
    }
    return { keyId, keySecret };
};
const parseRazorpayError = (error) => {
    if ((0, axios_1.isAxiosError)(error)) {
        const data = error.response?.data;
        return (data?.error?.description ??
            data?.error?.reason ??
            error.message);
    }
    const razorpayError = error;
    return (razorpayError.error?.description ??
        razorpayError.error?.reason ??
        (error instanceof Error ? error.message : "Razorpay request failed"));
};
const getBasicAuthHeader = () => {
    const { keyId, keySecret } = getRazorpayCredentials();
    return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`;
};
const getRazorpay = () => {
    const { keyId, keySecret } = getRazorpayCredentials();
    if (!razorpayInstance) {
        razorpayInstance = new razorpay_1.default({
            key_id: keyId,
            key_secret: keySecret
        });
    }
    return razorpayInstance;
};
/**
 * Creates a Razorpay order for online checkout.
 */
const createOrder = async (options) => {
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
    }
    catch (error) {
        const message = parseRazorpayError(error);
        console.error("Razorpay createOrder failed:", {
            message,
            code: error.error?.code
        });
        const wrapped = new Error(message);
        wrapped.statusCode = 502;
        throw wrapped;
    }
};
exports.createOrder = createOrder;
/**
 * Creates a single-use UPI QR code for in-office collection (works in test mode).
 */
const createUpiQr = async (options) => {
    const { amount, description, notes = {}, expiryMinutes = 15 } = options;
    const closeBy = Math.floor(Date.now() / 1000) + expiryMinutes * 60;
    try {
        const response = await axios_1.default.post("https://api.razorpay.com/v1/payments/qr_codes", {
            type: "upi_qr",
            name: "Fee Payment",
            usage: "single_use",
            fixed_amount: true,
            payment_amount: amount,
            description: description.slice(0, 255),
            close_by: closeBy,
            notes
        }, {
            headers: {
                Authorization: getBasicAuthHeader(),
                "Content-Type": "application/json"
            }
        });
        return {
            qrCodeId: response.data.id,
            qrCodeUrl: response.data.image_url,
            expiresAt: response.data.close_by
        };
    }
    catch (error) {
        const message = parseRazorpayError(error);
        console.error("Razorpay createUpiQr failed:", message);
        throw new Error(message);
    }
};
exports.createUpiQr = createUpiQr;
/**
 * Fetches a QR code entity from Razorpay (status, payments received, etc.).
 */
const fetchQrCode = async (qrCodeId) => {
    try {
        const response = await axios_1.default.get(`https://api.razorpay.com/v1/payments/qr_codes/${qrCodeId}`, {
            headers: {
                Authorization: getBasicAuthHeader()
            }
        });
        return response.data;
    }
    catch (error) {
        const message = parseRazorpayError(error);
        console.error("Razorpay fetchQrCode failed:", message);
        throw new Error(message);
    }
};
exports.fetchQrCode = fetchQrCode;
/**
 * Returns true when Razorpay reports the QR has received payment.
 */
const isQrCodePaidOnRazorpay = (qr) => {
    if (qr.status === "closed") {
        return true;
    }
    return (qr.payments_amount_received ?? 0) >= (qr.payment_amount ?? 0) && (qr.payment_amount ?? 0) > 0;
};
exports.isQrCodePaidOnRazorpay = isQrCodePaidOnRazorpay;
/**
 * Verifies a Razorpay webhook signature using the raw request body.
 */
const verifyWebhookSignature = (rawBody, signature, webhookSecret) => {
    const expected = crypto_1.default.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    }
    catch {
        return false;
    }
};
exports.verifyWebhookSignature = verifyWebhookSignature;
/**
 * Verifies the payment signature returned after Razorpay checkout on the client.
 */
const verifyPaymentSignature = (params) => {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    if (!keySecret) {
        return false;
    }
    const body = `${params.razorpayOrderId}|${params.razorpayPaymentId}`;
    const expected = crypto_1.default.createHmac("sha256", keySecret).update(body).digest("hex");
    try {
        return crypto_1.default.timingSafeEqual(Buffer.from(expected), Buffer.from(params.razorpaySignature));
    }
    catch {
        return false;
    }
};
exports.verifyPaymentSignature = verifyPaymentSignature;
/**
 * Fetches payment details from the Razorpay API.
 */
const fetchPayment = async (razorpayPaymentId) => {
    try {
        const razorpay = getRazorpay();
        const payment = await razorpay.payments.fetch(razorpayPaymentId);
        const notes = {};
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
    }
    catch (error) {
        console.error("Razorpay fetchPayment failed:", error instanceof Error ? error.message : error);
        throw error;
    }
};
exports.fetchPayment = fetchPayment;
/** Returns the public Razorpay key id (safe for frontend). */
const getRazorpayKeyId = () => {
    const keyId = process.env.RAZORPAY_KEY_ID;
    if (!keyId) {
        throw new Error("RAZORPAY_KEY_ID is not configured");
    }
    return keyId;
};
exports.getRazorpayKeyId = getRazorpayKeyId;
