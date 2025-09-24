import axios from "axios";
import { addSeconds, formatISO } from "date-fns";

import { createNotification } from "@app/components/notifications";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { SessionStorageKeys } from "@app/const";
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
    if (signupTempToken) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${signupTempToken}`;
    } else if (mfaTempToken) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${mfaTempToken}`;
    } else if (token) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${token}`;
    } else if (providerAuthToken) {
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `Bearer ${providerAuthToken}`;
    }
  }

  return config;
});

let isRedirecting = false;

apiRequest.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { response } = error;

    if (response && (response.status === 401 || response.status === 403)) {
      const currentToken = getAuthToken();
      const isAuthenticatedRequest = Boolean(currentToken);

      if (isAuthenticatedRequest && !isRedirecting) {
        // Check if the error indicates token expiration
        const errorMessage = response.data?.message || "";
        const isTokenExpired =
          response.status === 401 ||
          (errorMessage.toLowerCase().includes("token") &&
            (errorMessage.toLowerCase().includes("expired") ||
              errorMessage.toLowerCase().includes("invalid") ||
              errorMessage.toLowerCase().includes("unauthorized")));

        if (isTokenExpired) {
          isRedirecting = true;

          setAuthToken("");
          SecurityClient.setToken("");

          createNotification({
            type: "error",
            title: "Session Expired",
            text: "Your session has expired. Redirecting to login page..."
          });

          sessionStorage.setItem(
            SessionStorageKeys.ORG_LOGIN_SUCCESS_REDIRECT_URL,
            JSON.stringify({
              expiry: formatISO(addSeconds(new Date(), 300)), // 5 minutes
              data: window.location.href
            })
          );

          setTimeout(() => {
            window.location.href = "/login";
          }, 5000); // 5 seconds to read the notification

          return Promise.reject(new Error("Session expired - redirecting to login"));
        }
      }
    }

    return Promise.reject(error);
  }
);
