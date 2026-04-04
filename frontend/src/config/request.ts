import axios, { AxiosRequestConfig } from "axios";
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

apiRequest.interceptors.request.use((config) => {
  const signupTempToken = getSignupTempToken();
  const mfaTempToken = getMfaTempToken();
  const token = getAuthToken();
  const providerAuthToken = SecurityClient.getProviderAuthToken();

  if (config.headers) {
    if (mfaTempToken) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${mfaTempToken}`;
    } else if (token) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${token}`;
    } else if (signupTempToken) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${signupTempToken}`;
    } else if (providerAuthToken) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${providerAuthToken}`;
    }
  }

  return config;
});

let isRedirecting = false;

const resetRedirectingFlag = () => {
  isRedirecting = false;
};

let refreshPromise: Promise<string> | null = null;

const isTokenExpiredError = (message: string) => {
  const lower = message.toLowerCase();
  return lower.includes("token expired") || lower.includes("stalesession");
};

apiRequest.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response, config } = error;

    if (response && (response.status === 401 || response.status === 403)) {
      const currentToken = getAuthToken();
      const isAuthenticatedRequest = Boolean(currentToken);

      if (isAuthenticatedRequest) {
        const errorMessage = response.data?.message || "";

        // Attempt transparent token refresh on expiration
        if (
          isTokenExpiredError(errorMessage) &&
          !(config as AxiosRequestConfig & { _retry?: boolean })._retry
        ) {
          (config as AxiosRequestConfig & { _retry?: boolean })._retry = true;

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
            return apiRequest(config);
          } catch {
            // Refresh failed — fall through to redirect logic below
          }
        }

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
                expiry: formatISO(addSeconds(new Date(), 300)), // 5 minutes
                data: window.location.href
              })
            );
          } catch (err) {
            console.warn("Could not save redirect URL to sessionStorage:", err);
          }

          setTimeout(() => {
            window.location.href = "/login";
          }, 2000); // 2 seconds to read the notification

          setTimeout(resetRedirectingFlag, 3000);

          return Promise.reject(new Error("Session expired - redirecting to login"));
        }
      }
    }

    return Promise.reject(error);
  }
);
