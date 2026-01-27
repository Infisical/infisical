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
  const token = getAuthToken()
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

const resetRedirectingFlag = () => {
  isRedirecting = false;
};

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
        const isTokenExpired = errorMessage
          .toLowerCase()
          .includes("your token has expired. please re-authenticate.");

        if (isTokenExpired) {
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
