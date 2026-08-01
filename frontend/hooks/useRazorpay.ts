"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useToast } from "@/components/ui/Toast";

declare global {
  interface Window {
    Razorpay: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export interface RazorpayOptions {
  key: string;
  amount: number;
  currency: string;
  order_id: string;
  name: string;
  description: string;
  image?: string;
  handler: (response: RazorpayResponse) => void;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  modal?: { ondismiss?: () => void };
}

export interface RazorpayResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

export interface RazorpayInstance {
  open(): void;
  close(): void;
}

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

let scriptPromise: Promise<void> | null = null;

const loadRazorpayScript = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Razorpay is only available in the browser"));
  }
  if (window.Razorpay) {
    return Promise.resolve();
  }
  if (scriptPromise) {
    return scriptPromise;
  }

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay")));
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.body.appendChild(script);
  });

  return scriptPromise;
};

/**
 * Loads Razorpay checkout.js script and returns a function to open checkout.
 * Script is loaded once and reused across components.
 */
export function useRazorpay(): {
  isLoaded: boolean;
  loadError: string | null;
  openCheckout: (options: RazorpayOptions) => void;
} {
  const { showToast } = useToast();
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const toastShown = useRef(false);

  useEffect(() => {
    loadRazorpayScript()
      .then(() => {
        setIsLoaded(true);
        setLoadError(null);
      })
      .catch(() => {
        setLoadError("Payment system unavailable");
        if (!toastShown.current) {
          toastShown.current = true;
          showToast("error", "Payment system unavailable");
        }
      });
  }, [showToast]);

  const openCheckout = useCallback(
    (options: RazorpayOptions) => {
      if (!isLoaded || !window.Razorpay) {
        showToast("error", "Payment system unavailable");
        return;
      }
      const instance = new window.Razorpay(options);
      instance.open();
    },
    [isLoaded, showToast]
  );

  return { isLoaded, loadError, openCheckout };
}
