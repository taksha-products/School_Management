import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";

import { clearUser } from "./auth";
import { dispatchSuperAdminTwoFactorGate } from "./twoFactorGate";

const resolveBaseUrl = (): string => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== "undefined") {
    return "";
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
};

export const api = axios.create({
  baseURL: resolveBaseUrl(),
  withCredentials: true
});

interface AuthErrorBody {
  code?: string;
  message?: string;
  error?: string;
}

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
};

let isRefreshing = false;
let refreshQueue: Array<(success: boolean) => void> = [];

const processRefreshQueue = (success: boolean): void => {
  refreshQueue.forEach((callback) => callback(success));
  refreshQueue = [];
};

const redirectToLogin = (): void => {
  clearUser();
  if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
    window.location.href = "/login";
  }
};

const refreshAccessToken = async (): Promise<boolean> => {
  try {
    await api.post("/api/auth/refresh");
    return true;
  } catch {
    return false;
  }
};

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<AuthErrorBody>) => {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    const originalRequest = error.config as RetryableRequestConfig | undefined;
    const requestUrl = String(originalRequest?.url ?? "");
    const isAuthLogin = requestUrl.includes("/api/auth/login");
    const isAuthRefresh = requestUrl.includes("/api/auth/refresh");
    const isAuthLogout = requestUrl.includes("/api/auth/logout");
    const isVerify2FA = requestUrl.includes("/api/auth/verify-2fa");
    const is2FAAuth = requestUrl.includes("/api/auth/2fa");

    if (
      status === 403 &&
      (code === "2FA_REQUIRED" || code === "2FA_SETUP_REQUIRED") &&
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/super") &&
      !is2FAAuth
    ) {
      dispatchSuperAdminTwoFactorGate(code);
      return Promise.reject(error);
    }

    if (
      status !== 401 ||
      !originalRequest ||
      isAuthLogin ||
      isAuthRefresh ||
      isAuthLogout ||
      isVerify2FA ||
      is2FAAuth
    ) {
      return Promise.reject(error);
    }

    if (code === "TOKEN_EXPIRED" && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          refreshQueue.push((success) => {
            if (success) {
              resolve(api(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshed = await refreshAccessToken();
      isRefreshing = false;
      processRefreshQueue(refreshed);

      if (refreshed) {
        return api(originalRequest);
      }

      redirectToLogin();
      return Promise.reject(error);
    }

    if (!isAuthLogin) {
      redirectToLogin();
    }

    return Promise.reject(error);
  }
);
