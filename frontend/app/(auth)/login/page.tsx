"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { BusFront, Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { getRoleDashboardPath, saveToken, type UserRole } from "@/lib/auth";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(6, "Password must be at least 6 characters")
});

type LoginForm = z.infer<typeof loginSchema>;

const features = [
  "Bus fee & school fee tracking",
  "Multi-role access control",
  "Real-time financial reports"
] as const;

const LoginPage = (): JSX.Element => {
  const router = useRouter();
  const { showToast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const loginMutation = useMutation({
    mutationFn: async (payload: LoginForm) => {
      const response = await api.post("/api/auth/login", payload);
      return response.data;
    },
    onSuccess: (result) => {
      const token = result?.data?.token as string;
      const role = result?.data?.role as UserRole;
      saveToken(token);
      showToast("success", "Logged in successfully");
      router.push(getRoleDashboardPath(role));
    },
    onError: () => {
      showToast("error", "Invalid email or password");
    }
  });

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-[40%] flex-col items-center justify-center bg-primary px-10 lg:flex">
        <div className="max-w-sm text-center text-white">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15">
            <BusFront className="h-10 w-10 text-white" strokeWidth={1.5} />
          </div>
          <h1 className="text-[32px] font-bold">BusTrack</h1>
          <p className="mt-2 text-sm text-white/85">
            School transport &amp; fees management
          </p>
          <ul className="mt-10 space-y-4 text-left text-sm text-white/90">
            {features.map((text) => (
              <li key={text} className="flex items-center gap-3">
                <Check className="h-4 w-4 shrink-0 text-white" strokeWidth={3} />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center bg-white p-6">
        <div className="w-full max-w-[380px]">
          <div className="mb-8 flex items-center gap-2 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
              <BusFront className="h-5 w-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900">BusTrack</span>
          </div>

          <h2 className="text-2xl font-bold text-gray-900">Welcome back</h2>
          <p className="mt-1 text-sm text-gray-500">Sign in to your account</p>

          <form
            className="mt-8 space-y-5"
            onSubmit={handleSubmit((data) => loginMutation.mutate(data))}
          >
            <div>
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                {...register("email")}
                className={inputClass(!!errors.email)}
                placeholder="you@school.com"
              />
              {errors.email && (
                <p className="form-error">{errors.email.message}</p>
              )}
            </div>
            <div>
              <label className="form-label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                {...register("password")}
                className={inputClass(!!errors.password)}
                placeholder="••••••••"
              />
              {errors.password && (
                <p className="form-error">{errors.password.message}</p>
              )}
            </div>
            <Button
              type="submit"
              className="h-[42px] w-full"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </Button>
            {loginMutation.isError && (
              <p className="text-center text-sm text-red-600">
                Invalid email or password. Please try again.
              </p>
            )}
          </form>

          <p className="mt-8 text-center text-xs text-gray-400">
            Demo: super@bustrack.com · admin@demoschool.com · staff@demoschool.com ·
            parent@demoschool.com
          </p>
        </div>
      </div>
    </div>
  );
};

const inputClass = (hasError: boolean): string =>
  cn("form-input", hasError && "form-input-error");

export default LoginPage;
