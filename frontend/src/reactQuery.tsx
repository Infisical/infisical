import { MutationCache, QueryClient } from "@tanstack/react-query";
import axios from "axios";

import { createNotification } from "@app/components/notifications";

import { ApiErrorTypes, TApiErrors } from "./hooks/api/types";

// this is saved in react-query cache
export const SIGNUP_TEMP_TOKEN_CACHE_KEY = ["infisical__signup-temp-token"];
export const MFA_TEMP_TOKEN_CACHE_KEY = ["infisical__mfa-temp-token"];
export const AUTH_TOKEN_CACHE_KEY = ["infisical__auth-token"];

export const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (error) => {
      if (axios.isAxiosError(error)) {
        const serverResponse = error.response?.data as TApiErrors;
        if (serverResponse?.error === ApiErrorTypes.ValidationError) {
          createNotification({
            title: "Validation Error",
            type: "error",
            text: (
              <div>
                {serverResponse.message?.map(({ message, path }) => (
                  <div className="flex space-y-2" key={path.join(".")}>
                    <div>
                      Field <i>{path.join(".")}</i> {message.toLowerCase()}
                    </div>
                  </div>
                ))}
              </div>
            )
          });
          return;
        }
        if (serverResponse.statusCode === 401) {
          createNotification({
            title: "Forbidden Access",
            type: "error",
            text: serverResponse.message
          });
          return;
        }
        createNotification({ title: "Bad Request", type: "error", text: serverResponse.message });
      }
    }
  }),
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1
    }
  }
});

// memory token storage will be moved to apiRequest module until securityclient is completely depreciated
// then all the getters will be also hidden scoped to apiRequest only
const MemoryTokenStorage = () => {
  let authToken: string;

  return {
    setToken: (token: string) => {
      authToken = token;
    },
    getToken: () => authToken
  };
};

const signUpTempTokenStorage = MemoryTokenStorage();
const mfaAuthTokenStorage = MemoryTokenStorage();
const authTokenStorage = MemoryTokenStorage();

// set token in memory cache
export const setSignupTempToken = signUpTempTokenStorage.setToken;

export const setMfaTempToken = mfaAuthTokenStorage.setToken;

export const setAuthToken = authTokenStorage.setToken;

export const getSignupTempToken = signUpTempTokenStorage.getToken;
export const getMfaTempToken = mfaAuthTokenStorage.getToken;
export const getAuthToken = authTokenStorage.getToken;

export const isLoggedIn = () => Boolean(getAuthToken());
