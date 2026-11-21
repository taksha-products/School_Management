"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type JSX } from "react";
import { useForm } from "react-hook-form";
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

const parentPhoneSchema = z.object({
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit Indian mobile number")
});

type ParentPhoneForm = z.infer<typeof parentPhoneSchema>;
type ParentStep = "phone" | "otp" | "school";

type LoginUserPayload = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role: UserRole;
  organizationId: string | null;
};

interface ParentSchoolOption {
  orgCode: string;
  orgName: string;
  organizationId: string;
  parentUserId: string;
  children: Array<{ id: string; name: string; grade: string }>;
}

/**
 * Parent-only login via mobile OTP. No email/password.
 */
const ParentLoginPage = (): JSX.Element => {
  const router = useRouter();
  const { showToast } = useToast();
  const [step, setStep] = useState<ParentStep>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [debugOtp, setDebugOtp] = useState<string | undefined>();
  const [selectionToken, setSelectionToken] = useState<string | null>(null);
  const [schools, setSchools] = useState<ParentSchoolOption[]>([]);
  const [isRedirecting, setIsRedirecting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset
  } = useForm<ParentPhoneForm>({
    resolver: zodResolver(parentPhoneSchema),
    defaultValues: { phone: "" }
  });

  const completeLogin = (user: LoginUserPayload): void => {
    applyLoginUser(user);
    setIsRedirecting(true);
    router.push(getRoleDashboardPath(user.role));
  };

  const resetFlow = (): void => {
    setStep("phone");
    setPhone("");
    setOtp("");
    setDebugOtp(undefined);
    setSelectionToken(null);
    setSchools([]);
    reset({ phone: "" });
  };

  const requestOtpMutation = useMutation({
    mutationFn: async (nextPhone: string) => {
      const response = await api.post("/api/auth/otp/request", { phone: nextPhone });
      return response.data as { message?: string; debugOtp?: string };
    },
    onSuccess: (result, nextPhone) => {
      setPhone(nextPhone);
      setOtp("");
      setDebugOtp(result.debugOtp);
      setStep("otp");
      showToast("success", result.message ?? "OTP sent if this number is registered");
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Unable to send OTP";
      showToast("error", message);
    }
  });

  const verifyOtpMutation = useMutation({
    mutationFn: async (payload: { phone: string; otp: string }) => {
      const response = await api.post("/api/auth/otp/verify", payload);
      return response.data as {
        requiresSchoolSelection?: boolean;
        selectionToken?: string;
        schools?: ParentSchoolOption[];
        user?: LoginUserPayload;
      };
    },
    onSuccess: (result) => {
      if (result.requiresSchoolSelection && result.selectionToken && result.schools) {
        setSelectionToken(result.selectionToken);
        setSchools(result.schools);
        setStep("school");
        showToast("info", "Select a school to continue");
        return;
      }
      if (!result.user) {
        showToast("error", "Login failed. Please try again.");
        return;
      }
      completeLogin(result.user);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Invalid OTP";
      showToast("error", message);
    }
  });

  const selectSchoolMutation = useMutation({
    mutationFn: async (orgCode: string) => {
      if (!selectionToken) {
        throw new Error("Missing selection token");
      }
      const response = await api.post("/api/auth/otp/select-school", {
        selectionToken,
        orgCode
      });
      return response.data as { user?: LoginUserPayload };
    },
    onSuccess: (result) => {
      if (!result.user) {
        showToast("error", "School selection failed");
        return;
      }
      completeLogin(result.user);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "School selection expired. Request OTP again.";
      showToast("error", message);
      resetFlow();
    }
  });

  return (
    <LoginShell
      isRedirecting={isRedirecting}
      marketingLine="Parents sign in with their registered mobile number and OTP."
    >
      {step === "school" ? (
        <>
          <p className="text-[10px] font-medium uppercase tracking-[3px] text-[#737373]">
            Choose school
          </p>
          <h2 className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-[-1.2px] text-[#171717] md:text-[30px]">
            Choose your school
          </h2>
          <p className="mt-2 text-[14px] text-[#737373]">
            This mobile number is linked to more than one school.
          </p>
          <div className="mt-6 space-y-3">
            {schools.map((school) => (
              <button
                key={school.organizationId}
                type="button"
                disabled={selectSchoolMutation.isPending}
                onClick={() => selectSchoolMutation.mutate(school.orgCode)}
                className="w-full rounded-[12px] border border-[#E5E5E5] bg-white px-4 py-3 text-left transition hover:border-[#F97316] hover:bg-[#FFF7ED] disabled:opacity-60"
              >
                <p className="text-sm font-semibold text-[#171717]">{school.orgName}</p>
                  <p className="mt-1 text-xs text-[#737373]">
                  {school.children.length > 0
                    ? school.children.map((c) => `${c.name} · Gr ${c.grade}`).join(" · ")
                    : "No active children listed"}
                </p>
              </button>
            ))}
          </div>
        </>
      ) : step === "otp" ? (
        <>
          <p className="text-[10px] font-medium uppercase tracking-[3px] text-[#737373]">
            Parent login
          </p>
          <h2 className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-[-1.2px] text-[#171717] md:text-[30px]">
            Enter verification code
          </h2>
          <p className="mt-2 text-[14px] text-[#737373]">
            Code sent to <span className="font-medium text-[#171717]">+91 {phone}</span>
          </p>

          <div className="mt-6 space-y-4">
            <OtpSixDigitInput value={otp} onChange={setOtp} hasError={false} />
            {debugOtp && <p className="text-xs text-[#A3A3A3]">Dev OTP: {debugOtp}</p>}
            <button
              type="button"
              disabled={verifyOtpMutation.isPending || otp.length !== 6}
              onClick={() => verifyOtpMutation.mutate({ phone, otp })}
              className="flex h-[50px] w-full items-center justify-center rounded-[9px] border-0 bg-[#F97316] text-sm font-medium text-white transition hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-70 md:h-[52px]"
            >
              {verifyOtpMutation.isPending ? "Verifying..." : "Verify & continue"}
            </button>
            <div className="flex flex-col items-center gap-2 text-[13px]">
              <button
                type="button"
                onClick={() => requestOtpMutation.mutate(phone)}
                disabled={requestOtpMutation.isPending}
                className="font-medium text-[#F97316] hover:text-[#EA580C] disabled:opacity-60"
              >
                Resend OTP
              </button>
              <button
                type="button"
                onClick={resetFlow}
                className="text-[#737373] hover:text-[#171717]"
              >
                Change mobile number
              </button>
            </div>
          </div>
        </>
      ) : (
        <>
          <p className="text-[10px] font-medium uppercase tracking-[3px] text-[#737373]">
            Parent login
          </p>
          <h2 className="mt-2 text-[26px] font-semibold leading-[1.1] tracking-[-1.2px] text-[#171717] md:text-[30px] lg:text-[34px]">
            Welcome, parent
          </h2>
          <p className="mt-2 text-[14px] leading-snug text-[#737373] md:text-[15px]">
            Sign in with your registered mobile number. No email needed.
          </p>

          <form
            className="mt-6 space-y-4 md:mt-7"
            onSubmit={handleSubmit(
              (data) => requestOtpMutation.mutate(data.phone),
              () => showToast("error", "Enter a valid 10-digit Indian mobile number")
            )}
          >
            <div>
              <label
                htmlFor="parent-phone"
                className="mb-2 block text-[13px] font-medium text-[#171717]"
              >
                Mobile number
              </label>
              <div className="flex gap-2">
                <span className="flex h-[50px] shrink-0 items-center rounded-[9px] border border-[#E5E5E5] bg-[#FAFAFA] px-3 text-sm font-medium text-[#171717] md:h-[52px]">
                  +91
                </span>
                <input
                  id="parent-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  {...register("phone")}
                  className={cn(
                    LOGIN_INPUT_CLASS,
                    "flex-1",
                    errors.phone && "border-red-500 focus:border-red-500 focus:ring-red-500/15"
                  )}
                  placeholder="10-digit mobile number"
                  maxLength={10}
                />
              </div>
              {errors.phone && (
                <p className="mt-1.5 text-xs text-red-600">{errors.phone.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={requestOtpMutation.isPending}
              className="flex h-[50px] w-full items-center justify-center rounded-[9px] border-0 bg-[#F97316] text-sm font-medium text-white transition hover:bg-[#EA580C] disabled:cursor-not-allowed disabled:opacity-70 md:h-[52px]"
            >
              {requestOtpMutation.isPending ? "Sending OTP..." : "Send OTP"}
            </button>
          </form>

          <p className="mt-6 text-center text-[13px] text-[#737373]">
            School staff?{" "}
            <Link
              href="/login"
              className="font-medium text-[#F97316] transition hover:text-[#EA580C]"
            >
              Sign in with email
            </Link>
          </p>
        </>
      )}
    </LoginShell>
  );
};

export default ParentLoginPage;
