"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { ReceiptDownload } from "@/components/payments/ReceiptDownload";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useRazorpay, type RazorpayResponse } from "@/hooks/useRazorpay";
import {
  createPaymentOrder,
  createUpiQr,
  getQrStatus,
  recordCashPayment,
  verifyPayment,
  type FeeType
} from "@/lib/payments";
import { formatINR } from "@/lib/utils";

type TabId = "online" | "upi" | "cash";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  studentName: string;
  studentId: string;
  feePaymentId: string;
  feeType: FeeType;
  amount: number;
  description: string;
  onSuccess: (receiptNumber: string) => void;
  schoolReceiptPath?: string;
}

export const PaymentModeModal = ({
  isOpen,
  onClose,
  studentName,
  studentId,
  feePaymentId,
  feeType,
  amount,
  description,
  onSuccess,
  schoolReceiptPath
}: Props): JSX.Element | null => {
  const { showToast } = useToast();
  const { isLoaded, openCheckout } = useRazorpay();

  const [tab, setTab] = useState<TabId>("online");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [qrPaid, setQrPaid] = useState(false);
  const [qrReceipt, setQrReceipt] = useState<string | null>(null);

  const [cashAmount, setCashAmount] = useState(amount);
  const [cashNotes, setCashNotes] = useState("");
  const [successReceipt, setSuccessReceipt] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetState = useCallback(() => {
    setTab("online");
    setLoading(false);
    setError(null);
    setQrCodeUrl(null);
    setCountdown(0);
    setQrPaid(false);
    setQrReceipt(null);
    setCashAmount(amount);
    setCashNotes("");
    setSuccessReceipt(null);
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, [amount]);

  useEffect(() => {
    if (!isOpen) {
      resetState();
    } else {
      setCashAmount(amount);
    }
  }, [isOpen, amount, resetState]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const handleClose = (): void => {
    resetState();
    onClose();
  };

  const handleOnlinePayment = async (): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      const order = await createPaymentOrder(feeType, feePaymentId, amount);
      if (!isLoaded) {
        setError("Payment system is still loading. Please try again.");
        setLoading(false);
        return;
      }

      openCheckout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "BusTrack",
        description,
        theme: { color: "#ea580c" },
        handler: async (response: RazorpayResponse) => {
          setLoading(true);
          try {
            const verified = await verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              feeType,
              feePaymentId
            });
            setSuccessReceipt(verified.receiptNumber);
            showToast("success", "Payment successful");
            onSuccess(verified.receiptNumber);
          } catch {
            setError("Payment verification failed, contact school");
            showToast("error", "Payment verification failed, contact school");
          } finally {
            setLoading(false);
          }
        },
        modal: {
          ondismiss: () => setLoading(false)
        }
      });
    } catch {
      setError("Could not initiate payment, please try again");
      showToast("error", "Could not initiate payment, please try again");
    } finally {
      setLoading(false);
    }
  };

  const startQrPolling = (id: string): void => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const status = await getQrStatus(id);
        if (status.status === "paid" && status.receiptNumber) {
          if (pollRef.current) clearInterval(pollRef.current);
          if (countdownRef.current) clearInterval(countdownRef.current);
          setQrPaid(true);
          setQrReceipt(status.receiptNumber);
          showToast("success", "Payment received!");
          onSuccess(status.receiptNumber);
          setTimeout(() => handleClose(), 2000);
        }
      } catch {
        // keep polling
      }
    }, 3000);
  };

  const startCountdownFromExpiry = (expiresAt: number): void => {
    const tick = (): void => {
      const remaining = Math.max(0, expiresAt - Math.floor(Date.now() / 1000));
      setCountdown(remaining);
      if (remaining === 0) {
        if (countdownRef.current) clearInterval(countdownRef.current);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };
    tick();
    if (countdownRef.current) clearInterval(countdownRef.current);
    countdownRef.current = setInterval(tick, 1000);
  };

  const handleGenerateQr = async (): Promise<void> => {
    setError(null);
    setLoading(true);
    setQrPaid(false);
    setQrReceipt(null);
    try {
      const qr = await createUpiQr(feeType, feePaymentId, amount);
      setQrCodeUrl(qr.qrCodeUrl);
      startCountdownFromExpiry(qr.expiresAt);
      startQrPolling(qr.qrCodeId);
    } catch {
      setError("Could not generate UPI QR code. Please try again.");
      showToast("error", "Could not generate UPI QR code");
    } finally {
      setLoading(false);
    }
  };

  const handleRecordCash = async (): Promise<void> => {
    setError(null);
    setLoading(true);
    try {
      const result = await recordCashPayment({
        feeType,
        feePaymentId,
        amount: feeType === "school" ? amount : cashAmount,
        notes: cashNotes || undefined
      });
      setSuccessReceipt(result.receiptNumber);
      showToast("success", "Cash payment recorded");
      onSuccess(result.receiptNumber);
    } catch {
      setError("Failed to record cash payment. Please try again.");
      showToast("error", "Failed to record cash payment");
    } finally {
      setLoading(false);
    }
  };

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: "online", label: "Online" },
    { id: "upi", label: "UPI QR (Office)" },
    { id: "cash", label: "Cash" }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Collect Payment"
      size="large"
      footer={
        successReceipt ? (
          <ReceiptDownload
            feeType={feeType}
            receiptNumber={successReceipt}
            paymentId={feeType === "transport" ? feePaymentId : undefined}
            schoolReceiptPath={schoolReceiptPath}
          />
        ) : undefined
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <p className="font-medium text-slate-900">{studentName}</p>
          <p className="text-slate-600">{description}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{formatINR(amount)}</p>
        </div>

        {error && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </p>
        )}

        {successReceipt ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-3 text-sm text-emerald-800">
            Payment recorded successfully. Receipt: {successReceipt}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 pb-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    tab === t.id
                      ? "bg-primary text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  onClick={() => {
                    setTab(t.id);
                    setError(null);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "online" && (
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Parent pays via card, UPI, or netbanking through Razorpay checkout.
                </p>
                <Button
                  className="w-full"
                  disabled={loading || !isLoaded}
                  onClick={handleOnlinePayment}
                >
                  {loading ? "Please wait..." : "Proceed to Online Payment"}
                </Button>
              </div>
            )}

            {tab === "upi" && (
              <div className="space-y-3">
                {!qrCodeUrl ? (
                  <>
                    <p className="text-sm text-slate-600">
                      Generate a QR code for the parent to scan at the school office.
                    </p>
                    <Button className="w-full" disabled={loading} onClick={handleGenerateQr}>
                      {loading ? "Generating..." : "Generate UPI QR Code"}
                    </Button>
                  </>
                ) : (
                  <>
                    {qrPaid ? (
                      <div className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-center text-emerald-800">
                        ✓ Payment received!
                      </div>
                    ) : countdown === 0 ? (
                      <div className="space-y-2 text-center">
                        <p className="text-sm text-amber-700">QR expired — generate a new one</p>
                        <Button variant="secondary" disabled={loading} onClick={handleGenerateQr}>
                          Regenerate QR
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-center">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={qrCodeUrl}
                            alt="UPI QR Code"
                            width={220}
                            height={220}
                            className="rounded-lg border border-slate-200"
                          />
                        </div>
                        <p className="text-center text-sm text-slate-600">
                          Ask parent to scan this QR with any UPI app
                        </p>
                        <p className="text-center text-sm font-medium text-slate-700">
                          Expires in {Math.floor(countdown / 60)}:
                          {String(countdown % 60).padStart(2, "0")}
                        </p>
                      </>
                    )}
                    {qrReceipt && (
                      <p className="text-center text-sm text-emerald-700">
                        Receipt: {qrReceipt}
                      </p>
                    )}
                    <Button variant="secondary" className="w-full" onClick={handleClose}>
                      Cancel
                    </Button>
                  </>
                )}
              </div>
            )}

            {tab === "cash" && (
              <div className="space-y-3">
                <label className="block text-sm">
                  Amount
                  <input
                    type="number"
                    min={0}
                    step={0.01}
                    readOnly={feeType === "school"}
                    className="mt-1 w-full rounded border border-slate-200 px-3 py-2 read-only:bg-slate-50"
                    value={feeType === "school" ? amount : cashAmount}
                    onChange={(e) => setCashAmount(Number(e.target.value))}
                  />
                </label>
                <label className="block text-sm">
                  Notes (optional)
                  <textarea
                    className="mt-1 w-full rounded border border-slate-200 px-3 py-2"
                    rows={2}
                    placeholder="e.g. Received from father"
                    value={cashNotes}
                    onChange={(e) => setCashNotes(e.target.value)}
                  />
                </label>
                <Button
                  className="w-full"
                  disabled={loading || (feeType === "school" ? amount <= 0 : cashAmount <= 0)}
                  onClick={handleRecordCash}
                >
                  {loading ? "Recording..." : "Record Cash Payment"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
};
