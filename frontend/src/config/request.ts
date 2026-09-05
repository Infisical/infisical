import axios, { AxiosHeaders, AxiosRequestConfig } from "axios";
import { addSeconds, formatISO } from "date-fns";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { SessionStorageKeys } from "@app/const";
import { fetchAuthToken } from "@app/hooks/api/auth/refresh";
import {
  getAuthToken,
  getMfaTempToken,
  getSignupTempToken,
  setAuthToken
} from "@app/hooks/api/reactQuery";

export const apiRequest = axios.create({
  baseURL: "/",
  headers: {
    "Content-Type": "application/json"
  }
});

const TOKEN_EXPIRED_MESSAGE = "your token has expired. please re-authenticate.";

const getAuthorizationHeader = (config?: AxiosRequestConfig) => {
  const headers = config?.headers;
  const header = headers instanceof AxiosHeaders ? headers.get("Authorization") : undefined;
  if (typeof header === "string") return header;
  if (typeof headers?.Authorization === "string") return headers.Authorization;
  if (typeof headers?.authorization === "string") return headers.authorization;
  return undefined;
};

apiRequest.interceptors.request.use((config) => {
  // Skip auto-injection if the caller already set an Authorization header
  if (getAuthorizationHeader(config)) return config;

  const signupTempToken = getSignupTempToken();
  const mfaTempToken = getMfaTempToken();
  const token = getAuthToken();

  if (config.headers) {
    if (mfaTempToken) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${mfaTempToken}`;
    } else if (signupTempToken) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${signupTempToken}`;
    } else if (token) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  return config;
});

let isRedirecting = false;

const resetRedirectingFlag = () => {
  isRedirecting = false;
};

let refreshPromise: Promise<string> | null = null;

export const isTokenExpiredError = (data?: { message?: string; error?: string } | string) => {
  if (!data) return false;

  if (typeof data === "string") {
    const lower = data.toLowerCase();
    return lower.includes("token expired") || lower.includes("stalesession");
  }

  if (data.error === "TokenError") return data.message?.toLowerCase() === TOKEN_EXPIRED_MESSAGE;
  if (data.error === "StaleSession") return true;
  if (data.error) return false;

  const lower = data.message?.toLowerCase() || "";
  return lower.includes("token expired") || lower.includes("stalesession");
};

apiRequest.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;
    const currentToken = getAuthToken();
    const reqAuthHeader = getAuthorizationHeader(config);
    const isSessionToken = Boolean(currentToken && reqAuthHeader === `Bearer ${currentToken}`);

    if (
      response &&
      (response.status === 401 || response.status === 403) &&
      isTokenExpiredError(response.data) &&
      isSessionToken &&
      !(config as AxiosRequestConfig & { infisicalRetry?: boolean }).infisicalRetry
    ) {
      (config as AxiosRequestConfig & { infisicalRetry?: boolean }).infisicalRetry = true;

      try {
        // Deduplicate concurrent refresh attempts
        if (!refreshPromise) {
          refreshPromise = fetchAuthToken()
            .then((data) => data.token)
            .finally(() => {
              refreshPromise = null;
            });
        }

        const newToken = await refreshPromise;

        // Retry the original request with the new token
        // eslint-disable-next-line no-param-reassign
        config.headers.Authorization = `Bearer ${newToken}`;
        return await apiRequest(config);
      } catch {
        // Refresh failed — clear session and redirect to login
        if (!isRedirecting) {
          isRedirecting = true;

          try {
            setAuthToken("");
            SecurityClient.setToken("");
          } catch (err) {
            console.warn("Error clearing tokens:", err);
          }

          createNotification({
            type: "error",
            title: "Session Expired",
            text: "Your session has expired. Redirecting to login page..."
          });

          try {
            sessionStorage.setItem(
              SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL,
              JSON.stringify({
                expiry: formatISO(addSeconds(new Date(), 300)),
                data: window.location.href
              })
            );
          } catch (err) {
            console.warn("Could not save redirect URL to sessionStorage:", err);
          }

          setTimeout(() => {
            window.location.href = "/login";
          }, 2000);

          setTimeout(resetRedirectingFlag, 3000);

          return Promise.reject(new Error("Session expired - redirecting to login"));
        }
      }
    }

    return Promise.reject(error);
  }
);
