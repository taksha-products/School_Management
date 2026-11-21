"use client";

import {
  useRef,
  type ClipboardEvent,
  type JSX,
  type KeyboardEvent,
  type ReactNode
} from "react";

import { cn } from "@/lib/utils";

export const LOGIN_INPUT_CLASS =
  "login-input h-[50px] w-full rounded-[9px] border border-[#D6D6D6] bg-white px-4 text-sm text-[#171717] outline-none transition placeholder:text-[#A3A3A3] focus:border-[#F97316] focus:ring-[3px] focus:ring-[#F97316]/15 md:h-[52px]";

const OTP_LENGTH = 6;

export const OtpSixDigitInput = ({
  value,
  onChange,
  hasError
}: {
  value: string;
  onChange: (value: string) => void;
  hasError: boolean;
}): JSX.Element => {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const digits = (): string[] => {
    const chars = value.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
    while (chars.length < OTP_LENGTH) {
      chars.push("");
    }
    return chars;
  };

  const syncValue = (raw: string): void => {
    onChange(raw.replace(/\D/g, "").slice(0, OTP_LENGTH));
  };

  const handleDigitChange = (index: number, inputValue: string): void => {
    const cleaned = inputValue.replace(/\D/g, "");
    const current = digits();
    if (cleaned.length === 0) {
      current[index] = "";
      syncValue(current.join(""));
      return;
    }
    current[index] = cleaned[cleaned.length - 1] ?? "";
    syncValue(current.join(""));
    if (index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Backspace" && !digits()[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const next = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    onChange(next);
    const focusIndex = Math.min(Math.max(next.length - 1, 0), OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  const cellClass = cn(
    "login-input h-[52px] min-w-0 flex-1 rounded-[9px] border border-[#D6D6D6] bg-white text-center text-xl font-semibold tabular-nums text-[#171717] outline-none transition focus:border-[#F97316] focus:ring-[3px] focus:ring-[#F97316]/15",
    hasError && "border-red-500 focus:border-red-500 focus:ring-red-500/15"
  );

  return (
    <div className="flex gap-1.5 sm:gap-2" onPaste={handlePaste}>
      {digits().map((digit, index) => (
        <input
          key={`otp-${index}`}
          ref={(element) => {
            inputRefs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          autoCorrect="off"
          spellCheck={false}
          name={`otp-digit-${index}`}
          aria-label={`OTP digit ${index + 1}`}
          maxLength={1}
          value={digit}
          className={cellClass}
          onChange={(event) => handleDigitChange(index, event.target.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
        />
      ))}
    </div>
  );
};

const GradientBackdrop = (): JSX.Element => (
  <>
    <div
      className="absolute inset-0 bg-cover bg-center bg-no-repeat"
      style={{ backgroundImage: "url(/images/loginBG.png)" }}
      aria-hidden
    />
    <div
      className="pointer-events-none absolute inset-0 opacity-[0.35] mix-blend-overlay"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`
      }}
      aria-hidden
    />
  </>
);

const BrandHeader = (): JSX.Element => (
  <div>
    <p className="text-[25px] font-semibold leading-tight text-white">EduNex</p>
    <p className="mt-1 text-[9px] font-medium uppercase tracking-[3px] text-white/90">
      School Management
    </p>
  </div>
);

export const LoginRedirectOverlay = (): JSX.Element => (
  <div
    className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/95 px-6 backdrop-blur-[2px]"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div
      className="h-11 w-11 animate-spin rounded-full border-[3px] border-[#F97316]/25 border-t-[#F97316]"
      aria-hidden
    />
    <p className="mt-5 text-base font-semibold text-[#171717]">Signed in successfully</p>
    <p className="mt-1.5 text-sm text-[#737373]">Loading your dashboard…</p>
  </div>
);

/**
 * Shared two-panel login chrome for staff and parent sign-in pages.
 */
export const LoginShell = ({
  marketingLine,
  children,
  isRedirecting
}: {
  marketingLine: string;
  children: ReactNode;
  isRedirecting?: boolean;
}): JSX.Element => (
  <>
    {isRedirecting && <LoginRedirectOverlay />}
    <div className="flex h-full min-h-0 flex-col bg-[#F5F5F4] md:items-center md:justify-center md:bg-[#F5F5F4] md:p-4 lg:p-5">
      <div className="flex h-full min-h-0 w-full max-w-[1100px] flex-col md:h-[min(640px,calc(100dvh-2.5rem))] md:max-h-[calc(100dvh-2.5rem)] md:grid md:grid-cols-2 md:overflow-hidden md:rounded-[24px] md:bg-white md:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
        <div className="relative min-h-[30vh] max-h-[38vh] shrink-0 overflow-hidden md:max-h-none md:min-h-0 md:h-full">
          <GradientBackdrop />
          <div className="relative z-10 px-6 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))] md:hidden">
            <BrandHeader />
          </div>
          <div className="relative z-10 hidden h-full min-h-0 flex-col justify-between p-8 lg:p-10 xl:p-12 md:flex">
            <BrandHeader />
            <div className="pb-1">
              <p className="text-[10px] font-medium uppercase tracking-[4px] text-white/90">
                Simpler Schools
              </p>
              <h1 className="mt-2 text-[40px] font-semibold leading-[0.98] tracking-[-2px] text-white lg:mt-3 lg:text-[48px] xl:text-[52px]">
                Brighter
                <br />
                Tomorrows.
              </h1>
              <p className="mt-3 max-w-[360px] text-[14px] font-normal leading-normal text-white/90 lg:mt-4 lg:text-[15px]">
                {marketingLine}
              </p>
            </div>
          </div>
        </div>

        <div className="relative z-10 -mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[28px] bg-white px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-8px_32px_rgb(0,0,0,0.08)] md:mt-0 md:flex md:items-center md:justify-center md:overflow-y-auto md:overscroll-contain md:rounded-none md:shadow-none md:px-8 md:py-6 lg:px-12 lg:py-8">
          <div className="mx-auto w-full max-w-[430px]">{children}</div>
        </div>
      </div>
    </div>
  </>
);
