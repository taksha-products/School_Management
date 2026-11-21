"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type JSX } from "react";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import {
  LOGIN_INPUT_CLASS,
  LoginShell,
  OtpSixDigitInput
} from "@/components/auth/LoginShell";
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

type LoginForm = z.infer<typeof loginSchema>;
type TwoFactorForm = z.infer<typeof twoFactorSchema>;

type LoginUserPayload = {
  id: string;
  name: string;
  email?: string;
  role: UserRole;
  organizationId: string | null;
};

/**
 * Staff / org admin / super admin email+password login.
 * Parents use /parent/login (mobile OTP only).
 */
const StaffLoginPage = (): JSX.Element => {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<"credentials" | "2fa">("credentials");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    register,
    handleSubmit,
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
    if (user.role === "parent") {
      showToast("info", "Parents sign in at the parent login page.");
      router.replace("/parent/login");
      return;
    }
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
        user?: LoginUserPayload;
      };
    },
    onSuccess: (result) => {
      if (result.requires2FA) {
        setStep("2fa");
        setUseBackupCode(false);
        reset2fa();
        return;
      }
      if (!result.user) {
        showToast("error", "Login failed. Please try again.");
        return;
      }
      completeLogin(result.user, result.requires2FASetup);
    },
    onError: (error: unknown) => {
      const data = (error as { response?: { data?: { code?: string; message?: string } } })
        ?.response?.data;
      if (data?.code === "PARENT_OTP_REQUIRED") {
        showToast("info", "Parents sign in with mobile OTP.");
        router.replace("/parent/login");
        return;
      }
      showToast("error", data?.message ?? "Invalid email or password");
    }
  });

  const verify2FAMutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await api.post("/api/auth/verify-2fa", { code });
      return response.data as { user: LoginUserPayload };
    },
    onSuccess: (result) => completeLogin(result.user),
    onError: (error: unknown) => {
      const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "2FA_SESSION_EXPIRED" || code === "2FA_RATE_LIMITED") {
        showToast("error", "Session expired, please login again");
        setStep("credentials");
        return;
      }
      showToast("error", "Invalid code");
    }
  });

  return (
    <LoginShell
      isRedirecting={isRedirecting}
      marketingLine="School admins, staff, and platform operators sign in with email and password."
    >
      {step === "credentials" ? (
        <>
          <p className="text-[10px] font-medium uppercase tracking-[3px] text-[#737373]">
            Staff &amp; admin
          </p>
          <h2 className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-[-1.2px] text-[#171717] md:text-[30px] lg:text-[34px]">
            Sign in to your account
          </h2>
          <p className="mt-2 text-[14px] leading-snug text-[#737373] md:text-[15px]">
            For school staff, org admins, and super admins.
          </p>

          <form
            className="mt-6 space-y-4 md:mt-7"
            onSubmit={handleSubmit(
              (data) => loginMutation.mutate(data),
              () => showToast("error", "Enter a valid email and password")
            )}
          >
            <div>
              <label htmlFor="email" className="mb-2 block text-[13px] font-medium text-[#171717]">
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                {...register("email")}
                className={cn(
                  LOGIN_INPUT_CLASS,
                  errors.email && "border-red-500 focus:border-red-500 focus:ring-red-500/15"
                )}
                placeholder="Enter your email"
              />
              {errors.email && (
                <p className="mt-1.5 text-xs text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-2 block text-[13px] font-medium text-[#171717]"
              >
                Password
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  {...register("password")}
                  className={cn(
                    LOGIN_INPUT_CLASS,
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
                  onClick={() =>
                    showToast("info", "Contact your school administrator to reset your password.")
                  }
                  className="text-xs font-medium text-[#F97316] transition hover:text-[#EA580C]"
                >
                  Forgot password?
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="mt-1 flex h-[50px] w-full items-center justify-center rounded-[9px] border-0 bg-[#F97316] text-sm font-medium text-white transition hover:bg-[#EA580C] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-70 md:h-[52px]"
            >
              {loginMutation.isPending ? "Signing in..." : "Sign In"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[#737373]">
            Parent?{" "}
            <Link
              href="/parent/login"
              className="font-medium text-[#F97316] transition hover:text-[#EA580C]"
            >
              Sign in with mobile OTP
            </Link>
          </p>
        </>
      ) : (
        <>
          <p className="text-[10px] font-medium uppercase tracking-[3px] text-[#737373]">
            Security
          </p>
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
            onSubmit={handle2faSubmit((data) => verify2FAMutation.mutate(data.code))}
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
                    LOGIN_INPUT_CLASS,
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
              {errors2fa.code && (
                <p className="mt-1.5 text-xs text-red-600">{errors2fa.code.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={verify2FAMutation.isPending}
              className="flex h-[50px] w-full items-center justify-center rounded-[9px] border-0 bg-[#F97316] text-sm font-medium text-white transition hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-70 md:h-[52px]"
            >
              {verify2FAMutation.isPending ? "Verifying..." : "Verify"}
            </button>

            <div className="flex flex-col items-center gap-2 pt-2 text-[13px]">
              {!useBackupCode ? (
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(true);
                    reset2fa();
                  }}
                  className="font-medium text-[#F97316] hover:text-[#EA580C]"
                >
                  Use backup code
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(false);
                    reset2fa();
                  }}
                  className="font-medium text-[#F97316] hover:text-[#EA580C]"
                >
                  Use authenticator app
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setStep("credentials");
                  setUseBackupCode(false);
                  reset2fa();
                }}
                className="text-[#737373] hover:text-[#171717]"
              >
                Back to login
              </button>
            </div>
          </form>
        </>
      )}
    </LoginShell>
  );
};

export default StaffLoginPage;
