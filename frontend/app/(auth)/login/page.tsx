"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type BaseSyntheticEvent, type ClipboardEvent, type JSX, type KeyboardEvent } from "react";
import {
  Controller,
  useForm,
  type Control,
  type UseFormRegister,
  type FieldErrors
} from "react-hook-form";
import { z } from "zod";

import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { getRoleDashboardPath, applyLoginUser, type UserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

const twoFactorSchema = z.object({
  code: z.string().min(6, "Enter a valid code")
});

const OTP_LENGTH = 6;

const OtpSixDigitInput = ({
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
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          name={`totp-digit-${index}`}
          aria-label={`Authentication code digit ${index + 1}`}
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

type LoginForm = z.infer<typeof loginSchema>;
type TwoFactorForm = z.infer<typeof twoFactorSchema>;

const INPUT_CLASS =
  "login-input h-[50px] w-full rounded-[9px] border border-[#D6D6D6] bg-white px-4 text-sm text-[#171717] outline-none transition placeholder:text-[#A3A3A3] focus:border-[#F97316] focus:ring-[3px] focus:ring-[#F97316]/15 md:h-[52px]";

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

interface LoginFormPanelProps {
  step: "credentials" | "2fa";
  useBackupCode: boolean;
  registerLogin: UseFormRegister<LoginForm>;
  control2fa: Control<TwoFactorForm>;
  register2fa: UseFormRegister<TwoFactorForm>;
  errors: FieldErrors<LoginForm>;
  errors2fa: FieldErrors<TwoFactorForm>;
  loginPending: boolean;
  verifyPending: boolean;
  loginError: boolean;
  onLoginSubmit: (e?: BaseSyntheticEvent) => void;
  on2faSubmit: (e?: BaseSyntheticEvent) => void;
  onForgotPassword: () => void;
  onRegisterHint: () => void;
  onUseBackupCode: () => void;
  onUseAuthenticator: () => void;
  onBackToLogin: () => void;
}

const LoginFormPanel = ({
  step,
  useBackupCode,
  registerLogin,
  control2fa,
  register2fa,
  errors,
  errors2fa,
  loginPending,
  verifyPending,
  loginError,
  onLoginSubmit,
  on2faSubmit,
  onForgotPassword,
  onRegisterHint,
  onUseBackupCode,
  onUseAuthenticator,
  onBackToLogin
}: LoginFormPanelProps): JSX.Element => {
  const [showPassword, setShowPassword] = useState(false);

  return (
  <div className="mx-auto w-full max-w-[430px]">
    {step === "credentials" ? (
      <>
        <p className="text-[10px] font-medium uppercase tracking-[3px] text-[#737373]">
          Welcome back
        </p>
        <h2 className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-[-1.2px] text-[#171717] md:mt-2 md:text-[30px] lg:text-[34px]">
          Sign in to your account
        </h2>
        <p className="mt-2 text-[14px] leading-snug text-[#737373] md:text-[15px] md:leading-normal">
          Access your school, manage with ease, and keep learning ahead.
        </p>

        <form className="mt-6 space-y-4 md:mt-7" onSubmit={onLoginSubmit}>
          <div>
            <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-[#171717]">
              Email or Username
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              {...registerLogin("email")}
              className={cn(
                INPUT_CLASS,
                errors.email && "border-red-500 focus:border-red-500 focus:ring-red-500/15"
              )}
              placeholder="Enter your email or username"
            />
            {errors.email && (
              <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-[13px] font-medium text-[#171717]">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                {...registerLogin("password")}
                className={cn(
                  INPUT_CLASS,
                  "pr-11",
                  errors.password && "border-red-500 focus:border-red-500 focus:ring-red-500/15"
                )}
                placeholder="Enter your password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-[#A3A3A3] transition hover:text-[#525252]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <EyeOff className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                ) : (
                  <Eye className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
                )}
              </button>
            </div>
            {errors.password && (
              <p className="mt-1.5 text-xs text-red-600">{errors.password.message}</p>
            )}
            <div className="mt-2 flex justify-end">
              <button
                type="button"
                onClick={onForgotPassword}
                className="text-xs font-medium text-[#F97316] transition hover:text-[#EA580C]"
              >
                Forgot password?
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loginPending}
            className="mt-1 flex h-[50px] w-full items-center justify-center rounded-[9px] border-0 bg-[#F97316] text-sm font-medium text-white transition hover:bg-[#EA580C] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 md:h-[52px]"
          >
            {loginPending ? "Signing in..." : "Sign In"}
          </button>

          {loginError && (
            <p className="text-center text-sm text-red-600">
              Invalid email or password. Please try again.
            </p>
          )}
        </form>

        <div className="mt-6 flex items-center gap-3 md:mt-5">
          <span className="h-px flex-1 bg-[#E5E5E5]" />
          <span className="text-[11px] font-medium text-[#A3A3A3]">OR</span>
          <span className="h-px flex-1 bg-[#E5E5E5]" />
        </div>

        <p className="mt-6 pb-1 text-center text-[13px] text-[#737373] md:mt-5 md:pb-0">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            onClick={onRegisterHint}
            className="cursor-pointer font-medium text-[#F97316] transition hover:text-[#EA580C]"
          >
            Register
          </button>
        </p>
      </>
    ) : (
      <>
        <p className="text-[10px] font-medium uppercase tracking-[3px] text-[#737373]">Security</p>
        <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-1.2px] text-[#171717] md:text-[34px]">
          Two-factor authentication
        </h2>
        <p className="mt-3 text-[15px] leading-normal text-[#737373]">
          {useBackupCode
            ? "Enter one of your backup codes."
            : "Enter the code from your authenticator app."}
        </p>

        <form
          key={useBackupCode ? "2fa-backup" : "2fa-totp"}
          className="mt-6 space-y-4 md:mt-7"
          autoComplete="off"
          onSubmit={on2faSubmit}
        >
          <div>
            <label
              htmlFor={useBackupCode ? "backup-code" : "totp-digit-0"}
              className="mb-2 block text-[13px] font-medium text-[#171717]"
            >
              {useBackupCode ? "Backup code" : "Authentication code"}
            </label>
            {useBackupCode ? (
              <input
                id="backup-code"
                type="text"
                autoComplete="off"
                spellCheck={false}
                {...register2fa("code")}
                className={cn(
                  INPUT_CLASS,
                  errors2fa.code && "border-red-500 focus:border-red-500 focus:ring-red-500/15"
                )}
                placeholder="XXXX-XXXX"
                maxLength={9}
              />
            ) : (
              <Controller
                name="code"
                control={control2fa}
                render={({ field }) => (
                  <OtpSixDigitInput
                    value={field.value ?? ""}
                    onChange={field.onChange}
                    hasError={!!errors2fa.code}
                  />
                )}
              />
            )}
            {!useBackupCode && (
              <p className="mt-2 text-xs text-[#A3A3A3]">Enter the 6-digit code from your app</p>
            )}
            {errors2fa.code && (
              <p className="mt-1.5 text-xs text-red-600">{errors2fa.code.message}</p>
            )}
          </div>

          <button
            type="submit"
            disabled={verifyPending}
            className="flex h-[50px] w-full items-center justify-center rounded-[9px] border-0 bg-[#F97316] text-sm font-medium text-white transition hover:bg-[#EA580C] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 md:h-[52px]"
          >
            {verifyPending ? "Verifying..." : "Verify"}
          </button>

          <div className="flex flex-col items-center gap-2 pt-2 text-[13px]">
            {!useBackupCode && (
              <button
                type="button"
                onClick={onUseBackupCode}
                className="font-medium text-[#F97316] hover:text-[#EA580C]"
              >
                Use backup code
              </button>
            )}
            {useBackupCode && (
              <button
                type="button"
                onClick={onUseAuthenticator}
                className="font-medium text-[#F97316] hover:text-[#EA580C]"
              >
                Use authenticator app
              </button>
            )}
            <button
              type="button"
              onClick={onBackToLogin}
              className="text-[#737373] hover:text-[#171717]"
            >
              Back to login
            </button>
          </div>
        </form>
      </>
    )}
  </div>
  );
};

const LoginRedirectOverlay = (): JSX.Element => (
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

type LoginUserPayload = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  organizationId: string | null;
};

const LoginPage = (): JSX.Element => {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    register: registerLogin,
    handleSubmit: handleLoginSubmit,
    formState: { errors }
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const {
    register: register2fa,
    control: control2fa,
    handleSubmit: handle2faSubmit,
    formState: { errors: errors2fa },
    reset: reset2fa
  } = useForm<TwoFactorForm>({
    resolver: zodResolver(twoFactorSchema),
    defaultValues: { code: "" }
  });

  useEffect(() => {
    if (step === "2fa") {
      reset2fa({ code: "" });
    }
  }, [step, reset2fa]);

  const completeLogin = (user: LoginUserPayload, requires2FASetup = false): void => {
    applyLoginUser(user);
    setIsRedirecting(true);
    if (user.role === "superAdmin" && requires2FASetup) {
      router.push("/super/settings/security?required=setup");
      return;
    }
    router.push(getRoleDashboardPath(user.role));
  };

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginForm) => {
      const response = await api.post("/api/auth/login", payload);
      return response.data as {
        requires2FA?: boolean;
        requires2FASetup?: boolean;
        user?: {
          id: string;
          name: string;
          email: string;
          role: UserRole;
          organizationId: string | null;
        };
      };
    },
    onSuccess: (result) => {
      if (result.requires2FA) {
        setStep("2fa");
        setUseBackupCode(false);
        reset2fa();
        return;
      }

      const user = result.user;
      if (!user) {
        showToast("error", "Login failed. Please try again.");
        return;
      }

      completeLogin(user, result.requires2FASetup);
    },
    onError: () => {
      showToast("error", "Invalid email or password");
    }
  });

  const verify2FAMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await api.post("/api/auth/verify-2fa", { code });
      return response.data as {
        user: {
          id: string;
          name: string;
          email: string;
          role: UserRole;
          organizationId: string | null;
        };
      };
    },
    onSuccess: (result) => {
      completeLogin(result.user);
    },
    onError: (error: unknown) => {
      const response = (error as { response?: { data?: { code?: string } } })?.response;
      const code = response?.data?.code;

      if (code === "2FA_SESSION_EXPIRED") {
        showToast("error", "Session expired, please login again");
        setStep("credentials");
        return;
      }

      if (code === "2FA_RATE_LIMITED") {
        showToast("error", "Too many attempts. Please login again.");
        setStep("credentials");
        return;
      }

      showToast("error", "Invalid code");
    }
  });

  const onBackToLogin = (): void => {
    setStep("credentials");
    setUseBackupCode(false);
    reset2fa();
  };

  const formPanelProps: LoginFormPanelProps = {
    step,
    useBackupCode,
    registerLogin,
    control2fa,
    register2fa,
    errors,
    errors2fa,
    loginPending: loginMutation.isPending,
    verifyPending: verify2FAMutation.isPending,
    loginError: loginMutation.isError,
    onLoginSubmit: handleLoginSubmit(
      (data) => loginMutation.mutate(data),
      () => {
        showToast("error", "Enter a valid email and password (min 6 characters)");
      }
    ),
    on2faSubmit: handle2faSubmit((data) => verify2FAMutation.mutate(data.code)),
    onForgotPassword: () => {
      showToast("info", "Contact your school administrator to reset your password.");
    },
    onRegisterHint: () => {
      showToast("info", "Contact your school administrator to request access.");
    },
    onUseBackupCode: () => {
      setUseBackupCode(true);
      reset2fa();
    },
    onUseAuthenticator: () => {
      setUseBackupCode(false);
      reset2fa();
    },
    onBackToLogin
  };

  return (
    <>
      {isRedirecting && <LoginRedirectOverlay />}
    <div className="flex h-full min-h-0 flex-col bg-[#F5F5F4] md:items-center md:justify-center md:bg-[#F5F5F4] md:p-4 lg:p-5">
      <div className="flex h-full min-h-0 w-full max-w-[1100px] flex-col md:h-[min(640px,calc(100dvh-2.5rem))] md:max-h-[calc(100dvh-2.5rem)] md:grid md:grid-cols-2 md:overflow-hidden md:rounded-[24px] md:bg-white md:shadow-[0_12px_40px_rgb(0,0,0,0.07)]">
        {/* Marketing / gradient panel */}
        <div className="relative min-h-[30vh] max-h-[38vh] shrink-0 overflow-hidden md:max-h-none md:min-h-0 md:h-full">
          <GradientBackdrop />

          {/* Mobile: compact header only */}
          <div className="relative z-10 px-6 pb-8 pt-[max(2.5rem,env(safe-area-inset-top))] md:hidden">
            <BrandHeader />
          </div>

          {/* Desktop: full marketing */}
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
                A complete school management platform for students, teachers, and parents.
              </p>
            </div>
          </div>
        </div>

        {/* Form panel — mobile bottom sheet */}
        <div className="relative z-10 -mt-6 flex min-h-0 flex-1 flex-col overflow-y-auto rounded-t-[28px] bg-white px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-8 shadow-[0_-8px_32px_rgb(0,0,0,0.08)] md:mt-0 md:flex md:items-center md:justify-center md:overflow-y-auto md:overscroll-contain md:rounded-none md:shadow-none md:px-8 md:py-6 lg:px-12 lg:py-8">
          <LoginFormPanel {...formPanelProps} />
        </div>
      </div>
    </div>
    </>
  );
};

export default LoginPage;
