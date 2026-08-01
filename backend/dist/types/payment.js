"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapRazorpayMethodToPaymentMode = exports.PAYMENT_MODE_VALUES = void 0;
exports.PAYMENT_MODE_VALUES = [
    "cash",
    "upi_office",
    "upi_online",
    "card",
    "netbanking",
    "cheque",
    "other",
    "upi",
    "online"
];
/**
 * Maps Razorpay payment method to internal payment mode.
 */
const mapRazorpayMethodToPaymentMode = (method, isOfficeQr) => {
    if (isOfficeQr && method === "upi") {
        return "upi_office";
    }
    switch (method) {
        case "upi":
            return "upi_online";
        case "card":
            return "card";
        case "netbanking":
            return "netbanking";
        case "wallet":
            return "other";
        default:
            return "other";
    }
};
exports.mapRazorpayMethodToPaymentMode = mapRazorpayMethodToPaymentMode;
